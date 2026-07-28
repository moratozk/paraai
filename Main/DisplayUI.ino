// =========================================================================
// MÓDULO DE INTERFACE GRÁFICA (DisplayUI.ino)
// Tela ILI9341 320x240 + Touch XPT2046
//
// Diretrizes de layout (é um totem, operado em pé e com o dedo):
//  - nada de texto essencial em tamanho 1: o mínimo é tamanho 2 (10x14px)
//  - alvos de toque com pelo menos ~30px de lado
//  - cabeçalho enxuto (marca + status), o título da tela vai no conteúdo
// =========================================================================

#ifndef DISPLAY_UI_H
#define DISPLAY_UI_H

#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <time.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
// Fontes próprias, geradas de Bahnschrift (a DIN da Microsoft, mesma família
// da sinalização rodoviária). As FreeSans que vêm na biblioteca são derivadas
// das URW de 1996 e ficam largas e mal espaçadas nesta tela; a condensada
// cabe mais texto no mesmo espaço e se lê melhor de longe.
// Para regerar: python Ferramentas/gerar_fonte.py
#include "ParaAiGrande.h"
#include "ParaAiMedio.h"
#include "ParaAiPequeno.h"
#include <Fonts/FreeMonoBold12pt7b.h>

#define FONTE_GIGANTE (&ParaAiGrande)          // cap-height 32px
#define FONTE_GRANDE  (&ParaAiMedio)           // cap-height 21px
#define FONTE_MEDIA   (&ParaAiPequeno)         // cap-height 15px
#define FONTE_PEQUENA (&ParaAiPequeno)
#define FONTE_PLACA   (&FreeMonoBold12pt7b)    // mono, como placa de veículo

// -------------------------------------------------------------------------
// PINOS DA TELA + TOUCH (confirmados na fiação física real)
// -------------------------------------------------------------------------
#define TFT_SCLK   14
#define TFT_MOSI   13
#define TFT_MISO   12
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    -1   // ligado ao EN do ESP32 (reset compartilhado)
#define TFT_LED    21   // backlight - precisa ligar em HIGH por código
#define TOUCH_CS   33

// T_CLK, T_DIN e T_DO do touch são fios FISICAMENTE separados do
// SCK/SDI/SDO da tela neste módulo - por isso usam um segundo SPI (HSPI),
// independente do da tela (VSPI). Validado pelo TesteTouch.ino.
#define TOUCH_SCLK 25   // T_CLK do módulo
#define TOUCH_MOSI 32   // T_DIN do módulo (precisa ser GPIO de saída - NAO usar VN/39)
#define TOUCH_MISO 36   // T_DO do módulo (pino "VP" do ESP32)

#define TFT_SPI_FREQ 40000000UL

SPIClass spiTela(VSPI);
SPIClass spiTouch(HSPI);
Adafruit_ILI9341 tft = Adafruit_ILI9341(&spiTela, TFT_DC, TFT_CS, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS);

// -------------------------------------------------------------------------
// CALIBRAÇÃO DO TOUCH
// Estes são valores GENÉRICOS. Cada painel XPT2046 varia de fábrica, e usar
// os genéricos faz o toque cair na tecla vizinha (tocar no "O" e registrar
// "I", por exemplo).
//
// Para calibrar o SEU painel: grave o sketch CalibracaoTouch/CalibracaoTouch.ino,
// toque nas 4 miras e cole aqui as 4 linhas que o Monitor Serial imprimir.
// -------------------------------------------------------------------------
#define TOUCH_X_MIN 200
#define TOUCH_X_MAX 3700
#define TOUCH_Y_MIN 200
#define TOUCH_Y_MAX 3700

const unsigned long TOQUE_COOLDOWN_MS = 300;
static unsigned long ultimoToqueMillis = 0;

// -------------------------------------------------------------------------
// PALETA (identidade ParaAí: âmbar viário sobre asfalto)
// -------------------------------------------------------------------------
uint16_t corFundo, corPainel, corHeader, corDestaque, corSucesso, corAlerta, corErro;
uint16_t corTexto, corTextoFraco, corBotao, corBotaoBorda;
uint16_t corHeaderTexto, corHeaderFraco, corFaixa;

enum TipoResultado { RESULTADO_SUCESSO, RESULTADO_ALERTA, RESULTADO_ERRO };

