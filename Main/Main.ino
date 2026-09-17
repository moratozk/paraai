// ParaAí — totem de atendimento. ESP32 + ILI9341 + XPT2046.
// Sem sensores, servo, catraca ou simulação de presença física.
#include <Arduino.h>
#include <WiFi.h>
#include "Credenciais.h"
#include "Atendimento.h"
#include "LogicaTotem.h"
#include "DisplayUI.ino"
#include "ConfiguracaoWiFi.ino"

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
    RespostaTotem r{TipoResposta::ERRO, "SERVICO INDISPONIVEL", "Nao foi enviado um novo pedido", "Tente novamente"};
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
void manutencao() {
  atualizarStatusServico(ConexaoTotem::MANUTENCAO);
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
void pedirManutencao(int acao) {
  manutencaoSolicitada = acao;
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
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
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
  if (portalAutomaticoPendente && tela == Tela::INICIO && agora - inicio >= 15000) {
    portalAutomaticoPendente = false;
    pedirManutencao(1);
  }

  if ((tela == Tela::PLACA || tela == Tela::CADASTRO) && agora - ultimaInteracao >= INATIVIDADE_MS) voltarAoInicio();
  switch (tela) {
    case Tela::INICIO: {
      if (verificarPressaoLongaStatus()) { pedirManutencao(0); break; }
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
    if (tela == Tela::INICIO && (c == 'w' || c == 'W')) pedirManutencao(1);
    if (tela == Tela::INICIO && (c == 'c' || c == 'C')) pedirManutencao(2);
  }
  delay(8);
}
