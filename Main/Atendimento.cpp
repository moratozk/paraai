#include "Atendimento.h"
#include "LogicaTotem.h"
#include "Credenciais.h"
#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <time.h>
#include <cerrno>

namespace {
constexpr const char* PATIO = "estacionamentos/" ESTACIONAMENTO_ID;
constexpr uint32_t HEARTBEAT_MS = 60000;
constexpr uint32_t RETENTATIVA_MS = 15000;
struct Solicitacao { PedidoTotem tipo; char placa[8]; };
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

void estado(ConexaoTotem conexao, const char* etapa = "") {
  StatusTotem s{};
  s.conexao = conexao;
  snprintf(s.etapa, sizeof(s.etapa), "%s", etapa);
  xQueueOverwrite(statusFila, &s);
}
RespostaTotem resposta(TipoResposta tipo, const char* titulo,
                       const String& detalhe = "", const String& ajuda = "") {
  RespostaTotem r{};
  r.tipo = tipo;
  snprintf(r.titulo, sizeof(r.titulo), "%s", titulo);
  snprintf(r.detalhe, sizeof(r.detalhe), "%s", detalhe.c_str());
  snprintf(r.ajuda, sizeof(r.ajuda), "%s", ajuda.c_str());
  return r;
}
RespostaTotem falhaRede() {
  Serial.printf("[ATENDIMENTO] Operacao nao confirmada (HTTP %d).\n", fb.httpCode());
  return resposta(TipoResposta::ERRO, "NAO FOI CONFIRMADO", "Confira a conexao", "Confira o registro no painel");
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

struct MapaVagas { int livres = 0; int primeira = 0; bool existe = false; String revisao; };
bool mapaVagas(MapaVagas& mapa) {
  // Paginação limita o uso de RAM. Placa é a ocupação lógica; não interpretar
  // eco, GPIO ou antigos campos de sensores como presença física.
  bool usada[paraai::MAX_VAGAS + 1] = {};
  bool vista[paraai::MAX_VAGAS + 1] = {};
  int candidataExistente = 0;
  String revisaoCandidata, token;
  int paginas = 0;
  do {
    if (++paginas > 20) return false;
    if (!Firebase.Firestore.listDocuments(&fb, PROJECT_ID, "", String(PATIO) + "/vagas",
        16, token, "", "placa", false)) return false;
    FirebaseJson pagina;
    pagina.setJsonData(fb.payload());
    FirebaseJsonData item;
    for (int i = 0; i < 16; ++i) {
      String prefixo = "documents/[" + String(i) + "]";
      String nome, placa, revisao;
      if (!texto(pagina, prefixo + "/name", nome)) break;
      String id = nome.substring(nome.lastIndexOf('/') + 1);
      int n = id.toInt();
      if (n < 1 || n > paraai::MAX_VAGAS || id != String(n) || vista[n]) return false;
      vista[n] = true;
      // Documento criado pelo firmware antigo só com leitura pode não ter placa.
      if (!texto(pagina, prefixo + "/fields/placa/stringValue", placa) &&
          pagina.get(item, prefixo + "/fields/placa")) return false;
      if (!placa.isEmpty() && !paraai::placaValida(placa.c_str())) return false;
      usada[n] = !placa.isEmpty();
      if (n <= capacidade && !usada[n] &&
          (candidataExistente == 0 || n < candidataExistente)) {
        if (!texto(pagina, prefixo + "/updateTime", revisao)) return false;
        candidataExistente = n;
        revisaoCandidata = revisao;
      }
    }
    token = "";
    texto(pagina, "nextPageToken", token);
    taskYIELD();
  } while (!token.isEmpty());
  mapa = {};
  for (int n = 1; n <= capacidade; ++n) {
    if (!usada[n]) {
      ++mapa.livres;
      if (mapa.primeira == 0) mapa.primeira = n;
    }
  }
  if (mapa.primeira) {
    mapa.existe = vista[mapa.primeira];
    if (mapa.existe) {
      if (mapa.primeira != candidataExistente) return false;
      mapa.revisao = revisaoCandidata;
    }
  }
  return true;
}
void escrita(std::vector<firebase_firestore_document_write_t>& lote, const String& caminho,
             FirebaseJson& json, const char* campos, const String& revisao, bool existe) {
  firebase_firestore_document_write_t e;
  e.type = firebase_firestore_document_write_type_update;
  e.update_document_path = caminho.c_str();
  e.update_document_content = json.raw();
  e.update_masks = campos;
  if (revisao.length()) e.current_document.update_time = revisao.c_str();
  else e.current_document.exists = existe ? "true" : "false";
  lote.push_back(e);
}
void dadosVaga(FirebaseJson& vaga, const String& placa) {
  vaga.set("fields/placa/stringValue", placa);
  vaga.set("fields/ocupada/booleanValue", !placa.isEmpty());
  vaga.set("fields/origemOcupacao/stringValue", "registro");
  // leituraValida é removido pelo updateMask, não fingimos uma leitura física.
}
bool heartbeat() {
  MapaVagas mapa;
  if (!configurarPatio() || !mapaVagas(mapa)) return false;
  FirebaseJson dados;
  dados.set("fields/ultimaAtualizacao/integerValue", String(static_cast<long long>(time(nullptr))));
  dados.set("fields/vagasLivres/integerValue", String(mapa.livres));
  dados.set("fields/vagasEmOperacao/integerValue", String(capacidade));
  dados.set("fields/tarifaAplicadaTotem/doubleValue", tarifa);
  dados.set("fields/modoTotem/stringValue", "atendimento");
  // Remove o antigo limite de sensores; a UI web já trata sua ausência.
  if (!Firebase.Firestore.patchDocument(&fb, PROJECT_ID, "", PATIO, dados.raw(),
      "ultimaAtualizacao,vagasLivres,vagasEmOperacao,tarifaAplicadaTotem,modoTotem,vagasSuportadasTotem", "", "true")) return false;
  bool ok = Firebase.Firestore.patchDocument(&fb, PROJECT_ID, "", String("catalogoEstacionamentos/") + ESTACIONAMENTO_ID,
    dados.raw(), "ultimaAtualizacao,vagasLivres,vagasEmOperacao", "", "true");
  return ok || fb.httpCode() == 404;
}

RespostaTotem executar(const Solicitacao& pedido) {
  const String placa = pedido.placa;
  const String caminho = "veiculos/" + placa;
  if (!paraai::placaValida(pedido.placa)) return resposta(TipoResposta::ALERTA, "CONFIRA A PLACA", placa);
  estado(ConexaoTotem::PRONTO, "Consultando a placa...");
  FirebaseJson veiculo;
  if (!consultar(caminho, veiculo)) {
    if (fb.httpCode() != 404) return falhaRede();
    if (pedido.tipo == PedidoTotem::SAIDA) return resposta(TipoResposta::ALERTA, "PLACA NAO ENCONTRADA", placa, "Confira os caracteres");
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
    if (!Firebase.Firestore.createDocument(&fb, PROJECT_ID, "", caminho, novo.raw()) && fb.httpCode() != 409) return falhaRede();
    // Releitura também cobre um cadastro concorrente; nunca sobrescrever dono/saldo.
    if (!consultar(caminho, veiculo)) return falhaRede();
  }
  FirebaseJsonData ativo;
  int64_t numeroVaga = -1, entrada = 0;
  double saldo = NAN, congelada = NAN;
  String local, revisao;
  texto(veiculo, "fields/estacionamentoId/stringValue", local);
  if (!texto(veiculo, "updateTime", revisao) || revisao.isEmpty() ||
      !inteiro(veiculo, "vagaAtual", numeroVaga) || numeroVaga < 0 || numeroVaga > paraai::MAX_VAGAS ||
      !numero(veiculo, "saldo", saldo)) return resposta(TipoResposta::ERRO, "CADASTRO INCONSISTENTE", placa, "Procure o responsavel");
  if (!veiculo.get(ativo, "fields/ativo/booleanValue") || !ativo.to<bool>())
    return resposta(TipoResposta::ALERTA, "CADASTRO INATIVO", placa, "Procure o responsavel");

  if (pedido.tipo != PedidoTotem::SAIDA) {
    if (numeroVaga != 0 || !local.isEmpty())
      return resposta(TipoResposta::ALERTA, "ENTRADA JA REGISTRADA", placa, "Use SAIDA ao terminar");
    estado(ConexaoTotem::PRONTO, "Verificando disponibilidade...");
    MapaVagas mapa;
    if (!configurarPatio() || !mapaVagas(mapa)) return falhaRede();
    if (!mapa.primeira) return resposta(TipoResposta::ALERTA, "ESTACIONAMENTO LOTADO", "Nenhuma vaga disponivel", "Tente mais tarde");
    FirebaseJson alteracao, vaga;
    alteracao.set("fields/vagaAtual/integerValue", String(mapa.primeira));
    alteracao.set("fields/horaEntrada/integerValue", String(static_cast<long long>(time(nullptr))));
    alteracao.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
    alteracao.set("fields/tarifaHoraEntrada/doubleValue", tarifa);
    dadosVaga(vaga, placa);
    std::vector<firebase_firestore_document_write_t> lote;
    escrita(lote, caminho, alteracao, "vagaAtual,horaEntrada,estacionamentoId,tarifaHoraEntrada", revisao, true);
    escrita(lote, String(PATIO) + "/vagas/" + String(mapa.primeira), vaga,
      "placa,ocupada,origemOcupacao,leituraValida", mapa.revisao, mapa.existe);
    estado(ConexaoTotem::PRONTO, "Registrando entrada...");
    if (!Firebase.Firestore.commitDocument(&fb, PROJECT_ID, "", lote, "")) return falhaRede();
    sincronizado = false;
    return resposta(TipoResposta::SUCESSO, "ENTRADA CONFIRMADA", placa,
      "Vaga " + String(mapa.primeira) + " | R$ " + valorEmReais(tarifa) + "/h");
  }
  if (numeroVaga == 0) return resposta(TipoResposta::ALERTA, "SEM ENTRADA ABERTA", placa, "Nenhuma saida a registrar");
  if (local != ESTACIONAMENTO_ID) return resposta(TipoResposta::ALERTA, "ENTRADA EM OUTRO LOCAL", placa, "Use o totem do local de entrada");
  paraai::Cobranca cobranca;
  int64_t agora = time(nullptr);
  if (!inteiro(veiculo, "horaEntrada", entrada) || !numero(veiculo, "tarifaHoraEntrada", congelada) ||
      !paraai::calcularCobranca(entrada, agora, congelada, saldo, cobranca))
    return resposta(TipoResposta::ERRO, "ESTADIA INCONSISTENTE", "Confira horario e tarifa", "Procure o responsavel");
  String caminhoVaga = String(PATIO) + "/vagas/" + String(static_cast<int>(numeroVaga));
  FirebaseJson vagaAtual;
  String placaVaga, revisaoVaga;
  if (!consultar(caminhoVaga, vagaAtual, "placa") || !texto(vagaAtual, "updateTime", revisaoVaga) ||
      !texto(vagaAtual, "fields/placa/stringValue", placaVaga) || placaVaga != placa)
    return resposta(TipoResposta::ERRO, "VAGA INCONSISTENTE", "Saida nao registrada", "Procure o responsavel");
  FirebaseJson alteracao, vaga, recibo;
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
  recibo.set("fields/tarifaHora/doubleValue", congelada);
  recibo.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
  std::vector<firebase_firestore_document_write_t> lote;
  escrita(lote, caminho, alteracao, "vagaAtual,horaEntrada,estacionamentoId,saldo,tarifaHoraEntrada", revisao, true);
  escrita(lote, caminhoVaga, vaga, "placa,ocupada,origemOcupacao,leituraValida", revisaoVaga, true);
  escrita(lote, "historico/" + placa + "_" + String(static_cast<long long>(entrada)), recibo, "", "", false);
  estado(ConexaoTotem::PRONTO, "Registrando saida...");
  if (!Firebase.Firestore.commitDocument(&fb, PROJECT_ID, "", lote, "")) return falhaRede();
  sincronizado = false;
  return resposta(TipoResposta::SUCESSO, "SAIDA CONFIRMADA", "R$ " + valorEmReais(cobranca.valor),
    String(static_cast<long long>(cobranca.segundos / 60)) + " min | " + placa);
}

void tarefa(void*) {
  for (;;) {
    if (xSemaphoreTake(exclusao, pdMS_TO_TICKS(20)) != pdTRUE) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }
    bool pronto = false;
    if (WiFi.status() != WL_CONNECTED) estado(ConexaoTotem::SEM_WIFI);
    else {
      if (!relogioIniciado) { configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com"); relogioIniciado = true; }
      if (time(nullptr) < paraai::PRIMEIRO_TIMESTAMP_VALIDO) estado(ConexaoTotem::AJUSTANDO_HORA);
      else {
        if (!iniciado) {
          config.api_key = API_KEY;
          config.database_url = DATABASE_URL;
          config.timeout.socketConnection = 8000;
          config.timeout.serverResponse = 10000;
          auth.user.email = TOTEM_EMAIL;
          auth.user.password = TOTEM_PASSWORD;
          fb.setResponseSize(12288);
          Firebase.begin(&config, &auth);
          Firebase.reconnectWiFi(false); // A UI controla a rede, inclusive o portal.
          iniciado = true;
        }
        pronto = Firebase.ready();
        estado(pronto ? (patioValidado ? ConexaoTotem::PRONTO :
          (ultimaTentativa == 0 ? ConexaoTotem::INICIANDO : ConexaoTotem::ERRO_CONFIGURACAO)) : ConexaoTotem::AUTENTICANDO);
      }
    }
    Solicitacao pedido;
    if (xQueueReceive(pedidos, &pedido, 0) == pdTRUE) {
      RespostaTotem r = pronto ? executar(pedido)
        : resposta(TipoResposta::ERRO, "CONEXAO INDISPONIVEL", "Aguarde a reconexao", "Nenhuma operacao foi enviada");
      xQueueOverwrite(respostas, &r);
    } else if (pronto && uxQueueMessagesWaiting(respostas) == 0 &&
               (!sincronizado || millis() - ultimoHeartbeat >= HEARTBEAT_MS) &&
               (ultimaTentativa == 0 || millis() - ultimaTentativa >= RETENTATIVA_MS)) {
      ultimaTentativa = millis();
      patioValidado = heartbeat();
      if (patioValidado) { ultimoHeartbeat = millis(); sincronizado = true; }
      else estado(ConexaoTotem::ERRO_CONFIGURACAO);
    }
    xSemaphoreGive(exclusao);
    vTaskDelay(pdMS_TO_TICKS(30));
  }
}
} // namespace

bool iniciarAtendimento() {
  if (pedidos) return true;
  pedidos = xQueueCreate(1, sizeof(Solicitacao));
  respostas = xQueueCreate(1, sizeof(RespostaTotem));
  statusFila = xQueueCreate(1, sizeof(StatusTotem));
  exclusao = xSemaphoreCreateMutex();
  if (pedidos && respostas && statusFila && exclusao) {
    estado(ConexaoTotem::INICIANDO);
    // Só esta tarefa acessa Firebase. Tela, touch e manutenção pertencem ao loop.
    if (xTaskCreatePinnedToCore(tarefa, "paraai-cloud", 24576, nullptr, 1, nullptr, 0) == pdPASS) return true;
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
  if (!pedidos || pausado || pedidoPendente || !paraai::placaValida(placa)) return false;
  Solicitacao s{}; s.tipo = tipo; memcpy(s.placa, placa, 8);
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