// -------------------------------------------------------------------------
// GEOMETRIA (constantes de layout - mudar aqui muda a tela toda)
// -------------------------------------------------------------------------
const int TELA_W = 320, TELA_H = 240;
const int HEADER_H = 30;          // cabeçalho enxuto
const int FAIXA_Y  = HEADER_H;    // faixa tracejada logo abaixo
const int CONTEUDO_Y = HEADER_H + 8;

// teclado
const char* LINHAS_TECLADO[4]  = {"QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM", "0123456789"};
const int   TECLA_NUM_CHARS[4] = {10, 9, 7, 10};
const int   TECLA_W = 28, TECLA_H = 28, TECLA_GAP = 2;
const int   TECLA_PITCH = TECLA_W + TECLA_GAP;      // 30
const int   TECLA_ROW_Y[4] = {74, 106, 138, 170};
const int   BOTAO_ACAO_Y = 204, BOTAO_ACAO_H = 32;

// botões SIM/NAO da tela de confirmação
const int CONF_BTN_Y = 176, CONF_BTN_H = 46;
const int CONF_BTN_W = 132;
const int CONF_BTN_X_NAO = 20, CONF_BTN_X_SIM = 168;

// botões ENTRADA / SAÍDA da tela inicial (empilhados, bem grandes).
// Descidos para caber a saudação de duas linhas acima deles.
const int BTN_OP_W = 264, BTN_OP_H = 62;
const int BTN_ENTRADA_X = 28, BTN_ENTRADA_Y = 88;
const int BTN_SAIDA_X   = 28, BTN_SAIDA_Y   = 160;

// o que o motorista escolheu na tela inicial
enum Operacao { OP_NENHUMA, OP_ENTRADA, OP_SAIDA };

// -------------------------------------------------------------------------
// API PÚBLICA
// -------------------------------------------------------------------------
void initUI();
void desenharTelaInicial();
Operacao verificarToqueTelaInicial();
void desenharTelaTeclado(String placaAtual);
void atualizarCaixaPlaca(String placaAtual);
char verificarToqueTeclado();
void desenharTelaProcessando(String mensagem);
void desenharTelaResultado(TipoResultado tipo, String linha1, String linha2, String linha3);
void desenharTelaConfirmarCadastro(String placa);
int  verificarToqueConfirmacao();   // 1 = SIM, 0 = NAO, -1 = nada
void atualizarRelogioCabecalho();

