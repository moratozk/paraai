// ParaAí — totem de atendimento. Placa ESP32 CYD de 2,8" (ST7789 + XPT2046).
// Sem sensores, servo, catraca ou simulação de presença física.
#include <Arduino.h>
#include <WiFi.h>
#include "Credenciais.h"
#include "Atendimento.h"
#include "LogicaTotem.h"
#include "DisplayUI.ino"
#include "ConfiguracaoWiFi.ino"

#ifndef MANUTENCAO_PIN
#error "Defina MANUTENCAO_PIN (4 a 8 digitos) em Credenciais.h; veja Credenciais.example.h."
#endif
static_assert(paraai::pinFormatoValido(MANUTENCAO_PIN), "MANUTENCAO_PIN precisa ter de 4 a 8 digitos.");

enum class Tela { INICIO, PLACA, PROCESSANDO, CADASTRO, RESULTADO, AGUARDANDO_MANUTENCAO };
Tela tela = Tela::INICIO;
Operacao operacao = OP_NENHUMA;
FormatoPlaca formato = FORMATO_NAO_ESCOLHIDO;
String placa;
bool servicoIniciado = false;
bool portalAutomaticoPendente = true;
unsigned long inicio = 0, ultimaInteracao = 0, resultadoDesde = 0;
unsigned long ultimaTentativaWifi = 0, processamentoDesde = 0;
const unsigned long INATIVIDADE_MS = 60000;
const unsigned long RESULTADO_MS = 8000;
int manutencaoSolicitada = 0; // 0 central, 1 Wi-Fi, 2 calibração
bool manutencaoExigePin = true;
uint8_t errosPin = 0;
bool pinBloqueado = false;
unsigned long pinBloqueadoDesde = 0;
const uint8_t MAX_ERROS_PIN = 5;
const unsigned long BLOQUEIO_PIN_MS = 5UL * 60UL * 1000UL;

