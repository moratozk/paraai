// =========================================================================
// MÓDULO DE INTERFACE GRÁFICA (DisplayUI.ino)
// Tela ILI9341 + Touch XPT2046 - tema visual + teclado touch pra placa
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
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSans9pt7b.h>

#define FONTE_GRANDE  (&FreeSansBold18pt7b)
#define FONTE_MEDIA   (&FreeSansBold9pt7b)
#define FONTE_PEQUENA (&FreeSans9pt7b)

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

#define TOUCH_X_MIN 200
#define TOUCH_X_MAX 3700
#define TOUCH_Y_MIN 200
#define TOUCH_Y_MAX 3700

const unsigned long TOQUE_COOLDOWN_MS = 350;
static unsigned long ultimoToqueMillis = 0;

// -------------------------------------------------------------------------
// PALETA DE CORES (calculada em initUI, depende do objeto tft já existir)
// Identidade "Para Aí": amarelo viário sobre asfalto, mesma do painel web
// (Web/src/index.css) - se mudar aqui, mude lá.
// -------------------------------------------------------------------------
uint16_t corFundo, corHeader, corDestaque, corSucesso, corAlerta, corErro;
uint16_t corTexto, corTextoFraco, corBotao, corBotaoBorda;
uint16_t corHeaderTexto, corHeaderFraco, corFaixa;

// Tipo semântico de resultado - a tela de resultado escolhe cor e ícone
// sozinha a partir disto, então quem chama não precisa saber hex de cor.
enum TipoResultado { RESULTADO_SUCESSO, RESULTADO_ALERTA, RESULTADO_ERRO };

// -------------------------------------------------------------------------
// API PÚBLICA (usada pelo Main.ino)
// -------------------------------------------------------------------------
void initUI();
void desenharTelaInicial(int vagasLivres);
void atualizarVagasInicial(int vagasLivres);
bool verificarToqueTelaInicial();
void desenharTelaTeclado(String placaAtual);
void atualizarCaixaPlaca(String placaAtual);
char verificarToqueTeclado();
void desenharTelaProcessando();
void desenharTelaResultado(TipoResultado tipo, String linha1, String linha2, String linha3);
void atualizarRelogioCabecalho();

