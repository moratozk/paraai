#include "Atendimento.h"
#include "LogicaTotem.h"
#include "Credenciais.h"
#include "RaizesGoogle.h"
#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <Firebase_ESP_Client.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <esp_system.h>
#include <time.h>
#include <atomic>
#include <cerrno>
#include <cstddef>

// Acesso fixo é opcional: sem ele, o totem é instalado por código na tela.
#ifndef TOTEM_EMAIL
#define TOTEM_EMAIL ""
#endif
#ifndef TOTEM_PASSWORD
#define TOTEM_PASSWORD ""
#endif
#ifndef ESTACIONAMENTO_ID
#define ESTACIONAMENTO_ID ""
#endif

namespace {
// Pátio deste totem, do Credenciais.h ou do código de instalação. Só a tarefa
// de rede usa depois de iniciarAtendimento.
String estacionamentoId;
String PATIO;           // "estacionamentos/<id>"
// Projeção pública do mapa: o app marca reservas aqui e o totem espelha a ocupação.
String VAGAS_PUBLICAS;  // "catalogoEstacionamentos/<id>/vagas"
std::atomic<OrigemIdentidade> origem{OrigemIdentidade::NENHUMA};
constexpr uint32_t HEARTBEAT_MS = 60000;
constexpr uint32_t RETENTATIVA_MS = 15000;
struct Solicitacao { PedidoTotem tipo; char placa[8]; char codigo[paraai::CODIGO_INSTALACAO_TAMANHO + 1]; };
QueueHandle_t pedidos = nullptr, respostas = nullptr, statusFila = nullptr;
SemaphoreHandle_t exclusao = nullptr;
bool pausado = false; // Somente a tarefa da UI acessa esta variável.
bool pedidoPendente = false; // No máximo um atendimento até a UI consumir a resposta.
FirebaseData fb;
FirebaseAuth auth;
FirebaseConfig config;
bool iniciado = false, relogioIniciado = false;
int capacidade = 0;
double tarifa = 0;
uint32_t ultimoHeartbeat = 0, ultimaTentativa = 0;
bool sincronizado = false;
bool patioValidado = false;
bool configuracaoInvalida = false; // Pátio/totem recusado ou fora do formato.
bool servidorSemResposta = false;  // Última sincronização falhou por rede.
bool repetirPedido = false;        // Gravação recusada sem efeito: repetir 1x.

void estado(ConexaoTotem conexao, const char* etapa = "") {
  StatusTotem s{};
  s.conexao = conexao;
  snprintf(s.etapa, sizeof(s.etapa), "%s", etapa);
  xQueueOverwrite(statusFila, &s);
}
RespostaTotem resposta(TipoResposta tipo, const char* titulo,
                       const String& detalhe = "", const String& ajuda = "",
                       const String& carro = "") {
  RespostaTotem r{};
  r.tipo = tipo;
  snprintf(r.titulo, sizeof(r.titulo), "%s", titulo);
  snprintf(r.detalhe, sizeof(r.detalhe), "%s", detalhe.c_str());
  snprintf(r.ajuda, sizeof(r.ajuda), "%s", ajuda.c_str());
  snprintf(r.carro, sizeof(r.carro), "%s", carro.c_str());
  return r;
}
// Separa "talvez não tenha chegado ao servidor" (rede) de recusa das regras,
// de versão vencida (dado mudou no meio) e de pátio fora do formato (HTTP 200
// com conteúdo inválido, 404 do pátio).
enum class Falha : uint8_t { REDE, RECUSA, CONFLITO, DADOS };
Falha classificarFalha() {
  const int codigo = fb.httpCode();
  if (codigo <= 0 || codigo == 408 || codigo == 429 || codigo >= 500) return Falha::REDE;
  if (codigo == 401 || codigo == 403) return Falha::RECUSA;
  if (codigo == 400 || codigo == 409) return Falha::CONFLITO;
  return Falha::DADOS;
}
// Leitura que falhou: nada foi gravado.
RespostaTotem falhaLeitura() {
  Serial.printf("[ATENDIMENTO] Leitura falhou (HTTP %d).\n", fb.httpCode());
  switch (classificarFalha()) {
    case Falha::REDE: return resposta(TipoResposta::ERRO, "SEM CONEXAO", "Nada foi registrado", "Tente novamente");
    case Falha::RECUSA: return resposta(TipoResposta::ERRO, "OPERACAO RECUSADA", "Nada foi registrado", "Procure o responsavel");
    default: return resposta(TipoResposta::ERRO, "VERIFIQUE O PAINEL", "Nada foi registrado", "Procure o responsavel");
  }
}
// Gravação que falhou. Recusa e conflito não gravam nada (lote atômico) e
// costumam vir de recarga ou troca de tarifa no mesmo instante: a tarefa repete
// o pedido uma vez, relendo tudo. Falha de rede nunca é repetida, porque a
// gravação pode ter chegado ao servidor.
RespostaTotem falhaEscrita() {
  Serial.printf("[ATENDIMENTO] Gravacao nao confirmada (HTTP %d).\n", fb.httpCode());
  const Falha falha = classificarFalha();
  if (falha == Falha::REDE)
    return resposta(TipoResposta::ERRO, "NAO FOI CONFIRMADO", "Confira a conexao", "Confira o registro no painel");
  repetirPedido = true;
  if (falha == Falha::RECUSA)
    return resposta(TipoResposta::ERRO, "OPERACAO RECUSADA", "Nada foi registrado", "Procure o responsavel");
  return resposta(TipoResposta::ALERTA, "TENTE NOVAMENTE", "Nada foi registrado", "Os dados mudaram agora");
}
String valorEmReais(double valor) {
  String texto(valor, 2);
  texto.replace('.', ',');
  return texto;
}
bool texto(FirebaseJson& json, const String& chave, String& valor) {
  FirebaseJsonData dado;
  if (!json.get(dado, chave) || !dado.success) return false;
  valor = dado.to<String>();
  return true;
}
bool inteiro(FirebaseJson& json, const String& campo, int64_t& valor) {
  String s;
  if (!texto(json, "fields/" + campo + "/integerValue", s) || s.isEmpty()) return false;
  char* fim = nullptr;
  errno = 0;
  valor = strtoll(s.c_str(), &fim, 10);
  return errno != ERANGE && fim != s.c_str() && *fim == '\0';
}
bool numero(FirebaseJson& json, const String& campo, double& valor) {
  FirebaseJsonData d;
  if (!json.get(d, "fields/" + campo + "/doubleValue") &&
      !json.get(d, "fields/" + campo + "/integerValue")) return false;
  valor = d.to<double>();
  return std::isfinite(valor);
}
bool consultar(const String& caminho, FirebaseJson& json, const char* campos = "") {
  if (!Firebase.Firestore.getDocument(&fb, PROJECT_ID, "", caminho.c_str(), campos)) return false;
  json.setJsonData(fb.payload());
  return true;
}
bool configurarPatio() {
  FirebaseJson json;
  int64_t quantidade;
  double valor;
  if (!consultar(PATIO, json, "numVagas,tarifaHora") || !inteiro(json, "numVagas", quantidade) ||
      quantidade < 1 || quantidade > paraai::MAX_VAGAS || !numero(json, "tarifaHora", valor) ||
      !paraai::tarifaValida(valor)) return false;
  capacidade = static_cast<int>(quantidade);
  tarifa = valor;
  return true;
}

// Somente a tarefa de rede usa estes vetores; ficam fora da pilha da tarefa.
paraai::EstadoVaga estadoVagas[paraai::MAX_VAGAS + 1];
bool vagaExiste[paraai::MAX_VAGAS + 1];

// O token de paginação vai sempre como const char*: a biblioteca (4.4.17)
// grava o '\0' num buffer ainda não alocado quando recebe um String vazio
// (MB_String::concat sem reserva) e o ESP trava com StoreProhibited na primeira
// página. Com const char* ela reserva antes de copiar.

// Reserva e tipo vêm da projeção pública. Vaga sem documento é comum e livre.
bool lerVagasPublicas() {
  String token;
  int paginas = 0;
  do {
    if (++paginas > 20) return false;
    if (!Firebase.Firestore.listDocuments(&fb, PROJECT_ID, "", VAGAS_PUBLICAS,
        16, token.c_str(), "", "reservadaAte,tipo", false)) return false;
    FirebaseJson pagina;
    pagina.setJsonData(fb.payload());
    for (int i = 0; i < 16; ++i) {
      const String prefixo = "documents/[" + String(i) + "]";
      String nome, bruto, tipo;
      if (!texto(pagina, prefixo + "/name", nome)) break;
      const String id = nome.substring(nome.lastIndexOf('/') + 1);
      const int n = id.toInt();
      if (n < 1 || n > paraai::MAX_VAGAS || id != String(n)) continue;
      if (texto(pagina, prefixo + "/fields/reservadaAte/integerValue", bruto)) {
        const long long ate = strtoll(bruto.c_str(), nullptr, 10);
        estadoVagas[n].reservadaAte = ate > 0 && ate < 4000000000LL ? static_cast<uint32_t>(ate) : 0;
      }
      const bool temTipo = texto(pagina, prefixo + "/fields/tipo/stringValue", tipo);
      estadoVagas[n].tipo = paraai::tipoDaVaga(temTipo ? tipo.c_str() : nullptr, n);
    }
    token = "";
    texto(pagina, "nextPageToken", token);
    taskYIELD();
  } while (!token.isEmpty());
  return true;
}

// reservada: vaga que o dono da placa reservou no app (0 se não reservou).
// direito: tipo de vaga especial declarado no veículo (COMUM = nenhum).
struct MapaVagas { int livres = 0; int primeira = 0; bool existe = false; bool reservada = false; String revisao; };
bool mapaVagas(MapaVagas& mapa, int reservada = 0, paraai::TipoVaga direito = paraai::TipoVaga::COMUM) {
  // Paginação limita o uso de RAM. Placa é a ocupação lógica; não interpretar
  // eco, GPIO ou antigos campos de sensores como presença física.
  // Vaga sem documento público segue a mesma tabela padrão do site.
  for (int n = 0; n <= paraai::MAX_VAGAS; ++n) {
    estadoVagas[n] = {};
    estadoVagas[n].tipo = paraai::tipoDaVaga(nullptr, n);
    vagaExiste[n] = false;
  }
  if (!lerVagasPublicas()) return false;
  const int64_t agora = time(nullptr);
  // Candidatas com documento, na mesma ordem de escolherVaga: a primeira do
  // tipo do direito declarado e a primeira comum.
  int candidataTipo = 0, candidataComum = 0;
  String revisaoTipo, revisaoComum, revisaoReservada, token;
  int paginas = 0;
  do {
    if (++paginas > 20) return false;
    if (!Firebase.Firestore.listDocuments(&fb, PROJECT_ID, "", String(PATIO) + "/vagas",
        16, token.c_str(), "", "placa", false)) return false;
    FirebaseJson pagina;
    pagina.setJsonData(fb.payload());
    FirebaseJsonData item;
    for (int i = 0; i < 16; ++i) {
      String prefixo = "documents/[" + String(i) + "]";
      String nome, placa, revisao;
      if (!texto(pagina, prefixo + "/name", nome)) break;
      String id = nome.substring(nome.lastIndexOf('/') + 1);
      int n = id.toInt();
      if (n < 1 || n > paraai::MAX_VAGAS || id != String(n) || vagaExiste[n]) {
        // Documento fora do padrão (ex.: "01", criado no console) não é vaga
        // do totem: ignorar em vez de parar o pátio inteiro.
        Serial.printf("[ATENDIMENTO] Vaga ignorada: id \"%s\" fora do padrao.\n", id.c_str());
        continue;
      }
      vagaExiste[n] = true;
      // Documento criado pelo firmware antigo só com leitura pode não ter placa.
      const bool placaLegivel = texto(pagina, prefixo + "/fields/placa/stringValue", placa) ||
                                !pagina.get(item, prefixo + "/fields/placa");
      if (!placaLegivel || (!placa.isEmpty() && !paraai::placaValida(placa.c_str()))) {
        // Na dúvida a vaga não é oferecida: nunca dois carros na mesma vaga.
        Serial.printf("[ATENDIMENTO] Vaga %d com placa fora do padrao; tratada como ocupada.\n", n);
        estadoVagas[n].usada = true;
        continue;
      }
      estadoVagas[n].usada = !placa.isEmpty();
      if (estadoVagas[n].usada) continue;
      // Revisões só das vagas que podem ser escolhidas: a reservada, a primeira
      // livre do tipo do direito declarado e a primeira comum livre.
      const bool semReserva = n <= capacidade && estadoVagas[n].reservadaAte <= agora;
      const bool doTipo = semReserva && direito != paraai::TipoVaga::COMUM &&
                          estadoVagas[n].tipo == direito;
      const bool comum = semReserva && estadoVagas[n].tipo == paraai::TipoVaga::COMUM;
      const bool melhorTipo = doTipo && (candidataTipo == 0 || n < candidataTipo);
      const bool melhorComum = comum && (candidataComum == 0 || n < candidataComum);
      if (n != reservada && !melhorTipo && !melhorComum) continue;
      if (!texto(pagina, prefixo + "/updateTime", revisao)) return false;
      if (n == reservada) revisaoReservada = revisao;
      if (melhorTipo) { candidataTipo = n; revisaoTipo = revisao; }
      if (melhorComum) { candidataComum = n; revisaoComum = revisao; }
    }
    token = "";
    texto(pagina, "nextPageToken", token);
    taskYIELD();
  } while (!token.isEmpty());
  mapa = {};
  mapa.livres = paraai::contarLivres(estadoVagas, capacidade, agora);
  mapa.primeira = paraai::escolherVaga(estadoVagas, capacidade, reservada, agora, direito);
  if (mapa.primeira) {
    mapa.reservada = reservada > 0 && mapa.primeira == reservada;
    mapa.existe = vagaExiste[mapa.primeira];
    if (mapa.existe) {
      if (mapa.reservada) mapa.revisao = revisaoReservada;
      else if (mapa.primeira == candidataTipo) mapa.revisao = revisaoTipo;
      else if (mapa.primeira == candidataComum) mapa.revisao = revisaoComum;
      else return false;
    }
  }
  return true;
}

enum class Reserva : uint8_t { NENHUMA, ATIVA, FALHA };
// Reserva feita no app pelo dono da placa, válida neste pátio. Falha de rede
// interrompe a entrada; reserva ausente, vencida ou de outro pátio é ignorada.
Reserva consultarReserva(const String& dono, int& vaga, String& revisao) {
  vaga = 0;
  FirebaseJson json;
  if (!consultar("reservas/" + dono, json))
    return classificarFalha() == Falha::REDE ? Reserva::FALHA : Reserva::NENHUMA;
  String status, local;
  int64_t numero = 0, expira = 0;
  // Margem de 30 s: a reserva não pode vencer entre a leitura e o commit.
  if (!texto(json, "fields/status/stringValue", status) || status != "ativa" ||
      !texto(json, "fields/estacionamentoId/stringValue", local) || local != estacionamentoId ||
      !inteiro(json, "vaga", numero) || numero < 1 || numero > paraai::MAX_VAGAS ||
      !inteiro(json, "expiraEm", expira) || expira <= static_cast<int64_t>(time(nullptr)) + 30 ||
      !texto(json, "updateTime", revisao) || revisao.isEmpty()) return Reserva::NENHUMA;
  vaga = static_cast<int>(numero);
  return Reserva::ATIVA;
}
void escrita(std::vector<firebase_firestore_document_write_t>& lote, const String& caminho,
             FirebaseJson& json, const char* campos, const String& revisao, bool existe,
             bool comCondicao = true) {
  firebase_firestore_document_write_t e;
  e.type = firebase_firestore_document_write_type_update;
  e.update_document_path = caminho.c_str();
  e.update_document_content = json.raw();
  e.update_masks = campos;
  // A projeção pública é espelho do totem: grava sem condição de versão.
  if (comCondicao) {
    if (revisao.length()) e.current_document.update_time = revisao.c_str();
    else e.current_document.exists = existe ? "true" : "false";
  }
  lote.push_back(e);
}
// Máscara das gravações da vaga. Campo da máscara ausente no conteúdo é
// apagado: leituraValida (não fingimos uma leitura física) e, na saída ou em
// carro sem descrição, modelo e cor.
constexpr const char* CAMPOS_VAGA = "placa,ocupada,origemOcupacao,leituraValida,modelo,cor";
void dadosVaga(FirebaseJson& vaga, const String& placa, const String& modelo = "", const String& cor = "") {
  vaga.set("fields/placa/stringValue", placa);
  vaga.set("fields/ocupada/booleanValue", !placa.isEmpty());
  vaga.set("fields/origemOcupacao/stringValue", "registro");
  // Copiados do veículo para o painel do pátio; as regras conferem a cópia.
  if (!modelo.isEmpty()) vaga.set("fields/modelo/stringValue", modelo);
  if (!cor.isEmpty()) vaga.set("fields/cor/stringValue", cor);
}
enum class Sincronia : uint8_t { OK, REDE, CONFIGURACAO };
Sincronia falhaSincronia() {
  Serial.printf("[ATENDIMENTO] Sincronizacao falhou (HTTP %d).\n", fb.httpCode());
  return classificarFalha() == Falha::REDE ? Sincronia::REDE : Sincronia::CONFIGURACAO;
}
Sincronia heartbeat() {
  MapaVagas mapa;
  if (!configurarPatio() || !mapaVagas(mapa)) return falhaSincronia();
  FirebaseJson dados;
  dados.set("fields/ultimaAtualizacao/integerValue", String(static_cast<long long>(time(nullptr))));
  dados.set("fields/vagasLivres/integerValue", String(mapa.livres));
  dados.set("fields/vagasEmOperacao/integerValue", String(capacidade));
  dados.set("fields/tarifaAplicadaTotem/doubleValue", tarifa);
  dados.set("fields/modoTotem/stringValue", "atendimento");
  // Remove o antigo limite de sensores; a UI web já trata sua ausência.
  if (!Firebase.Firestore.patchDocument(&fb, PROJECT_ID, "", PATIO, dados.raw(),
      "ultimaAtualizacao,vagasLivres,vagasEmOperacao,tarifaAplicadaTotem,modoTotem,vagasSuportadasTotem", "", "true"))
    return falhaSincronia();
  bool ok = Firebase.Firestore.patchDocument(&fb, PROJECT_ID, "", "catalogoEstacionamentos/" + estacionamentoId,
    dados.raw(), "ultimaAtualizacao,vagasLivres,vagasEmOperacao", "", "true");
  return ok || fb.httpCode() == 404 ? Sincronia::OK : falhaSincronia();
}

RespostaTotem executar(const Solicitacao& pedido) {
  const String placa = pedido.placa;
  const String caminho = "veiculos/" + placa;
  if (!paraai::placaValida(pedido.placa)) return resposta(TipoResposta::ALERTA, "CONFIRA A PLACA", placa);
  estado(ConexaoTotem::PRONTO, "Consultando a placa...");
  FirebaseJson veiculo;
  if (!consultar(caminho, veiculo)) {
    if (fb.httpCode() != 404) return falhaLeitura();
    if (pedido.tipo == PedidoTotem::SAIDA) return resposta(TipoResposta::ALERTA, "PLACA SEM CADASTRO", placa, "Confira os caracteres");
    if (pedido.tipo != PedidoTotem::CADASTRAR_ENTRADA)
      return resposta(TipoResposta::CONFIRMAR_CADASTRO, "", placa);
    FirebaseJson novo;
    novo.set("fields/ativo/booleanValue", true);
    novo.set("fields/vagaAtual/integerValue", "0");
    novo.set("fields/horaEntrada/integerValue", "0");
    novo.set("fields/saldo/doubleValue", 0.0);
    novo.set("fields/estacionamentoId/stringValue", "");
    novo.set("fields/tarifaHoraEntrada/doubleValue", 0.0);
    novo.set("fields/cadastradoNoTotem/booleanValue", true);
    if (!Firebase.Firestore.createDocument(&fb, PROJECT_ID, "", caminho, novo.raw()) && fb.httpCode() != 409) return falhaEscrita();
    // Releitura também cobre um cadastro concorrente; nunca sobrescrever dono/saldo.
    if (!consultar(caminho, veiculo)) return falhaLeitura();
  }
  FirebaseJsonData ativo;
  int64_t numeroVaga = -1, entrada = 0;
  double saldo = NAN, congelada = NAN;
  String local, revisao;
  texto(veiculo, "fields/estacionamentoId/stringValue", local);
  if (!texto(veiculo, "updateTime", revisao) || revisao.isEmpty() ||
      !inteiro(veiculo, "vagaAtual", numeroVaga) || numeroVaga < 0 || numeroVaga > paraai::MAX_VAGAS ||
      !numero(veiculo, "saldo", saldo)) return resposta(TipoResposta::ERRO, "CADASTRO INVALIDO", placa, "Procure o responsavel");
  if (!veiculo.get(ativo, "fields/ativo/booleanValue") || !ativo.to<bool>())
    return resposta(TipoResposta::ALERTA, "CADASTRO INATIVO", placa, "Procure o responsavel");

  if (pedido.tipo != PedidoTotem::SAIDA) {
    if (numeroVaga != 0 || !local.isEmpty())
      return resposta(TipoResposta::ALERTA, "JA ESTA ESTACIONADO", placa, "Use SAIDA ao terminar");
    // Uma estadia sem saldo vira pendência; outra só depois de regularizar.
    if (!paraai::entradaPermitida(saldo))
      return resposta(TipoResposta::ALERTA, "SALDO PENDENTE", placa, "Regularize no app para entrar");
    // Reserva do app: o totem usa a vaga escolhida; sem reserva, decide sozinho.
    String dono, revisaoReserva;
    int vagaReservada = 0;
    texto(veiculo, "fields/ownerUid/stringValue", dono);
    if (!dono.isEmpty() && consultarReserva(dono, vagaReservada, revisaoReserva) == Reserva::FALHA)
      return falhaLeitura();
    // Direito a vaga especial declarado pelo dono no site (autodeclaração).
    String declarado;
    texto(veiculo, "fields/vagaEspecial/stringValue", declarado);
    // Modelo e cor informados no site: "GOL PRATA" na confirmação e cópia na
    // vaga. Fora do formato, nenhum dos dois (a entrada segue sem eles).
    String modelo, cor;
    texto(veiculo, "fields/modelo/stringValue", modelo);
    texto(veiculo, "fields/cor/stringValue", cor);
    if (!paraai::descricaoVeiculoValida(modelo.c_str(), cor.c_str())) { modelo = ""; cor = ""; }
    // Só a cor, sem modelo, não identifica o carro: a tela fica com a placa.
    String carro = modelo;
    if (!carro.isEmpty() && !cor.isEmpty()) { carro += ' '; carro += cor; }
    carro.toUpperCase();
    const paraai::TipoVaga direito = paraai::direitoDeclarado(declarado.c_str());
    estado(ConexaoTotem::PRONTO, "Verificando disponibilidade...");
    MapaVagas mapa;
    if (!configurarPatio() || !mapaVagas(mapa, vagaReservada, direito)) return falhaLeitura();
    if (!mapa.primeira) return resposta(TipoResposta::ALERTA, "SEM VAGAS LIVRES", "Estacionamento lotado", "Tente mais tarde");
    FirebaseJson alteracao, vaga, publica, reserva;
    alteracao.set("fields/vagaAtual/integerValue", String(mapa.primeira));
    alteracao.set("fields/horaEntrada/integerValue", String(static_cast<long long>(time(nullptr))));
    alteracao.set("fields/estacionamentoId/stringValue", estacionamentoId);
    alteracao.set("fields/tarifaHoraEntrada/doubleValue", tarifa);
    dadosVaga(vaga, placa, modelo, cor);
    std::vector<firebase_firestore_document_write_t> lote;
    escrita(lote, caminho, alteracao, "vagaAtual,horaEntrada,estacionamentoId,tarifaHoraEntrada", revisao, true);
    escrita(lote, String(PATIO) + "/vagas/" + String(mapa.primeira), vaga,
      CAMPOS_VAGA, mapa.revisao, mapa.existe);
    // Mapa do app: vaga ocupada e reserva encerrada no mesmo commit.
    publica.set("fields/ocupada/booleanValue", true);
    publica.set("fields/reservadaAte/integerValue", "0");
    escrita(lote, String(VAGAS_PUBLICAS) + "/" + String(mapa.primeira), publica,
      "ocupada,reservadaAte", "", false, false);
    if (mapa.reservada) {
      reserva.set("fields/status/stringValue", "utilizada");
      escrita(lote, "reservas/" + dono, reserva, "status", revisaoReserva, true);
    }
    estado(ConexaoTotem::PRONTO, "Registrando entrada...");
    if (!Firebase.Firestore.commitDocument(&fb, PROJECT_ID, "", lote, "")) return falhaEscrita();
    sincronizado = false;
    return resposta(TipoResposta::SUCESSO, "ENTRADA CONFIRMADA", placa,
      String(mapa.reservada ? "Vaga reservada " : "Vaga ") + String(mapa.primeira) +
      " - R$ " + valorEmReais(tarifa) + "/h", carro);
  }
  if (numeroVaga == 0) return resposta(TipoResposta::ALERTA, "SEM ENTRADA ABERTA", placa, "Nenhuma saida a registrar");
  if (local != estacionamentoId) return resposta(TipoResposta::ALERTA, "USE O OUTRO TOTEM", placa, "A entrada foi em outro local");
  paraai::Cobranca cobranca;
  int64_t agora = time(nullptr);
  if (!inteiro(veiculo, "horaEntrada", entrada) || !numero(veiculo, "tarifaHoraEntrada", congelada) ||
      !paraai::calcularCobranca(entrada, agora, congelada, saldo, cobranca))
    return resposta(TipoResposta::ERRO, "ESTADIA INCONSISTENTE", "Confira horario e tarifa", "Procure o responsavel");
  String caminhoVaga = String(PATIO) + "/vagas/" + String(static_cast<int>(numeroVaga));
  FirebaseJson vagaAtual;
  String placaVaga, revisaoVaga;
  if (!consultar(caminhoVaga, vagaAtual, "placa") && fb.httpCode() != 404) return falhaLeitura();
  if (fb.httpCode() == 404 || !texto(vagaAtual, "updateTime", revisaoVaga) ||
      !texto(vagaAtual, "fields/placa/stringValue", placaVaga) || placaVaga != placa)
    return resposta(TipoResposta::ERRO, "VAGA INCONSISTENTE", "Saida nao registrada", "Procure o responsavel");
  FirebaseJson alteracao, vaga, recibo, publica;
  alteracao.setDoubleDigits(9);
  alteracao.set("fields/vagaAtual/integerValue", "0");
  alteracao.set("fields/horaEntrada/integerValue", "0");
  alteracao.set("fields/estacionamentoId/stringValue", "");
  alteracao.set("fields/tarifaHoraEntrada/doubleValue", 0.0);
  alteracao.set("fields/saldo/doubleValue", cobranca.saldoFinal);
  dadosVaga(vaga, "");
  recibo.set("fields/placa/stringValue", placa);
  recibo.set("fields/vaga/integerValue", String(static_cast<int>(numeroVaga)));
  recibo.set("fields/entrada/integerValue", String(static_cast<long long>(entrada)));
  recibo.set("fields/saida/integerValue", String(static_cast<long long>(agora)));
  recibo.set("fields/duracaoMinutos/integerValue", String(static_cast<long long>(cobranca.segundos / 60)));
  recibo.set("fields/valorCobrado/doubleValue", cobranca.valor);
  recibo.set("fields/valorPendente/doubleValue", cobranca.pendente);
  recibo.set("fields/tarifaHora/doubleValue", congelada);
  recibo.set("fields/estacionamentoId/stringValue", estacionamentoId);
  std::vector<firebase_firestore_document_write_t> lote;
  escrita(lote, caminho, alteracao, "vagaAtual,horaEntrada,estacionamentoId,saldo,tarifaHoraEntrada", revisao, true);
  escrita(lote, caminhoVaga, vaga, CAMPOS_VAGA, revisaoVaga, true);
  escrita(lote, "historico/" + placa + "_" + String(static_cast<long long>(entrada)), recibo, "", "", false);
  publica.set("fields/ocupada/booleanValue", false);
  escrita(lote, String(VAGAS_PUBLICAS) + "/" + String(static_cast<int>(numeroVaga)), publica,
    "ocupada", "", false, false);
  estado(ConexaoTotem::PRONTO, "Registrando saida...");
  if (!Firebase.Firestore.commitDocument(&fb, PROJECT_ID, "", lote, "")) return falhaEscrita();
  sincronizado = false;
  const String minutos = String(static_cast<long long>(cobranca.segundos / 60)) + " min";
  // Sem catraca, a saída é sempre registrada. O valor da pendência não é
  // exibido: o saldo é do dono da placa, não de quem está no totem.
  if (cobranca.pendente >= paraai::TOLERANCIA_SALDO)
    return resposta(TipoResposta::ALERTA, "SAIDA COM PENDENCIA", "R$ " + valorEmReais(cobranca.valor) + " em " + minutos,
      "Regularize no app - " + placa);
  return resposta(TipoResposta::SUCESSO, "SAIDA CONFIRMADA", "R$ " + valorEmReais(cobranca.valor),
    minutos + " - " + placa);
}

// ---- Acesso do totem -------------------------------------------------------
// Na instalação por código, o totem cria a própria conta no Firebase e grava o
// próprio cadastro com o código digitado (ver firebase/firestore.rules). A
// conta fica num blob só da NVS, com checksum, como a rede Wi-Fi
// (ConfiguracaoWiFi.ino). PENDENTE guarda e-mail e senha antes de a conta
// existir, para uma nova tentativa usar a mesma em vez de criar outra;
// VINCULADA soma o estacionamento, que vem do código.
constexpr const char* NVS_IDENTIDADE = "paraai-id";
constexpr const char* CHAVE_IDENTIDADE = "acesso";
constexpr uint32_t MAGIC_IDENTIDADE = 0x50414944UL;  // "PAID"
constexpr uint32_t VERSAO_IDENTIDADE = 1;
constexpr uint8_t IDENTIDADE_PENDENTE = 1, IDENTIDADE_VINCULADA = 2;
struct DadosIdentidade {
  uint32_t magic;
  uint32_t versao;
  uint8_t estado;
  char email[64];
  char senha[34];
  char estacionamentoId[paraai::ESTACIONAMENTO_ID_MAX + 1];
  uint32_t checksum;
};

uint32_t somaIdentidade(const DadosIdentidade& dados) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&dados);
  uint32_t hash = 2166136261UL;  // FNV-1a de 32 bits (integridade, não cifra)
  for (size_t i = 0; i < offsetof(DadosIdentidade, checksum); ++i) {
    hash ^= bytes[i];
    hash *= 16777619UL;
  }
  return hash;
}
bool terminado(const char* texto, size_t capacidade) { return memchr(texto, '\0', capacidade) != nullptr; }
bool identidadeValida(const DadosIdentidade& dados) {
  if (dados.magic != MAGIC_IDENTIDADE || dados.versao != VERSAO_IDENTIDADE ||
      dados.checksum != somaIdentidade(dados)) return false;
  if (!terminado(dados.email, sizeof(dados.email)) || !terminado(dados.senha, sizeof(dados.senha)) ||
      !terminado(dados.estacionamentoId, sizeof(dados.estacionamentoId)) ||
      !dados.email[0] || !dados.senha[0]) return false;
  if (dados.estado == IDENTIDADE_PENDENTE) return true;
  return dados.estado == IDENTIDADE_VINCULADA && paraai::estacionamentoIdValido(dados.estacionamentoId);
}
bool lerIdentidade(DadosIdentidade& dados) {
  memset(&dados, 0, sizeof(dados));
  Preferences preferencias;
  if (!preferencias.begin(NVS_IDENTIDADE, true)) return false;
  const bool ok = preferencias.getBytesLength(CHAVE_IDENTIDADE) == sizeof(dados) &&
                  preferencias.getBytes(CHAVE_IDENTIDADE, &dados, sizeof(dados)) == sizeof(dados) &&
                  identidadeValida(dados);
  preferencias.end();
  return ok;
}
// Lê a gravação de volta antes de considerá-la feita.
bool salvarIdentidade(DadosIdentidade& dados) {
  dados.checksum = somaIdentidade(dados);
  Preferences preferencias;
  if (!preferencias.begin(NVS_IDENTIDADE, false)) return false;
  const bool gravou = preferencias.putBytes(CHAVE_IDENTIDADE, &dados, sizeof(dados)) == sizeof(dados);
  preferencias.end();
  DadosIdentidade lida;
  const bool confere = gravou && lerIdentidade(lida) && memcmp(&lida, &dados, sizeof(dados)) == 0;
  memset(&lida, 0, sizeof(lida));
  return confere;
}
void sortear(char* destino, size_t quantidade, const char* alfabeto) {
  const size_t tamanho = strlen(alfabeto);
  for (size_t i = 0; i < quantidade; ++i) destino[i] = alfabeto[esp_random() % tamanho];
  destino[quantidade] = '\0';
}
// Conta só deste totem; a senha nunca sai dele. Maiúscula, minúscula, número
// e símbolo atendem a uma política de senha do Firebase, como as do site.
void novaConta(DadosIdentidade& dados) {
  memset(&dados, 0, sizeof(dados));
  dados.magic = MAGIC_IDENTIDADE;
  dados.versao = VERSAO_IDENTIDADE;
  dados.estado = IDENTIDADE_PENDENTE;
  char sufixo[13], miolo[25];
  sortear(sufixo, 12, "abcdefghijklmnopqrstuvwxyz0123456789");
  sortear(miolo, 24, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789");
  snprintf(dados.email, sizeof(dados.email), "totem-%s@dispositivo.paraai.app", sufixo);
  snprintf(dados.senha, sizeof(dados.senha), "Pa!%s9z", miolo);
  memset(miolo, 0, sizeof(miolo));
}
void definirPatio(const char* id) {
  estacionamentoId = id;
  PATIO = "estacionamentos/" + estacionamentoId;
  VAGAS_PUBLICAS = "catalogoEstacionamentos/" + estacionamentoId + "/vagas";
}
// Antes da tarefa de rede. O Credenciais.h preenchido vale mais que a memória.
void carregarIdentidade() {
  if (paraai::credencialFixaPreenchida(TOTEM_EMAIL, TOTEM_PASSWORD, ESTACIONAMENTO_ID)) {
    auth.user.email = TOTEM_EMAIL;
    auth.user.password = TOTEM_PASSWORD;
    definirPatio(ESTACIONAMENTO_ID);
    origem = OrigemIdentidade::CREDENCIAIS;
    return;
  }
  if (*TOTEM_EMAIL || *TOTEM_PASSWORD || *ESTACIONAMENTO_ID)
    Serial.println("[ATENDIMENTO] Acesso do Credenciais.h incompleto ou de exemplo: vale o da instalacao por codigo.");
  DadosIdentidade dados;
  if (lerIdentidade(dados) && dados.estado == IDENTIDADE_VINCULADA) {
    auth.user.email = dados.email;
    auth.user.password = dados.senha;
    definirPatio(dados.estacionamentoId);
    origem = OrigemIdentidade::CODIGO;
  } else {
    Serial.println("[ATENDIMENTO] Sem acesso ao Firebase: o totem vai pedir o codigo de instalacao.");
  }
  memset(&dados, 0, sizeof(dados));
}

void prepararConfiguracao() {
  static bool pronta = false;
  if (pronta) return;
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.timeout.socketConnection = 8000;
  config.timeout.serverResponse = 10000;
#ifndef PARAAI_TLS_SEM_VERIFICACAO
  // Sem isto a biblioteca aceita qualquer certificado. O login por
  // e-mail/senha da versão 4.4.17 ainda ignora esta opção (ver README).
  config.cert.data = RAIZES_GOOGLE_PEM;
#endif
  fb.setResponseSize(12288);
  Firebase.reconnectWiFi(false); // A UI controla a rede, inclusive o portal.
  pronta = true;
}
// O begin só volta com o login feito: a biblioteca espera o token.
void entrarNoFirebase() {
  prepararConfiguracao();
  Firebase.begin(&config, &auth);
  iniciado = true;
}

RespostaTotem codigoRecusado() {
  return resposta(TipoResposta::ALERTA, "CODIGO NAO ACEITO", "Confira ou gere outro", "O codigo vale 15 minutos");
}
RespostaTotem totemInstalado(const String& nomeEstacionamento) {
  // Sem acento, com a mesma conversão do nome da rede Wi-Fi.
  char nome[sizeof(RespostaTotem::detalhe)];
  paraai::textoWifiExibivel(nomeEstacionamento.c_str(), nome, sizeof(nome));
  if (!nome[0]) return resposta(TipoResposta::SUCESSO, "TOTEM INSTALADO", "Pronto para atender");
  return resposta(TipoResposta::SUCESSO, "TOTEM INSTALADO", nome, "Pronto para atender");
}
RespostaTotem falhaCadastro(const String& erro) {
  Serial.printf("[ATENDIMENTO] Acesso do totem nao criado: %s\n", erro.isEmpty() ? "sem resposta" : erro.c_str());
  if (erro.isEmpty()) return resposta(TipoResposta::ERRO, "SEM CONEXAO", "Nada foi registrado", "Tente novamente");
  if (erro.startsWith("TOO_MANY_ATTEMPTS"))
    return resposta(TipoResposta::ALERTA, "ACESSO NAO CRIADO", "Muitas tentativas", "Aguarde alguns minutos");
  return resposta(TipoResposta::ERRO, "ACESSO NAO CRIADO", "Nada foi registrado", "Procure o responsavel");
}
RespostaTotem concluirVinculo(DadosIdentidade& dados, const String& patio, const String& nomeEstacionamento) {
  dados.estado = IDENTIDADE_VINCULADA;
  snprintf(dados.estacionamentoId, sizeof(dados.estacionamentoId), "%s", patio.c_str());
  // Sem a gravação, o totem atende até reiniciar; depois, qualquer código
  // digitado acha o cadastro já feito (em vincularConta) e grava de novo.
  if (!salvarIdentidade(dados)) Serial.println("[ATENDIMENTO] Acesso nao gravado na memoria: vale ate reiniciar.");
  definirPatio(dados.estacionamentoId);
  sincronizado = false;
  patioValidado = false;
  configuracaoInvalida = false;
  origem = OrigemIdentidade::CODIGO;
  Serial.printf("[ATENDIMENTO] Totem instalado em %s.\n", estacionamentoId.c_str());
  return totemInstalado(nomeEstacionamento);
}

RespostaTotem vincularConta(DadosIdentidade& dados, const char* codigo) {
  if (!iniciado) {
    estado(ConexaoTotem::SEM_VINCULO, "Criando o acesso...");
    prepararConfiguracao();
    if (!Firebase.signUp(&config, &auth, dados.email, dados.senha)) {
      const String erro = config.signer.signupError.message.c_str();
      // Já existe: foi criada por uma tentativa anterior, com esta senha.
      if (!erro.startsWith("EMAIL_EXISTS")) return falhaCadastro(erro);
    }
    auth.user.email = dados.email;
    auth.user.password = dados.senha;
    entrarNoFirebase();
  }
  const String uid = auth.token.uid.c_str();
  if (!Firebase.ready() || uid.isEmpty())
    return resposta(TipoResposta::ERRO, "SEM CONEXAO", "Nada foi registrado", "Tente novamente");

  estado(ConexaoTotem::SEM_VINCULO, "Conferindo o codigo...");
  String patio, nomeTotem, nomeEstacionamento;
  FirebaseJson json;
  // Instalado numa tentativa anterior cuja resposta se perdeu: só concluir.
  if (consultar("totems/" + uid, json, "estacionamentoId")) {
    if (!texto(json, "fields/estacionamentoId/stringValue", patio) || !paraai::estacionamentoIdValido(patio.c_str()))
      return resposta(TipoResposta::ERRO, "VERIFIQUE O PAINEL", "Nada foi registrado", "Procure o responsavel");
    FirebaseJson catalogo;
    if (consultar("catalogoEstacionamentos/" + patio, catalogo, "nome"))
      texto(catalogo, "fields/nome/stringValue", nomeEstacionamento);
    return concluirVinculo(dados, patio, nomeEstacionamento);
  }
  if (fb.httpCode() != 404) return falhaLeitura();

  const String caminhoCodigo = String("codigosInstalacao/") + codigo;
  if (!consultar(caminhoCodigo, json, "estacionamentoId,nome,nomeEstacionamento")) {
    // Código que não existe, já usado ou vencido: as regras recusam a leitura.
    if (fb.httpCode() == 403 || fb.httpCode() == 404) return codigoRecusado();
    return falhaLeitura();
  }
  if (!texto(json, "fields/estacionamentoId/stringValue", patio) || !paraai::estacionamentoIdValido(patio.c_str()) ||
      !texto(json, "fields/nome/stringValue", nomeTotem) || nomeTotem.isEmpty()) return codigoRecusado();
  texto(json, "fields/nomeEstacionamento/stringValue", nomeEstacionamento);

  // Cadastro do totem e fim do código no mesmo commit: o código vale uma vez.
  FirebaseJson cadastro;
  cadastro.set("fields/estacionamentoId/stringValue", patio);
  cadastro.set("fields/nome/stringValue", nomeTotem);
  cadastro.set("fields/email/stringValue", String(dados.email));
  cadastro.set("fields/ativo/booleanValue", true);
  cadastro.set("fields/codigoInstalacao/stringValue", String(codigo));
  cadastro.set("fields/vinculadoEm/integerValue", String(static_cast<long long>(time(nullptr))));
  std::vector<firebase_firestore_document_write_t> lote;
  escrita(lote, "totems/" + uid, cadastro, "", "", false);
  firebase_firestore_document_write_t fimDoCodigo;
  fimDoCodigo.type = firebase_firestore_document_write_type_delete;
  fimDoCodigo.delete_document_path = caminhoCodigo.c_str();
  lote.push_back(fimDoCodigo);
  estado(ConexaoTotem::SEM_VINCULO, "Registrando o totem...");
  if (!Firebase.Firestore.commitDocument(&fb, PROJECT_ID, "", lote, "")) {
    Serial.printf("[ATENDIMENTO] Instalacao nao confirmada (HTTP %d).\n", fb.httpCode());
    // Pode ter chegado ao servidor: o mesmo código, de novo, acha o cadastro.
    if (classificarFalha() == Falha::REDE)
      return resposta(TipoResposta::ERRO, "NAO FOI CONFIRMADO", "Confira a conexao", "Digite o codigo de novo");
    return codigoRecusado();
  }
  return concluirVinculo(dados, patio, nomeEstacionamento);
}

RespostaTotem vincular(const char* codigo) {
  if (origem.load() != OrigemIdentidade::NENHUMA) return totemInstalado("");
  if (!paraai::codigoInstalacaoValido(codigo)) return codigoRecusado();
  if (WiFi.status() != WL_CONNECTED)
    return resposta(TipoResposta::ERRO, "SEM CONEXAO", "Conecte o Wi-Fi primeiro", "Segure o relogio por 3 s");
  if (time(nullptr) < paraai::PRIMEIRO_TIMESTAMP_VALIDO)
    return resposta(TipoResposta::ERRO, "CONEXAO INDISPONIVEL", "Aguarde a reconexao", "Nenhuma operacao foi enviada");
  // A conta pendente de uma tentativa anterior ou uma nova, guardada antes de
  // existir no Firebase.
  DadosIdentidade dados;
  if (!lerIdentidade(dados) || dados.estado != IDENTIDADE_PENDENTE) {
    novaConta(dados);
    if (!salvarIdentidade(dados)) {
      memset(&dados, 0, sizeof(dados));
      return resposta(TipoResposta::ERRO, "ERRO NA MEMORIA", "Nada foi registrado", "Procure o responsavel");
    }
  }
  const RespostaTotem r = vincularConta(dados, codigo);
  memset(&dados, 0, sizeof(dados));
  return r;
}

ConexaoTotem estadoDoServico(bool pronto) {
  if (!pronto || servidorSemResposta) return ConexaoTotem::AUTENTICANDO; // "CONECTANDO"
  if (configuracaoInvalida) return ConexaoTotem::ERRO_CONFIGURACAO;
  return patioValidado ? ConexaoTotem::PRONTO : ConexaoTotem::INICIANDO;
}

void tarefa(void*) {
  for (;;) {
    if (xSemaphoreTake(exclusao, pdMS_TO_TICKS(20)) != pdTRUE) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }
    bool pronto = false;
    if (WiFi.status() != WL_CONNECTED) estado(ConexaoTotem::SEM_WIFI);
    else {
      if (!relogioIniciado) { configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com"); relogioIniciado = true; }
      if (time(nullptr) < paraai::PRIMEIRO_TIMESTAMP_VALIDO) estado(ConexaoTotem::AJUSTANDO_HORA);
      else if (origem.load() == OrigemIdentidade::NENHUMA) estado(ConexaoTotem::SEM_VINCULO);
      else {
        if (!iniciado) entrarNoFirebase();
        pronto = Firebase.ready();
        estado(estadoDoServico(pronto));
      }
    }
    Solicitacao pedido;
    if (xQueueReceive(pedidos, &pedido, 0) == pdTRUE) {
      repetirPedido = false;
      RespostaTotem r = pedido.tipo == PedidoTotem::VINCULAR ? vincular(pedido.codigo)
        : pronto ? executar(pedido)
        : resposta(TipoResposta::ERRO, "CONEXAO INDISPONIVEL", "Aguarde a reconexao", "Nenhuma operacao foi enviada");
      if (repetirPedido && pedido.tipo != PedidoTotem::VINCULAR) {
        Serial.println("[ATENDIMENTO] Repetindo uma vez com os dados relidos.");
        repetirPedido = false;
        r = executar(pedido);
        repetirPedido = false;
      }
      memset(&pedido, 0, sizeof(pedido));
      xQueueOverwrite(respostas, &r);
    } else if (pronto && uxQueueMessagesWaiting(respostas) == 0 &&
               (!sincronizado || millis() - ultimoHeartbeat >= HEARTBEAT_MS) &&
               (ultimaTentativa == 0 || millis() - ultimaTentativa >= RETENTATIVA_MS)) {
      ultimaTentativa = millis();
      const Sincronia sincronia = heartbeat();
      // Falha de rede mantém a última validação; nova tentativa em 15 s.
      servidorSemResposta = sincronia == Sincronia::REDE;
      if (sincronia == Sincronia::OK) {
        patioValidado = true;
        configuracaoInvalida = false;
        ultimoHeartbeat = millis();
        sincronizado = true;
      } else if (sincronia == Sincronia::CONFIGURACAO) {
        patioValidado = false;
        configuracaoInvalida = true;
      }
      estado(estadoDoServico(true));
    }
    xSemaphoreGive(exclusao);
    vTaskDelay(pdMS_TO_TICKS(30));
  }
}
} // namespace