void voltarAoInicio() {
  placa = "";
  operacao = OP_NENHUMA;
  formato = FORMATO_NAO_ESCOLHIDO;
  tela = Tela::INICIO;
  ultimaInteracao = millis();
  definirOperacaoVisual(OP_NENHUMA);
  desenharTelaInicial();
}
void exibirResposta(const RespostaTotem& r) {
  if (r.tipo == TipoResposta::CONFIRMAR_CADASTRO) {
    tela = Tela::CADASTRO;
    ultimaInteracao = millis();
    desenharTelaConfirmarCadastro(placa);
    return;
  }
  TipoResultado tipo = r.tipo == TipoResposta::SUCESSO ? RESULTADO_SUCESSO
    : r.tipo == TipoResposta::ALERTA ? RESULTADO_ALERTA : RESULTADO_ERRO;
  desenharTelaResultado(tipo, r.titulo, r.detalhe, r.ajuda);
  desenharBotaoConcluir();
  resultadoDesde = millis();
  tela = Tela::RESULTADO;
}
void enviar(PedidoTotem pedido) {
  if (!servicoIniciado || !solicitarAtendimento(pedido, placa.c_str())) {
    RespostaTotem r{TipoResposta::ERRO, "SERVICO INDISPONIVEL", "Pedido nao enviado", "Tente novamente"};
    exibirResposta(r);
    return;
  }
  tela = Tela::PROCESSANDO;
  processamentoDesde = millis();
  desenharTelaProcessando("Aguarde um instante");
}
void trocarWifi() {
  // A tarefa Firebase está pausada durante toda a manutenção. Sem disputa
  // pelo rádio, sem fechar conexão enquanto há uma transação em andamento.
  ResultadoConfiguracaoWifi resultado = executarPortalConfiguracaoWifi(true);
  portalAutomaticoPendente = false;
  if (resultado == WIFI_CONFIG_SUCESSO) {
    desenharTelaResultado(RESULTADO_SUCESSO, "WI-FI CONFIGURADO", obterSsidWifiConfigurado(), "Reiniciando o atendimento");
    delay(1500);
    ESP.restart();
  }
}
// Toque longo exige PIN. Serial (USB, gabinete aberto) e o primeiro portal,
// sem rede alguma configurada, não têm credencial de rede a proteger.
bool conferirPinManutencao() {
  if (pinBloqueado && millis() - pinBloqueadoDesde < BLOQUEIO_PIN_MS) {
    desenharTelaResultado(RESULTADO_ALERTA, "ACESSO BLOQUEADO", "Muitas tentativas de PIN", "Aguarde alguns minutos");
    delay(3000);
    return false;
  }
  pinBloqueado = false;
  char digitado[paraai::PIN_MAX_DIGITOS + 1] = {};
  uint8_t digitos = 0;
  desenharTelaPin();
  unsigned long interacao = millis();
  bool liberado = false;
  while (millis() - interacao < 30000) {
    atualizarFeedbackTeclado();
    const char tecla = verificarToquePin();
    if (!tecla) { delay(10); continue; }
    interacao = millis();
    if (tecla == PIN_APAGAR) {
      if (digitos == 0) break;
      digitado[--digitos] = '\0';
      atualizarDigitosPin(digitos);
    } else if (tecla == PIN_CONFIRMAR) {
      if (paraai::pinConfere(digitado, MANUTENCAO_PIN)) { liberado = true; break; }
      memset(digitado, 0, sizeof(digitado));
      digitos = 0;
      if (++errosPin >= MAX_ERROS_PIN) {
        errosPin = 0;
        pinBloqueado = true;
        pinBloqueadoDesde = millis();
        Serial.println("[TOTEM] Manutencao bloqueada por 5 min apos PIN incorreto.");
        desenharTelaResultado(RESULTADO_ALERTA, "ACESSO BLOQUEADO", "Muitas tentativas de PIN", "Aguarde alguns minutos");
        delay(3000);
        break;
      }
      delay(800); // Desacelera tentativas em sequência.
      desenharTelaPin("PIN INCORRETO");
    } else if (digitos < paraai::PIN_MAX_DIGITOS) {
      digitado[digitos++] = tecla;
      atualizarDigitosPin(digitos);
    }
  }
  memset(digitado, 0, sizeof(digitado));
  if (liberado) errosPin = 0;
  return liberado;
}
void manutencao() {
  atualizarStatusServico(ConexaoTotem::MANUTENCAO);
  if (manutencaoExigePin && !conferirPinManutencao()) {
    retomarAtendimento();
    voltarAoInicio();
    return;
  }
  if (manutencaoSolicitada == 1) trocarWifi();
  else if (manutencaoSolicitada == 2) executarCalibracaoTouch(true);
  else {
    desenharTelaConfiguracoes();
    unsigned long interacao = millis();
    while (millis() - interacao < INATIVIDADE_MS) {
      int acao = verificarToqueConfiguracoes();
      if (acao == 3) break;
      if (acao == 1) { trocarWifi(); interacao = millis(); desenharTelaConfiguracoes(); }
      if (acao == 2) { executarCalibracaoTouch(true); interacao = millis(); desenharTelaConfiguracoes(); }
      delay(10);
    }
  }
  retomarAtendimento();
  voltarAoInicio();
}
void pedirManutencao(int acao, bool exigirPin) {
  manutencaoSolicitada = acao;
  manutencaoExigePin = exigirPin;
  tela = Tela::AGUARDANDO_MANUTENCAO;
  processamentoDesde = millis();
  desenharTelaProcessando("Preparando configuracoes...");
}

void setup() {
  Serial.begin(115200);
  initUI(); // A tela aparece antes da espera por Wi-Fi/NTP/Firebase.
  carregarConfiguracaoWifi();
  // WiFi.mode precisa anteceder WiFi.begin quando não existe rede salva.
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(ParaAiWifiConfig::POTENCIA_WIFI); // Ver ConfiguracaoWiFi.ino.
  iniciarReconexaoWifiConfigurado();
  inicio = ultimaTentativaWifi = millis();
  servicoIniciado = iniciarAtendimento();
  voltarAoInicio();
  Serial.println("[TOTEM] Atendimento iniciado. S=status; W=Wi-Fi; C=calibracao.");
}