// helpers internos
void initCores();
int  offsetXLinha(int indiceLinha);
void centralizarTexto(String texto, int yTopo, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void textoCentralizadoEm(String texto, int xCaixa, int yCaixa, int wCaixa, int hCaixa, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void desenharIconeWifi(int x, int y);
void desenharStatusCabecalho();
void desenharFaixaTracejada(int y);
void desenharCabecalho();
void desenharLogoP(int cx, int cy, int lado);
void desenharSplash();
void desenharTeclado();
void desenharIconeCarregando(int cx, int cy, int raio);
void desenharIconeResultado(TipoResultado tipo, uint16_t cor);
void desenharPlacaVeicular(int x, int y, int w, int h, String texto);
bool toqueDentro(int tx, int ty, int x, int y, int w, int h);
void lerToqueTela(int &x, int &y);
int  alturaFonte(const GFXfont *fonte, uint8_t tamanho);
int  larguraTexto(String texto, const GFXfont *fonte, uint8_t tamanho);

int offsetXLinha(int indiceLinha) {
  int larguraLinha = TECLA_NUM_CHARS[indiceLinha] * TECLA_PITCH - TECLA_GAP;
  return (TELA_W - larguraLinha) / 2;
}

// -------------------------------------------------------------------------
// INICIALIZAÇÃO
// -------------------------------------------------------------------------
void initCores() {
  corFundo       = tft.color565(12, 14, 18);    // asfalto
  corPainel      = tft.color565(26, 30, 38);    // cartão sobre o asfalto
  corHeader      = tft.color565(255, 196, 0);   // âmbar viário
  corDestaque    = tft.color565(255, 196, 0);
  corSucesso     = tft.color565(46, 214, 130);
  corAlerta      = tft.color565(255, 160, 20);
  corErro        = tft.color565(255, 84, 96);
  corTexto       = tft.color565(244, 246, 251);
  corTextoFraco  = tft.color565(150, 158, 175);
  corBotao       = tft.color565(32, 37, 47);
  corBotaoBorda  = tft.color565(70, 78, 94);
  corHeaderTexto = tft.color565(12, 14, 18);
  corHeaderFraco = tft.color565(190, 145, 0);
  corFaixa       = tft.color565(64, 70, 84);
}

void initUI() {
  pinMode(TFT_LED, OUTPUT);
  digitalWrite(TFT_LED, HIGH);

  spiTela.begin(TFT_SCLK, TFT_MISO, TFT_MOSI, TFT_CS);
  tft.begin(TFT_SPI_FREQ);
  tft.setRotation(3);

  spiTouch.begin(TOUCH_SCLK, TOUCH_MISO, TOUCH_MOSI, TOUCH_CS);
  ts.begin(spiTouch);
  ts.setRotation(3);

  initCores();
  tft.fillScreen(corFundo);
  desenharSplash();
  Serial.println("[UI] Display e Touch XPT2046 inicializados.");
}

// -------------------------------------------------------------------------
// TEXTO
//
// IMPORTANTE - posicionamento vertical:
// Só usamos getTextBounds para a LARGURA (centralização horizontal), que é
// confiável. Para o eixo Y usamos a baseline, que é o comportamento nativo
// das fontes GFX e não depende de como a versão da biblioteca calcula os
// bounds. Depender de getTextBounds no Y fazia o texto "subir" em algumas
// versões e invadir o elemento de cima (ex.: o título entrando no ícone).
// -------------------------------------------------------------------------

// Altura das maiúsculas de cada fonte (medida nos arquivos .h da Adafruit).
// Serve para centralizar verticalmente sem depender de getTextBounds.
int alturaFonte(const GFXfont *fonte, uint8_t tamanho) {
  int base;
  if (fonte == FONTE_GIGANTE)      base = 32;
  else if (fonte == FONTE_GRANDE)  base = 21;
  else if (fonte == FONTE_MEDIA)   base = 15;
  else if (fonte == FONTE_PEQUENA) base = 15;
  else if (fonte == FONTE_PLACA)   base = 17;
  else                             base = 7;   // fonte padrão 5x7
  return base * tamanho;
}

int larguraTexto(String texto, const GFXfont *fonte, uint8_t tamanho) {
  tft.setFont(fonte);
  tft.setTextSize(tamanho);
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(texto, 0, 0, &x1, &y1, &w, &h);
  return (int)w;
}

// yTopo = onde o topo das maiúsculas deve ficar.
void centralizarTexto(String texto, int yTopo, uint16_t cor, const GFXfont *fonte, uint8_t tamanho) {
  int w = larguraTexto(texto, fonte, tamanho);
  tft.setTextColor(cor);
  int x = (TELA_W - w) / 2;
  if (fonte == nullptr) {
    tft.setCursor(x, yTopo);                              // fonte padrão: origem no topo
  } else {
    tft.setCursor(x, yTopo + alturaFonte(fonte, tamanho)); // custom: origem na baseline
  }
  tft.print(texto);
}

void textoCentralizadoEm(String texto, int xCaixa, int yCaixa, int wCaixa, int hCaixa, uint16_t cor, const GFXfont *fonte, uint8_t tamanho) {
  int w = larguraTexto(texto, fonte, tamanho);
  int h = alturaFonte(fonte, tamanho);
  tft.setTextColor(cor);
  int x = xCaixa + (wCaixa - w) / 2;
  int yTopo = yCaixa + (hCaixa - h) / 2;
  if (fonte == nullptr) {
    tft.setCursor(x, yTopo);
  } else {
    tft.setCursor(x, yTopo + h);
  }
  tft.print(texto);
}

bool toqueDentro(int tx, int ty, int x, int y, int w, int h) {
  return (tx >= x && tx <= x + w && ty >= y && ty <= y + h);
}

// Converte a leitura bruta do XPT2046 em coordenada de tela, já limitada
// à área visível. Centralizado numa função só para que a calibração valha
// igualmente para todas as telas.
void lerToqueTela(int &x, int &y) {
  TS_Point p = ts.getPoint();
  x = map(p.x, TOUCH_X_MIN, TOUCH_X_MAX, 0, TELA_W);
  y = map(p.y, TOUCH_Y_MIN, TOUCH_Y_MAX, 0, TELA_H);
  x = constrain(x, 0, TELA_W - 1);
  y = constrain(y, 0, TELA_H - 1);
}

// -------------------------------------------------------------------------
// CABEÇALHO
// -------------------------------------------------------------------------
void desenharIconeWifi(int x, int y) {
  bool conectado = (WiFi.status() == WL_CONNECTED);
  int barras = 0;
  if (conectado) {
    int rssi = WiFi.RSSI();
    if (rssi > -60)      barras = 4;
    else if (rssi > -70) barras = 3;
    else if (rssi > -80) barras = 2;
    else                 barras = 1;
  }
  for (int i = 0; i < 4; i++) {
    int h = 4 + i * 3;
    uint16_t cor = (i < barras) ? corHeaderTexto : corHeaderFraco;
    tft.fillRect(x + i * 5, y + (13 - h), 3, h, cor);
  }
}

void desenharStatusCabecalho() {
  tft.fillRect(218, 0, 102, HEADER_H, corHeader);
  desenharIconeWifi(228, 8);

  struct tm timeinfo;
  char horaTexto[6] = "--:--";
  if (getLocalTime(&timeinfo, 5)) {
    strftime(horaTexto, sizeof(horaTexto), "%H:%M", &timeinfo);
  }
  tft.setFont(nullptr);
  tft.setTextColor(corHeaderTexto);
  tft.setTextSize(2);                 // relógio legível
  tft.setCursor(256, 8);
  tft.print(horaTexto);
}

void desenharFaixaTracejada(int y) {
  for (int x = 0; x < TELA_W; x += 24) {
    tft.fillRect(x, y, 14, 3, corFaixa);
  }
}

// Cabeçalho enxuto: só a marca e o status. O título de cada tela aparece
// no conteúdo, com peso visual próprio.
void desenharCabecalho() {
  tft.fillRect(0, 0, TELA_W, HEADER_H, corHeader);
  tft.setFont(FONTE_MEDIA);
  tft.setTextColor(corHeaderTexto);
  tft.setTextSize(1);
  tft.setCursor(10, 21);
  tft.print("PARAAI");
  desenharStatusCabecalho();
  desenharFaixaTracejada(FAIXA_Y);
}

unsigned long ultimoRelogioMillis = 0;
const unsigned long RELOGIO_INTERVALO_MS = 1000;

void atualizarRelogioCabecalho() {
  unsigned long agora = millis();
  if (agora - ultimoRelogioMillis < RELOGIO_INTERVALO_MS) return;
  ultimoRelogioMillis = agora;
  desenharStatusCabecalho();
}

// -------------------------------------------------------------------------
// MARCA
// -------------------------------------------------------------------------
void desenharLogoP(int cx, int cy, int lado) {
  // Aproximação da marca (Marca/logo.png) nas primitivas do Adafruit_GFX.
  // Aqui não dá para carregar o PNG: a tela desenha por retângulos e
  // círculos, então a marca é reconstruída — badge âmbar, haste sólida com
  // faixa tracejada por dentro, e a barriga do P.
  float f = lado / 48.0;
  int x0 = cx - lado / 2;
  int y0 = cy - lado / 2;

  tft.fillRoundRect(x0, y0, lado, lado, (int)(11 * f), corDestaque);

  // barriga: círculo cheio, miolo devolvido na cor do badge
  int bx = x0 + (int)(19 * f);
  int by = y0 + (int)(21.5 * f);
  tft.fillCircle(bx, by, (int)(13.5 * f), corHeaderTexto);
  tft.fillCircle(bx, by, (int)(6.8 * f), corDestaque);
  // a metade esquerda do anel fica escondida sob a haste
  tft.fillRect(x0, y0 + (int)(8 * f), (int)(19 * f), (int)(27 * f), corDestaque);

  // haste sólida = trecho de pista
  tft.fillRoundRect(x0 + (int)(11 * f), y0 + (int)(8 * f),
                    (int)(8 * f), (int)(32 * f), (int)(1.6 * f), corHeaderTexto);

  // faixa central tracejada, por dentro da pista
  int fx = x0 + (int)(15 * f);
  int esp = (int)(1.4 * f);
  if (esp < 1) esp = 1;
  int hh = (int)(2.4 * f);
  if (hh < 1) hh = 1;
  for (float y = 10.6; y < 37.6; y += 5.0) {
    tft.fillRect(fx - esp / 2, y0 + (int)(y * f), esp, hh, corDestaque);
  }
}

void desenharSplash() {
  tft.fillScreen(corFundo);
  desenharLogoP(160, 78, 80);
  centralizarTexto("PARAAI", 134, corTexto, FONTE_GIGANTE);   // 134..159
  centralizarTexto("Estacionamento inteligente", 176, corDestaque, FONTE_MEDIA); // 176..189
  desenharFaixaTracejada(212);
  delay(1200);
}

// -------------------------------------------------------------------------
// PLACA VEICULAR (usada no teclado e na confirmação)
// -------------------------------------------------------------------------
void desenharPlacaVeicular(int x, int y, int w, int h, String texto) {
  tft.fillRoundRect(x, y, w, h, 5, corTexto);
  tft.drawRoundRect(x, y, w, h, 5, corDestaque);
  tft.fillRect(x + 2, y + 2, 10, h - 4, tft.color565(0, 51, 153)); // faixa Mercosul
  textoCentralizadoEm(texto, x + 12, y, w - 12, h, corFundo, FONTE_PLACA);
}

// -------------------------------------------------------------------------
// TELA INICIAL — o motorista escolhe o que veio fazer
//
// Só duas opções, ocupando quase a tela inteira. Sem contagem de vagas: o
// que importa para quem chega é entrar ou sair, e alvos grandes erram menos
// no toque do que qualquer informação a mais.
// -------------------------------------------------------------------------
// Saudação conforme a hora local (NTP já sincronizado no setup). Se o relógio
// ainda não tiver hora válida, cai num cumprimento neutro em vez de arriscar
// dar "bom dia" às onze da noite.
String saudacaoAgora() {
  struct tm agora;
  if (!getLocalTime(&agora, 5)) return "OLA";

  int h = agora.tm_hour;
  if (h >= 5  && h < 12) return "BOM DIA";
  if (h >= 12 && h < 18) return "BOA TARDE";
  return "BOA NOITE";
}

void desenharTelaInicial() {
  tft.fillScreen(corFundo);
  desenharCabecalho();

  // Saudação em duas linhas: junto numa só ("BOA NOITE, SEJA BEM-VINDO")
  // passaria da largura da tela.
  //   saudação   : y 38 .. 59
  //   boas-vindas: y 64 .. 79
  //   ENTRADA    : y 88 .. 150
  //   SAIDA      : y 160 .. 222
  centralizarTexto(saudacaoAgora(), 38, corDestaque, FONTE_GRANDE);
  centralizarTexto("Seja bem-vindo", 64, corTextoFraco, FONTE_MEDIA);

  // ENTRADA — verde, ação mais comum, fica em cima
  tft.fillRoundRect(BTN_ENTRADA_X, BTN_ENTRADA_Y, BTN_OP_W, BTN_OP_H, 10, corSucesso);
  textoCentralizadoEm("ENTRADA", BTN_ENTRADA_X, BTN_ENTRADA_Y + 4, BTN_OP_W, 36,
                      corFundo, FONTE_GIGANTE);
  textoCentralizadoEm("acabei de chegar", BTN_ENTRADA_X, BTN_ENTRADA_Y + BTN_OP_H - 24,
                      BTN_OP_W, 18, corFundo, FONTE_PEQUENA);

  // SAÍDA — âmbar, para não confundir com a entrada só pela posição
  tft.fillRoundRect(BTN_SAIDA_X, BTN_SAIDA_Y, BTN_OP_W, BTN_OP_H, 10, corDestaque);
  textoCentralizadoEm("SAIDA", BTN_SAIDA_X, BTN_SAIDA_Y + 4, BTN_OP_W, 36,
                      corFundo, FONTE_GIGANTE);
  textoCentralizadoEm("vou embora e pagar", BTN_SAIDA_X, BTN_SAIDA_Y + BTN_OP_H - 24,
                      BTN_OP_W, 18, corFundo, FONTE_PEQUENA);
}

Operacao verificarToqueTelaInicial() {
  if (!ts.touched()) return OP_NENHUMA;
  unsigned long agora = millis();
  if (agora - ultimoToqueMillis < TOQUE_COOLDOWN_MS) return OP_NENHUMA;

  int x, y;
  lerToqueTela(x, y);

  if (toqueDentro(x, y, BTN_ENTRADA_X, BTN_ENTRADA_Y, BTN_OP_W, BTN_OP_H)) {
    ultimoToqueMillis = agora;
    return OP_ENTRADA;
  }
  if (toqueDentro(x, y, BTN_SAIDA_X, BTN_SAIDA_Y, BTN_OP_W, BTN_OP_H)) {
    ultimoToqueMillis = agora;
    return OP_SAIDA;
  }
  return OP_NENHUMA;
}

// -------------------------------------------------------------------------
// TELA DO TECLADO
// -------------------------------------------------------------------------
void atualizarCaixaPlaca(String placaAtual) {
  String exibir = placaAtual;
  while (exibir.length() < 7) exibir += "_";
  desenharPlacaVeicular(52, 38, 216, 32, exibir);
}

void desenharTeclado() {
  for (int linha = 0; linha < 4; linha++) {
    int offsetX = offsetXLinha(linha);
    for (int col = 0; col < TECLA_NUM_CHARS[linha]; col++) {
      int x = offsetX + col * TECLA_PITCH;
      int y = TECLA_ROW_Y[linha];
      tft.fillRoundRect(x, y, TECLA_W, TECLA_H, 5, corBotao);
      tft.drawRoundRect(x, y, TECLA_W, TECLA_H, 5, corBotaoBorda);
      // tamanho 2 = 10x14px: legível de pé, a um braço de distância
      textoCentralizadoEm(String(LINHAS_TECLADO[linha][col]), x, y, TECLA_W, TECLA_H, corTexto, FONTE_MEDIA);
    }
  }

  tft.fillRoundRect(14, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, 6, corPainel);
  tft.drawRoundRect(14, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, 6, corErro);
  textoCentralizadoEm("APAGAR", 14, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, corErro, FONTE_PEQUENA);

  tft.fillRoundRect(110, BOTAO_ACAO_Y, 100, BOTAO_ACAO_H, 6, corDestaque);
  textoCentralizadoEm("OK", 110, BOTAO_ACAO_Y, 100, BOTAO_ACAO_H, corHeaderTexto, FONTE_GRANDE);

  tft.fillRoundRect(222, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, 6, corPainel);
  tft.drawRoundRect(222, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, 6, corBotaoBorda);
  textoCentralizadoEm("CANCELAR", 222, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H, corTextoFraco, FONTE_PEQUENA);
}

void desenharTelaTeclado(String placaAtual) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  atualizarCaixaPlaca(placaAtual);
  desenharTeclado();
}

// Retorna: caractere digitado, '\b' (apagar), '\n' (confirmar), 27 (cancelar), ou 0
char verificarToqueTeclado() {
  if (!ts.touched()) return 0;
  unsigned long agora = millis();
  if (agora - ultimoToqueMillis < TOQUE_COOLDOWN_MS) return 0;

  int x, y;
  lerToqueTela(x, y);

  if (y >= BOTAO_ACAO_Y && y <= BOTAO_ACAO_Y + BOTAO_ACAO_H) {
    if (toqueDentro(x, y, 14, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H))  { ultimoToqueMillis = agora; return '\b'; }
    if (toqueDentro(x, y, 110, BOTAO_ACAO_Y, 100, BOTAO_ACAO_H)) { ultimoToqueMillis = agora; return '\n'; }
    if (toqueDentro(x, y, 222, BOTAO_ACAO_Y, 84, BOTAO_ACAO_H))  { ultimoToqueMillis = agora; return 27; }
    return 0;
  }

  for (int linha = 0; linha < 4; linha++) {
    int rowY = TECLA_ROW_Y[linha];
    if (y >= rowY && y <= rowY + TECLA_H) {
      int offsetX = offsetXLinha(linha);
      int col = (x - offsetX) / TECLA_PITCH;
      if ((x - offsetX) >= 0 && col >= 0 && col < TECLA_NUM_CHARS[linha]) {
        ultimoToqueMillis = agora;
        return LINHAS_TECLADO[linha][col];
      }
    }
  }
  return 0;
}

// -------------------------------------------------------------------------
// TELA DE PROCESSAMENTO
// -------------------------------------------------------------------------
void desenharIconeCarregando(int cx, int cy, int raio) {
  tft.drawCircle(cx, cy, raio, corBotaoBorda);
  tft.drawCircle(cx, cy, raio - 1, corBotaoBorda);
  for (int angulo = 0; angulo <= 110; angulo += 4) {
    float rad = angulo * PI / 180.0;
    int x = cx + (int)(raio * sin(rad));
    int y = cy - (int)(raio * cos(rad));
    tft.fillCircle(x, y, 3, corDestaque);
  }
}

void desenharTelaProcessando(String mensagem) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  desenharIconeCarregando(160, 92, 26);   // termina em y=118
  centralizarTexto(mensagem, 136, corTexto, FONTE_GRANDE);          // 136..153
  centralizarTexto("Aguarde um instante", 172, corTextoFraco, FONTE_PEQUENA); // 172..185
}