// -------------------------------------------------------------------------
// HELPERS INTERNOS (pré-declarados pra poder ser usados em qualquer ordem)
// -------------------------------------------------------------------------
void initCores();
int  offsetXLinha(int indiceLinha);
void centralizarTexto(String texto, int yTopo, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void textoCentralizadoEm(String texto, int xCaixa, int yCaixa, int wCaixa, int hCaixa, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void desenharIconeWifi(int x, int y);
void desenharStatusCabecalho();
void desenharFaixaTracejada(int y);
void desenharCabecalho(const char* subtitulo);
void desenharLogoP(int cx, int cy, int lado);
void desenharSplash();
void desenharTeclado();
void desenharIconeCarregando(int cx, int cy, int raio);
void desenharIconeResultado(TipoResultado tipo, uint16_t cor);

// -------------------------------------------------------------------------
// LAYOUT DO TECLADO ALFANUMÉRICO
// -------------------------------------------------------------------------
const char* LINHAS_TECLADO[4]  = {"QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM", "0123456789"};
const int   TECLA_NUM_CHARS[4] = {10, 9, 7, 10};
const int   TECLA_ROW_Y[4]     = {74, 104, 134, 164};
const int   TECLA_PITCH  = 30;
const int   TECLA_W      = 27;
const int   TECLA_H      = 26;
const int   BOTAO_ACAO_Y = TECLA_ROW_Y[3] + TECLA_H + 8; // segue a última linha do teclado

int offsetXLinha(int indiceLinha) {
  int larguraLinha = TECLA_NUM_CHARS[indiceLinha] * TECLA_PITCH;
  return 10 + (300 - larguraLinha) / 2;
}

// -------------------------------------------------------------------------
// INICIALIZAÇÃO
// -------------------------------------------------------------------------
void initCores() {
  corFundo       = tft.color565(16, 18, 22);    // asfalto
  corHeader      = tft.color565(255, 196, 0);   // amarelo viario
  corDestaque    = tft.color565(255, 196, 0);
  corSucesso     = tft.color565(53, 208, 127);
  corAlerta      = tft.color565(255, 152, 0);
  corErro        = tft.color565(255, 93, 93);
  corTexto       = tft.color565(242, 240, 234); // branco de tinta
  corTextoFraco  = tft.color565(150, 155, 165);
  corBotao       = tft.color565(27, 31, 38);
  corBotaoBorda  = tft.color565(58, 65, 77);
  corHeaderTexto = tft.color565(16, 18, 22);    // texto sobre amarelo
  corHeaderFraco = tft.color565(200, 150, 0);   // "apagado" sobre amarelo
  corFaixa       = tft.color565(120, 118, 112); // faixa tracejada da pista
}

void initUI() {
  pinMode(TFT_LED, OUTPUT);
  digitalWrite(TFT_LED, HIGH); // liga o backlight

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

// Desenha a marca "P" do ParaAí (haste tracejada = faixa de pista) num
// badge amarelo. É a mesma marca do favicon/logo do painel web, reproduzida
// com primitivas do TFT. A arte original foi desenhada num grid 48x48, com
// o glifo centrado (bbox x 11..37, centro 24) e traços iguais.
void desenharLogoP(int cx, int cy, int lado) {
  float f = lado / 48.0;
  int x0 = cx - lado / 2;
  int y0 = cy - lado / 2;

  tft.fillRoundRect(x0, y0, lado, lado, (int)(12 * f), corDestaque);

  // bojo do P: anel + barras horizontais ligando ao eixo da haste
  int bx = x0 + (int)(25.5 * f);
  int by = y0 + (int)(20.5 * f);
  tft.fillCircle(bx, by, (int)(11.5 * f), corHeaderTexto);
  tft.fillCircle(bx, by, (int)(4.5 * f), corDestaque);
  tft.fillRect(x0 + (int)(18 * f), y0 + (int)(9 * f),  (int)(8 * f), (int)(7 * f), corHeaderTexto);
  tft.fillRect(x0 + (int)(18 * f), y0 + (int)(25 * f), (int)(8 * f), (int)(7 * f), corHeaderTexto);
  // abre o anel à esquerda (o P é aberto entre as barras)
  tft.fillRect(x0 + (int)(13 * f), y0 + (int)(16 * f), (int)(5 * f), (int)(9 * f), corDestaque);

  // haste do P = faixa tracejada (3 traços iguais)
  int hx = x0 + (int)(11 * f);
  int hw = (int)(7 * f);
  tft.fillRoundRect(hx, y0 + (int)(9 * f),    hw, (int)(8 * f), 2, corHeaderTexto);
  tft.fillRoundRect(hx, y0 + (int)(20.5 * f), hw, (int)(8 * f), 2, corHeaderTexto);
  tft.fillRoundRect(hx, y0 + (int)(32 * f),   hw, (int)(8 * f), 2, corHeaderTexto);
}

void desenharSplash() {
  tft.fillScreen(corFundo);
  desenharLogoP(160, 80, 90);
  centralizarTexto("PARAAI", 138, corTexto, FONTE_GRANDE);
  centralizarTexto("Estacionamento inteligente", 182, corTextoFraco, nullptr);
  desenharFaixaTracejada(214);
  delay(1200);
}

// -------------------------------------------------------------------------
// TEXTO (posicionamento preciso, funciona com fonte padrão ou GFX custom)
// -------------------------------------------------------------------------
void centralizarTexto(String texto, int yTopo, uint16_t cor, const GFXfont *fonte, uint8_t tamanho) {
  tft.setFont(fonte);
  tft.setTextColor(cor);
  tft.setTextSize(tamanho);
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(texto, 0, 0, &x1, &y1, &w, &h);
  tft.setCursor((320 - (int)w) / 2 - x1, yTopo - y1);
  tft.print(texto);
}

void textoCentralizadoEm(String texto, int xCaixa, int yCaixa, int wCaixa, int hCaixa, uint16_t cor, const GFXfont *fonte, uint8_t tamanho) {
  tft.setFont(fonte);
  tft.setTextColor(cor);
  tft.setTextSize(tamanho);
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(texto, 0, 0, &x1, &y1, &w, &h);
  tft.setCursor(xCaixa + (wCaixa - (int)w) / 2 - x1, yCaixa + (hCaixa - (int)h) / 2 - y1);
  tft.print(texto);
}

// -------------------------------------------------------------------------
// CABEÇALHO (marca + sub-título + wifi/relógio, comum a todas as telas)
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
    int h = 3 + i * 3;
    uint16_t cor = (i < barras) ? corHeaderTexto : corHeaderFraco;
    tft.fillRect(x + i * 5, y + (12 - h), 3, h, cor);
  }
}

void desenharStatusCabecalho() {
  tft.fillRect(224, 2, 96, 20, corHeader); // limpa só a área do ícone+relógio

  desenharIconeWifi(232, 6);

  struct tm timeinfo;
  char horaTexto[6] = "--:--";
  if (getLocalTime(&timeinfo, 5)) { // timeout curtíssimo: nunca trava a UI
    strftime(horaTexto, sizeof(horaTexto), "%H:%M", &timeinfo);
  }
  tft.setFont(nullptr);
  tft.setTextColor(corHeaderTexto);
  tft.setTextSize(1);
  tft.setCursor(266, 9);
  tft.print(horaTexto);
}

// Faixa tracejada de pista - assinatura visual (o painel web usa a mesma)
void desenharFaixaTracejada(int y) {
  for (int x = 0; x < 320; x += 22) {
    tft.fillRect(x, y, 13, 3, corFaixa);
  }
}

void desenharCabecalho(const char* subtitulo) {
  // Cabeçalho = placa amarela com texto asfalto (identidade Para Aí)
  tft.fillRect(0, 0, 320, 36, corHeader);

  tft.setFont(FONTE_MEDIA);
  tft.setTextColor(corHeaderTexto);
  tft.setTextSize(1);
  tft.setCursor(6, 17);
  tft.print("PARAAI");

  tft.setFont(nullptr);
  tft.setTextColor(corHeaderTexto);
  tft.setTextSize(1);
  tft.setCursor(6, 27);
  tft.print(subtitulo);

  desenharStatusCabecalho();
  desenharFaixaTracejada(39);
}

unsigned long ultimoRelogioMillis = 0;
const unsigned long RELOGIO_INTERVALO_MS = 1000;

// Chamado a cada volta do loop principal; só redesenha de fato 1x/segundo
// e só a área pequena do relógio/wifi - mantém a UI "viva" sem piscar tela.
void atualizarRelogioCabecalho() {
  unsigned long agora = millis();
  if (agora - ultimoRelogioMillis < RELOGIO_INTERVALO_MS) return;
  ultimoRelogioMillis = agora;
  desenharStatusCabecalho();
}

// -------------------------------------------------------------------------
// TELA INICIAL (dashboard: total livre + status individual das 4 vagas)
// -------------------------------------------------------------------------
void desenharTelaInicial(int vagasLivres) {
  tft.fillScreen(corFundo);
  desenharCabecalho("Estacionamento");
  atualizarVagasInicial(vagasLivres);

  tft.fillRoundRect(40, 148, 240, 56, 10, corDestaque);
  tft.drawRoundRect(40, 148, 240, 56, 10, corFundo);
  textoCentralizadoEm("TOQUE PARA ENTRADA / SAIDA", 40, 148, 240, 56, corHeaderTexto, FONTE_MEDIA);
}

// Redesenha só a área do número/legenda/caixas - evita fillScreen (flicker)
// toda vez que um sensor muda de estado.
void atualizarVagasInicial(int vagasLivres) {
  tft.fillRect(0, 43, 320, 99, corFundo);

  bool temLivre = vagasLivres > 0;
  centralizarTexto(String(vagasLivres), 47, temLivre ? corSucesso : corErro, FONTE_GRANDE);
  String legenda = temLivre ? ("de " + String(NUM_VAGAS) + " vagas livres") : "TODAS AS VAGAS OCUPADAS";
  centralizarTexto(legenda, 88, corTextoFraco, FONTE_PEQUENA);

  const int larguraCaixa = 64, alturaCaixa = 32, espaco = 8;
  const int larguraTotal = NUM_VAGAS * larguraCaixa + (NUM_VAGAS - 1) * espaco;
  const int xInicial = (320 - larguraTotal) / 2;
  const int y = 110;

  for (int i = 0; i < NUM_VAGAS; i++) {
    int x = xInicial + i * (larguraCaixa + espaco);
    bool ocupada = obterEstadoVaga(i);
    uint16_t cor = ocupada ? corErro : corSucesso;
    tft.fillRoundRect(x, y, larguraCaixa, alturaCaixa, 5, cor);
    textoCentralizadoEm(String(i + 1), x, y, larguraCaixa, alturaCaixa, corFundo, nullptr, 2);
  }
}

bool verificarToqueTelaInicial() {
  if (!ts.touched()) return false;
  unsigned long agora = millis();
  if (agora - ultimoToqueMillis < TOQUE_COOLDOWN_MS) return false;

  TS_Point p = ts.getPoint();
  int x = map(p.x, TOUCH_X_MIN, TOUCH_X_MAX, 0, 320);
  int y = map(p.y, TOUCH_Y_MIN, TOUCH_Y_MAX, 0, 240);

  if (x >= 40 && x <= 280 && y >= 148 && y <= 204) {
    ultimoToqueMillis = agora;
    return true;
  }
  return false;
}

// -------------------------------------------------------------------------
// TELA DO TECLADO (digitação da placa)
// -------------------------------------------------------------------------
void atualizarCaixaPlaca(String placaAtual) {
  // Caixa da placa no estilo "placa veicular": fundo claro, texto asfalto
  tft.fillRoundRect(20, 43, 280, 28, 5, corTexto);
  tft.drawRoundRect(20, 43, 280, 28, 5, corDestaque);
  tft.fillRect(20, 43, 8, 28, tft.color565(0, 51, 153)); // faixa azul Mercosul
  String exibir = placaAtual;
  while (exibir.length() < 7) exibir += "_";
  textoCentralizadoEm(exibir, 28, 43, 272, 28, corFundo, nullptr, 2);
}

void desenharTeclado() {
  for (int linha = 0; linha < 4; linha++) {
    int offsetX = offsetXLinha(linha);
    for (int col = 0; col < TECLA_NUM_CHARS[linha]; col++) {
      int x = offsetX + col * TECLA_PITCH;
      int y = TECLA_ROW_Y[linha];
      tft.fillRoundRect(x, y, TECLA_W, TECLA_H, 4, corBotao);
      tft.drawRoundRect(x, y, TECLA_W, TECLA_H, 4, corBotaoBorda);
      textoCentralizadoEm(String(LINHAS_TECLADO[linha][col]), x, y, TECLA_W, TECLA_H, corTexto);
    }
  }

  tft.drawRoundRect(10, BOTAO_ACAO_Y, 90, 34, 6, corErro);
  textoCentralizadoEm("APAGAR", 10, BOTAO_ACAO_Y, 90, 34, corErro);

  tft.fillRoundRect(110, BOTAO_ACAO_Y, 100, 34, 6, corDestaque);
  textoCentralizadoEm("OK", 110, BOTAO_ACAO_Y, 100, 34, corHeaderTexto, nullptr, 2);

  tft.drawRoundRect(220, BOTAO_ACAO_Y, 90, 34, 6, corBotaoBorda);
  textoCentralizadoEm("CANCELAR", 220, BOTAO_ACAO_Y, 90, 34, corTextoFraco);
}

void desenharTelaTeclado(String placaAtual) {
  tft.fillScreen(corFundo);
  desenharCabecalho("Digite a Placa");
  atualizarCaixaPlaca(placaAtual);
  desenharTeclado();
}

// Retorna: caractere digitado, '\b' (apagar), '\n' (confirmar), 27 (cancelar), ou 0 (nada)
char verificarToqueTeclado() {
  if (!ts.touched()) return 0;
  unsigned long agora = millis();
  if (agora - ultimoToqueMillis < TOQUE_COOLDOWN_MS) return 0;

  TS_Point p = ts.getPoint();
  int x = map(p.x, TOUCH_X_MIN, TOUCH_X_MAX, 0, 320);
  int y = map(p.y, TOUCH_Y_MIN, TOUCH_Y_MAX, 0, 240);

  if (y >= BOTAO_ACAO_Y && y <= BOTAO_ACAO_Y + 34) {
    if (x >= 10 && x <= 100)  { ultimoToqueMillis = agora; return '\b'; }
    if (x >= 110 && x <= 210) { ultimoToqueMillis = agora; return '\n'; }
    if (x >= 220 && x <= 310) { ultimoToqueMillis = agora; return 27; }
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
  for (int angulo = 0; angulo <= 100; angulo += 4) {
    float rad = angulo * PI / 180.0;
    int x = cx + (int)(raio * sin(rad));
    int y = cy - (int)(raio * cos(rad));
    tft.fillCircle(x, y, 2, corDestaque);
  }
}

void desenharTelaProcessando() {
  tft.fillScreen(corFundo);
  desenharCabecalho("Processando");
  desenharIconeCarregando(160, 90, 26);
  centralizarTexto("Consultando o servidor...", 138, corTexto, FONTE_PEQUENA);
  centralizarTexto("Isso pode levar alguns segundos", 160, corTextoFraco);
}

// -------------------------------------------------------------------------
// TELA DE RESULTADO (genérica - serve pra bem-vindo, saída, erro, lotado)
// -------------------------------------------------------------------------
void desenharIconeResultado(TipoResultado tipo, uint16_t cor) {
  int cx = 160, cy = 64, r = 22;
  tft.fillCircle(cx, cy, r, cor);

  switch (tipo) {
    case RESULTADO_SUCESSO:
      tft.drawLine(cx - 10, cy,     cx - 3,  cy + 8, corFundo);
      tft.drawLine(cx - 10, cy + 1, cx - 3,  cy + 9, corFundo);
      tft.drawLine(cx - 3,  cy + 8, cx + 12, cy - 9, corFundo);
      tft.drawLine(cx - 3,  cy + 9, cx + 12, cy - 8, corFundo);
      break;
    case RESULTADO_ALERTA:
      tft.fillRect(cx - 2, cy - 11, 4, 14, corFundo);
      tft.fillCircle(cx, cy + 9, 2, corFundo);
      break;
    default: // RESULTADO_ERRO
      tft.drawLine(cx - 9, cy - 9, cx + 9, cy + 9, corFundo);
      tft.drawLine(cx - 9, cy - 8, cx + 9, cy + 10, corFundo);
      tft.drawLine(cx - 9, cy + 9, cx + 9, cy - 9, corFundo);
      tft.drawLine(cx - 9, cy + 10, cx + 9, cy - 8, corFundo);
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
  desenharCabecalho("Resultado");
  desenharIconeResultado(tipo, cor);

  centralizarTexto(linha1, 96, cor, FONTE_MEDIA);
  centralizarTexto(linha2, 122, corTexto, nullptr, 2);
  if (linha3.length() > 0) {
    centralizarTexto(linha3, 152, corTextoFraco);
  }
}

#endif