bool iniciarAtendimento() {
  if (pedidos) return true;
  carregarIdentidade();
  pedidos = xQueueCreate(1, sizeof(Solicitacao));
  respostas = xQueueCreate(1, sizeof(RespostaTotem));
  statusFila = xQueueCreate(1, sizeof(StatusTotem));
  // Semáforo binário, e não mutex: a tarefa segura `exclusao` durante todo o
  // trabalho com o Firebase, e o FreeRTOS só devolve a prioridade herdada
  // (por exemplo, a 18 do lwIP) quando a tarefa não segura mutex nenhum. Com
  // mutex, ela ficava em 18 o login inteiro. O loop só usa take sem espera.
  exclusao = xSemaphoreCreateBinary();
  if (exclusao) xSemaphoreGive(exclusao);
  if (pedidos && respostas && statusFila && exclusao) {
    estado(ConexaoTotem::INICIANDO);
    // Só esta tarefa acessa Firebase. Tela, touch e manutenção pertencem ao loop.
    // Prioridade igual à da tarefa ociosa do núcleo 0: a biblioteca espera o
    // TLS num laço sem pausa (até o timeout de 8 s) e, com prioridade maior,
    // a ociosa não rodava e o watchdog reiniciava o ESP. Wi-Fi e TCP/IP têm
    // prioridade própria, maior, e não são afetados.
    if (xTaskCreatePinnedToCore(tarefa, "paraai-cloud", 24576, nullptr, tskIDLE_PRIORITY,
                                nullptr, 0) == pdPASS) return true;
  }
  if (pedidos) vQueueDelete(pedidos);
  if (respostas) vQueueDelete(respostas);
  if (statusFila) vQueueDelete(statusFila);
  if (exclusao) vSemaphoreDelete(exclusao);
  pedidos = respostas = statusFila = nullptr;
  exclusao = nullptr;
  return false;
}
bool solicitarAtendimento(PedidoTotem tipo, const char* placa) {
  if (!pedidos || pausado || pedidoPendente || tipo == PedidoTotem::VINCULAR || !paraai::placaValida(placa)) return false;
  Solicitacao s{}; s.tipo = tipo; memcpy(s.placa, placa, 8);
  pedidoPendente = xQueueSend(pedidos, &s, 0) == pdTRUE;
  return pedidoPendente;
}
bool solicitarVinculo(const char* codigo) {
  if (!pedidos || pausado || pedidoPendente || !paraai::codigoInstalacaoValido(codigo)) return false;
  Solicitacao s{}; s.tipo = PedidoTotem::VINCULAR; memcpy(s.codigo, codigo, sizeof(s.codigo));
  pedidoPendente = xQueueSend(pedidos, &s, 0) == pdTRUE;
  return pedidoPendente;
}
bool receberResposta(RespostaTotem& r) {
  if (!respostas || xQueueReceive(respostas, &r, 0) != pdTRUE) return false;
  pedidoPendente = false;
  return true;
}
StatusTotem obterStatusTotem() {
  StatusTotem s{}; s.conexao = ConexaoTotem::INICIANDO;
  if (statusFila) xQueuePeek(statusFila, &s, 0);
  return s;
}
OrigemIdentidade origemIdentidade() { return origem.load(); }
bool suspenderAtendimento() {
  if (pausado) return true;
  if (pedidoPendente) return false;
  if (!exclusao || xSemaphoreTake(exclusao, 0) != pdTRUE) return false;
  pausado = true;
  return true;
}
void retomarAtendimento() {
  if (pausado) { pausado = false; xSemaphoreGive(exclusao); }
}
// A conta antiga continua na lista do site, sem equipamento: o dono pode
// bloqueá-la lá.
bool esquecerVinculo() {
  if (origem.load() != OrigemIdentidade::CODIGO) return false;
  Preferences preferencias;
  if (!preferencias.begin(NVS_IDENTIDADE, false)) return false;
  const bool apagou = preferencias.remove(CHAVE_IDENTIDADE);
  preferencias.end();
  return apagou;
}