// -------------------------------------------------------------------------
// TELA DE RESULTADO
// -------------------------------------------------------------------------
void desenharIconeResultado(TipoResultado tipo, uint16_t cor) {
  int cx = 160, cy = 62, r = 22;
  tft.fillCircle(cx, cy, r, cor);
  tft.drawCircle(cx, cy, r + 3, cor);

  switch (tipo) {
    case RESULTADO_SUCESSO:
      for (int e = 0; e < 3; e++) {
        tft.drawLine(cx - 11, cy + e,     cx - 3, cy + 8 + e,  corFundo);
        tft.drawLine(cx - 3,  cy + 8 + e, cx + 12, cy - 8 + e, corFundo);
      }
      break;
    case RESULTADO_ALERTA:
      tft.fillRect(cx - 2, cy - 12, 5, 15, corFundo);
      tft.fillCircle(cx, cy + 10, 3, corFundo);
      break;
    default:
      for (int e = 0; e < 3; e++) {
        tft.drawLine(cx - 9, cy - 9 + e, cx + 9, cy + 9 + e, corFundo);
        tft.drawLine(cx - 9, cy + 9 - e, cx + 9, cy - 9 - e, corFundo);
      }
      break;
  }
}

void desenharTelaResultado(TipoResultado tipo, String linha1, String linha2, String linha3) {
  uint16_t cor;
  switch (tipo) {
    case RESULTADO_SUCESSO: cor = corSucesso; break;
    case RESULTADO_ALERTA:  cor = corAlerta;  break;
    default:                cor = corErro;    break;
  }

  tft.fillScreen(corFundo);
  desenharCabecalho();
  desenharIconeResultado(tipo, cor);

  // Fontes proporcionais nas 3 linhas: a fonte 5x7 escalada fica com
  // espaçamento muito largo entre letras ("V A G A  2") e polui a leitura.
  // Posições com folga real (o ícone termina em y=87):
  //   linha1: 104..121 | linha2: 140..157 | linha3: 178..191
  centralizarTexto(linha1, 104, cor, FONTE_GRANDE);
  centralizarTexto(linha2, 140, corTexto, FONTE_GRANDE);
  if (linha3.length() > 0) {
    centralizarTexto(linha3, 178, corTextoFraco, FONTE_MEDIA);
  }
}