void loop() {
  const unsigned long agora = millis();
  StatusTotem status = obterStatusTotem();
  atualizarStatusServico(servicoIniciado ? status.conexao : ConexaoTotem::ERRO_CONFIGURACAO);
  atualizarRelogioCabecalho();
  atualizarFeedbackTeclado();

  if (WiFi.status() == WL_CONNECTED) portalAutomaticoPendente = false;
  // Reconexão não interrompe a digitação nem troca o rádio de um pedido ativo.
  if (tela == Tela::INICIO && WiFi.status() != WL_CONNECTED &&
      agora - ultimaTentativaWifi >= 15000) {
    ultimaTentativaWifi = agora;
    iniciarReconexaoWifiConfigurado();
  }
  // Só abre sozinho sem nenhuma rede para tentar (instalação). Com rede
  // configurada, uma queda de energia apenas reconecta quando o roteador voltar.
  if (portalAutomaticoPendente && tela == Tela::INICIO && agora - inicio >= 15000) {
    portalAutomaticoPendente = false;
    if (obterSsidWifiConfigurado().isEmpty()) pedirManutencao(1, false);
  }

  if ((tela == Tela::PLACA || tela == Tela::CADASTRO) && agora - ultimaInteracao >= INATIVIDADE_MS) voltarAoInicio();
  switch (tela) {
    case Tela::INICIO: {
      if (verificarPressaoLongaStatus()) { pedirManutencao(0, true); break; }
      Operacao escolha = verificarToqueTelaInicial();
      if (escolha != OP_NENHUMA) {
        operacao = escolha;
        definirOperacaoVisual(operacao);
        placa = "";
        formato = FORMATO_NAO_ESCOLHIDO;
        ultimaInteracao = agora;
        tela = Tela::PLACA;
        desenharTelaTeclado(placa, formato);
      }
      break;
    }
    case Tela::PLACA: {
      EventoTeclado evento = verificarToqueTeclado(placa, formato);
      if (evento.acao == TECLADO_NENHUMA) break;
      ultimaInteracao = agora;
      const ModoTecladoInterno anterior = obterModoTeclado(placa, formato);
      if (evento.acao == TECLADO_CANCELAR || (evento.acao == TECLADO_APAGAR && placa.isEmpty())) { voltarAoInicio(); break; }
      if (evento.acao == TECLADO_APAGAR && !placa.isEmpty()) {
        placa.remove(placa.length() - 1);
        if (placa.length() <= 4) formato = FORMATO_NAO_ESCOLHIDO;
      } else if (evento.acao == TECLADO_FORMATO_ANTIGA) formato = FORMATO_ANTIGA;
      else if (evento.acao == TECLADO_FORMATO_MERCOSUL) formato = FORMATO_MERCOSUL;
      else if (evento.acao == TECLADO_CARACTERE && placa.length() < 7) placa += evento.caractere;
      else if (evento.acao == TECLADO_CONFIRMAR && paraai::placaValida(placa.c_str())) {
        enviar(operacao == OP_ENTRADA ? PedidoTotem::ENTRADA : PedidoTotem::SAIDA);
        break;
      }
      atualizarDigitacao(placa, formato, anterior);
      break;
    }
    case Tela::PROCESSANDO: {
      // Só a UI acessa TFT/touch. Mesmo em TLS lento, animação e relógio vivem.
      String etapa = status.etapa[0] ? status.etapa : "Conectando ao atendimento...";
      if (agora - processamentoDesde >= 20000) etapa = "A rede esta demorando...";
      atualizarProcessamento(etapa, agora - processamentoDesde);
      RespostaTotem r;
      if (receberResposta(r)) exibirResposta(r);
      break;
    }
    case Tela::CADASTRO: {
      int escolha = verificarToqueConfirmacao();
      if (escolha == 0) voltarAoInicio();
      if (escolha == 1) enviar(PedidoTotem::CADASTRAR_ENTRADA);
      break;
    }
    case Tela::RESULTADO:
      if (verificarToqueConcluir() || agora - resultadoDesde >= RESULTADO_MS) voltarAoInicio();
      break;
    case Tela::AGUARDANDO_MANUTENCAO:
      atualizarProcessamento("Preparando configuracoes...", agora - processamentoDesde);
      if (!servicoIniciado || suspenderAtendimento()) manutencao();
      break;
  }

  if (Serial.available()) {
    char c = Serial.read();
    if (c == 's' || c == 'S') {
      Serial.printf("[TOTEM] Wi-Fi=%s | estado=%d | heap=%u | sem sensores/atuadores\n",
        WiFi.status() == WL_CONNECTED ? "conectado" : "offline",
        static_cast<int>(status.conexao), ESP.getFreeHeap());
    }
    if (tela == Tela::INICIO && (c == 'w' || c == 'W')) pedirManutencao(1, false);
    if (tela == Tela::INICIO && (c == 'c' || c == 'C')) pedirManutencao(2, false);
  }
  delay(8);
}