// -------------------------------------------------------------------------
// TELA DE CONFIRMAÇÃO (auto-cadastro da placa no próprio totem)
// -------------------------------------------------------------------------
void desenharTelaConfirmarCadastro(String placa) {
  tft.fillScreen(corFundo);
  desenharCabecalho();

  centralizarTexto("PLACA NAO CADASTRADA", 42, corAlerta, FONTE_MEDIA);
  desenharPlacaVeicular(60, 64, 200, 34, placa);
  // textos curtos: com FONTE_GRANDE, frases longas passavam de 290px de
  // largura e encostavam nas bordas da tela de 320px
  centralizarTexto("Cadastrar e entrar?", 112, corTexto, FONTE_GRANDE);
  centralizarTexto("saldo voce adiciona no app", 140, corTextoFraco, FONTE_PEQUENA);

  tft.fillRoundRect(CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corPainel);
  tft.drawRoundRect(CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corBotaoBorda);
  textoCentralizadoEm("NAO", CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, corTextoFraco, FONTE_MEDIA);

  tft.fillRoundRect(CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corSucesso);
  textoCentralizadoEm("SIM", CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, corFundo, FONTE_GRANDE);
}

// 1 = SIM, 0 = NAO, -1 = nada
int verificarToqueConfirmacao() {
  if (!ts.touched()) return -1;
  unsigned long agora = millis();
  if (agora - ultimoToqueMillis < TOQUE_COOLDOWN_MS) return -1;

  int x, y;
  lerToqueTela(x, y);

  if (toqueDentro(x, y, CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H)) {
    ultimoToqueMillis = agora;
    return 1;
  }
  if (toqueDentro(x, y, CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H)) {
    ultimoToqueMillis = agora;
    return 0;
  }
  return -1;
}

#endif
