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
#include <Preferences.h>
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
// Valores de seguranca usados apenas quando ainda nao existe uma calibracao
// valida na memoria. O assistente integrado mede o painel real e grava os
// limites no NVS; assim nao e mais preciso trocar de sketch e recompilar.
// -------------------------------------------------------------------------
#define TOUCH_X_MIN 200
#define TOUCH_X_MAX 3700
#define TOUCH_Y_MIN 200
#define TOUCH_Y_MAX 3700

static long touchXMin = TOUCH_X_MIN;
static long touchXMax = TOUCH_X_MAX;
static long touchYMin = TOUCH_Y_MIN;
static long touchYMax = TOUCH_Y_MAX;

const char* NVS_UI_NAMESPACE = "paraai-ui";  // Preferences limita a 15 caracteres
const uint8_t VERSAO_CALIBRACAO_TOUCH = 1;

// Um toque so vira evento depois de permanecer pressionado e so rearma apos
// uma soltura estavel. Isso elimina repeticao por dedo mantido, toques perdidos
// pelo antigo cooldown de 300 ms e o vazamento de um toque entre duas telas.
const unsigned long TOQUE_ESTABILIZAR_MS = 25;
const unsigned long SOLTURA_ESTABILIZAR_MS = 40;
static bool toqueFisicoPresente = false;
static bool toqueEstavelAtivo = false;
static bool eventoToqueDisponivel = false;
static unsigned long toquePressionadoDesde = 0;
static unsigned long toqueSoltoDesde = 0;
static int ultimoToqueX = 0;
static int ultimoToqueY = 0;

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

// Teclado contextual: mostra apenas os caracteres validos para a posicao
// atual da placa. As teclas crescem e placas invalidas deixam de ser geradas.
const char* LINHAS_LETRAS[3] = {"ABCDEFGHI", "JKLMNOPQR", "STUVWXYZ"};
const int LETRAS_POR_LINHA[3] = {9, 9, 8};
const int LETRA_W = 31, LETRA_H = 34, LETRA_GAP = 3;
const int LETRA_ROW_Y[3] = {75, 112, 149};

const char* LINHAS_NUMEROS[2] = {"12345", "67890"};
const int NUMERO_W = 54, NUMERO_H = 42, NUMERO_GAP = 6;
const int NUMERO_ROW_Y[2] = {84, 134};

const int BOTAO_ACAO_Y = 190, BOTAO_ACAO_H = 46;
const int BOTAO_VOLTAR_X = 8, BOTAO_VOLTAR_W = 146;
const int BOTAO_CANCELAR_X = 166, BOTAO_CANCELAR_W = 146;

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

enum FormatoPlaca {
  FORMATO_NAO_ESCOLHIDO,
  FORMATO_ANTIGA,
  FORMATO_MERCOSUL
};

enum AcaoTeclado {
  TECLADO_NENHUMA,
  TECLADO_CARACTERE,
  TECLADO_APAGAR,
  TECLADO_CONFIRMAR,
  TECLADO_CANCELAR,
  TECLADO_FORMATO_ANTIGA,
  TECLADO_FORMATO_MERCOSUL
};

struct EventoTeclado {
  AcaoTeclado acao;
  char caractere;
};

enum ModoTecladoInterno {
  MODO_TECLADO_LETRAS,
  MODO_TECLADO_NUMEROS,
  MODO_TECLADO_ESCOLHER_FORMATO,
  MODO_TECLADO_CONFIRMAR
};

// -------------------------------------------------------------------------
// API PÚBLICA
// -------------------------------------------------------------------------
void initUI();
void desenharTelaInicial();
Operacao verificarToqueTelaInicial();
void desenharTelaTeclado(String placaAtual, FormatoPlaca formato);
void atualizarCaixaPlaca(String placaAtual);
EventoTeclado verificarToqueTeclado(String placaAtual, FormatoPlaca formato);
void desenharTelaProcessando(String mensagem);
void desenharTelaResultado(TipoResultado tipo, String linha1, String linha2, String linha3);
void desenharTelaConfirmarCadastro(String placa);
int  verificarToqueConfirmacao();   // 1 = SIM, 0 = NAO, -1 = nada
void atualizarRelogioCabecalho();
bool executarCalibracaoTouch(bool forcar);
bool verificarPressaoLongaStatus();
void desenharTelaConfiguracoes();
int  verificarToqueConfiguracoes(); // 1 = WiFi, 2 = calibrar, 3 = voltar
void desenharTelaPortalWifi(String ap, String senha, String ip, String mensagem);
void desenharTelaTestandoWifi(String ssid);
bool verificarToqueCancelarPortalWifi();

// helpers internos
void initCores();
void centralizarTexto(String texto, int yTopo, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void textoCentralizadoEm(String texto, int xCaixa, int yCaixa, int wCaixa, int hCaixa, uint16_t cor, const GFXfont *fonte = nullptr, uint8_t tamanho = 1);
void desenharIconeWifi(int x, int y);
void desenharStatusCabecalho();
void desenharFaixaTracejada(int y);
void desenharCabecalho();
void desenharLogoP(int cx, int cy, int lado);
void desenharSplash();
void desenharTeclado(String placaAtual, FormatoPlaca formato);
void desenharIconeCarregando(int cx, int cy, int raio);
void desenharIconeResultado(TipoResultado tipo, uint16_t cor);
void desenharPlacaVeicular(int x, int y, int w, int h, String texto);
bool toqueDentro(int tx, int ty, int x, int y, int w, int h);
void lerToqueTela(int &x, int &y);
bool lerNovoToque(int &x, int &y);
void atualizarEstadoToque();
void bloquearToqueAtualAteSoltar();
bool carregarCalibracaoTouch();
bool salvarCalibracaoTouch(long xMin, long xMax, long yMin, long yMax);
bool calibracaoTouchPlausivel(long xMin, long xMax, long yMin, long yMax);
bool detectarToqueMantidoNoBoot();
ModoTecladoInterno obterModoTeclado(String placaAtual, FormatoPlaca formato);
EventoTeclado criarEventoTeclado(AcaoTeclado acao, char caractere = 0);
bool placaProntaParaConfirmar(String placaAtual, FormatoPlaca formato);
int  alturaFonte(const GFXfont *fonte, uint8_t tamanho);
int  larguraTexto(String texto, const GFXfont *fonte, uint8_t tamanho);

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

  // A propria splash e a janela de recuperacao: manter o dedo na tela por
  // cerca de 800 ms forca uma nova calibracao, mesmo se os limites salvos
  // estiverem ruins demais para acertar o menu de configuracoes.
  bool forcarCalibracao = detectarToqueMantidoNoBoot();
  if (!executarCalibracaoTouch(forcarCalibracao)) {
    Serial.println("[UI] Calibracao nao concluida ou nao persistida; mantendo limites disponiveis.");
  }
  bloquearToqueAtualAteSoltar();
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
  // Mensagens de falha e SSIDs variam de tamanho. Ajustar a fonte antes de
  // desenhar evita texto cortado ou quebra automática sobre outros controles.
  if (w > TELA_W - 20 && tamanho > 1) tamanho = 1;
  w = larguraTexto(texto, fonte, tamanho);
  if (w > TELA_W - 20 && (fonte == FONTE_GIGANTE || fonte == FONTE_GRANDE)) fonte = FONTE_MEDIA;
  w = larguraTexto(texto, fonte, tamanho);
  if (w > TELA_W - 20) fonte = FONTE_PEQUENA;
  w = larguraTexto(texto, fonte, tamanho);
  if (w > TELA_W - 20) {
    while (texto.length() && larguraTexto(texto + "...", fonte, tamanho) > TELA_W - 20) texto.remove(texto.length() - 1);
    texto += "...";
    w = larguraTexto(texto, fonte, tamanho);
  }
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
  return (tx >= x && tx < x + w && ty >= y && ty < y + h);
}

long diferencaAbsoluta(long a, long b) {
  return a >= b ? a - b : b - a;
}

void mapearToqueBruto(long brutoX, long brutoY,
                      long xMin, long xMax, long yMin, long yMax,
                      int &x, int &y) {
  x = map(brutoX, xMin, xMax, 0, TELA_W - 1);
  y = map(brutoY, yMin, yMax, 0, TELA_H - 1);
  x = constrain(x, 0, TELA_W - 1);
  y = constrain(y, 0, TELA_H - 1);
}

// Converte a leitura bruta do XPT2046 em coordenada de tela. O getPoint()
// da biblioteca ja seleciona o par mais proximo entre tres leituras; aqui
// usamos a mediana de mais tres pontos para rejeitar o primeiro contato.
bool lerToqueFiltrado(int &x, int &y) {
  long amostrasX[3];
  long amostrasY[3];

  for (int i = 0; i < 3; i++) {
    if (!ts.touched()) return false;
    TS_Point p = ts.getPoint();
    amostrasX[i] = p.x;
    amostrasY[i] = p.y;
    delay(4);
  }

  for (int i = 1; i < 3; i++) {
    long valorX = amostrasX[i];
    long valorY = amostrasY[i];
    int j = i - 1;
    while (j >= 0 && amostrasX[j] > valorX) {
      amostrasX[j + 1] = amostrasX[j];
      j--;
    }
    amostrasX[j + 1] = valorX;

    j = i - 1;
    while (j >= 0 && amostrasY[j] > valorY) {
      amostrasY[j + 1] = amostrasY[j];
      j--;
    }
    amostrasY[j + 1] = valorY;
  }

  mapearToqueBruto(amostrasX[1], amostrasY[1],
                   touchXMin, touchXMax, touchYMin, touchYMax, x, y);
  return true;
}

void lerToqueTela(int &x, int &y) {
  TS_Point p = ts.getPoint();
  mapearToqueBruto(p.x, p.y, touchXMin, touchXMax, touchYMin, touchYMax, x, y);
}

void atualizarEstadoToque() {
  unsigned long agora = millis();
  toqueFisicoPresente = ts.touched();

  if (toqueFisicoPresente) {
    toqueSoltoDesde = 0;
    if (toqueEstavelAtivo) {
      // A posição atual serve apenas para cancelar gestos longos se o dedo
      // sair do alvo; continuar pressionado nunca cria outra tecla.
      if (!eventoToqueDisponivel) lerToqueTela(ultimoToqueX, ultimoToqueY);
      return;
    }

    if (toquePressionadoDesde == 0) {
      toquePressionadoDesde = agora;
      return;
    }
    if (agora - toquePressionadoDesde < TOQUE_ESTABILIZAR_MS) return;

    int x, y;
    if (lerToqueFiltrado(x, y)) {
      ultimoToqueX = x;
      ultimoToqueY = y;
      toqueEstavelAtivo = true;
      eventoToqueDisponivel = true;
    }
    toquePressionadoDesde = 0;
    return;
  }

  toquePressionadoDesde = 0;
  if (!toqueEstavelAtivo) {
    toqueSoltoDesde = 0;
    return;
  }

  if (toqueSoltoDesde == 0) {
    toqueSoltoDesde = agora;
    return;
  }
  if (agora - toqueSoltoDesde >= SOLTURA_ESTABILIZAR_MS) {
    toqueEstavelAtivo = false;
    eventoToqueDisponivel = false;
    toqueSoltoDesde = 0;
  }
}

bool lerNovoToque(int &x, int &y) {
  atualizarEstadoToque();
  if (!eventoToqueDisponivel) return false;

  eventoToqueDisponivel = false;
  x = ultimoToqueX;
  y = ultimoToqueY;
  return true;
}

void bloquearToqueAtualAteSoltar() {
  toqueFisicoPresente = ts.touched();
  toqueEstavelAtivo = toqueFisicoPresente;
  eventoToqueDisponivel = false;
  toquePressionadoDesde = 0;
  toqueSoltoDesde = 0;
}

bool calibracaoTouchPlausivel(long xMin, long xMax, long yMin, long yMax) {
  const long LIMITE_INFERIOR = -1000;
  const long LIMITE_SUPERIOR = 5100;
  if (xMin < LIMITE_INFERIOR || xMin > LIMITE_SUPERIOR ||
      xMax < LIMITE_INFERIOR || xMax > LIMITE_SUPERIOR ||
      yMin < LIMITE_INFERIOR || yMin > LIMITE_SUPERIOR ||
      yMax < LIMITE_INFERIOR || yMax > LIMITE_SUPERIOR) {
    return false;
  }
  long spanX = diferencaAbsoluta(xMin, xMax);
  long spanY = diferencaAbsoluta(yMin, yMax);
  return spanX >= 1800 && spanX <= 5000 &&
         spanY >= 1400 && spanY <= 5000;
}

bool carregarCalibracaoTouch() {
  Preferences preferencias;
  if (!preferencias.begin(NVS_UI_NAMESPACE, true)) return false;

  uint8_t versao = preferencias.getUChar("cal_ver", 0);
  long xMin = preferencias.getInt("x_min", TOUCH_X_MIN);
  long xMax = preferencias.getInt("x_max", TOUCH_X_MAX);
  long yMin = preferencias.getInt("y_min", TOUCH_Y_MIN);
  long yMax = preferencias.getInt("y_max", TOUCH_Y_MAX);
  preferencias.end();

  if (versao != VERSAO_CALIBRACAO_TOUCH ||
      !calibracaoTouchPlausivel(xMin, xMax, yMin, yMax)) {
    return false;
  }

  touchXMin = xMin;
  touchXMax = xMax;
  touchYMin = yMin;
  touchYMax = yMax;
  Serial.println("[TOUCH] Calibracao carregada da memoria.");
  return true;
}

bool salvarCalibracaoTouch(long xMin, long xMax, long yMin, long yMax) {
  Preferences preferencias;
  if (!preferencias.begin(NVS_UI_NAMESPACE, false)) return false;

  // Invalida primeiro e publica a versao por ultimo. Se faltar energia entre
  // as escritas, o proximo boot ignora o conjunto incompleto.
  bool ok = preferencias.putUChar("cal_ver", 0) == sizeof(uint8_t);
  bool gravouXMin = preferencias.putInt("x_min", (int32_t)xMin) == sizeof(int32_t);
  bool gravouXMax = preferencias.putInt("x_max", (int32_t)xMax) == sizeof(int32_t);
  bool gravouYMin = preferencias.putInt("y_min", (int32_t)yMin) == sizeof(int32_t);
  bool gravouYMax = preferencias.putInt("y_max", (int32_t)yMax) == sizeof(int32_t);
  ok = ok && gravouXMin && gravouXMax && gravouYMin && gravouYMax;
  if (ok) {
    ok = preferencias.putUChar("cal_ver", VERSAO_CALIBRACAO_TOUCH) == sizeof(uint8_t);
  }
  preferencias.end();
  return ok;
}

bool detectarToqueMantidoNoBoot() {
  const unsigned long JANELA_MS = 3000;
  const unsigned long SEGURAR_MS = 800;
  unsigned long inicio = millis();
  unsigned long pressionadoDesde = 0;

  while (millis() - inicio < JANELA_MS) {
    if (ts.touched()) {
      if (pressionadoDesde == 0) pressionadoDesde = millis();
      if (millis() - pressionadoDesde >= SEGURAR_MS) {
        Serial.println("[TOUCH] Toque mantido no boot: recalibracao solicitada.");
        return true;
      }
    } else {
      pressionadoDesde = 0;
    }
    delay(10);
  }
  return false;
}

void desenharMiraCalibracao(int x, int y, uint16_t cor) {
  tft.drawCircle(x, y, 12, cor);
  tft.drawCircle(x, y, 11, cor);
  tft.drawFastHLine(x - 18, y, 36, cor);
  tft.drawFastVLine(x, y - 18, 36, cor);
  tft.fillCircle(x, y, 3, cor);
}

void ordenarAmostras(long valores[], int quantidade) {
  for (int i = 1; i < quantidade; i++) {
    long valor = valores[i];
    int j = i - 1;
    while (j >= 0 && valores[j] > valor) {
      valores[j + 1] = valores[j];
      j--;
    }
    valores[j + 1] = valor;
  }
}

bool esperarSolturaCalibracao(unsigned long timeoutMs) {
  unsigned long inicio = millis();
  unsigned long soltoDesde = 0;
  while (millis() - inicio < timeoutMs) {
    if (!ts.touched()) {
      if (soltoDesde == 0) soltoDesde = millis();
      if (millis() - soltoDesde >= 80) return true;
    } else {
      soltoDesde = 0;
    }
    delay(8);
  }
  return false;
}

bool capturarPontoCalibracao(long &mediaX, long &mediaY) {
  const int AMOSTRAS = 15;
  const int DESCARTAR = 3;
  long valoresX[AMOSTRAS];
  long valoresY[AMOSTRAS];

  if (!esperarSolturaCalibracao(5000)) return false;

  unsigned long esperaDesde = millis();
  unsigned long pressaoDesde = 0;
  while (millis() - esperaDesde < 30000) {
    if (ts.touched()) {
      if (pressaoDesde == 0) pressaoDesde = millis();
      if (millis() - pressaoDesde >= 45) break;
    } else {
      pressaoDesde = 0;
    }
    delay(8);
  }
  if (pressaoDesde == 0 || millis() - esperaDesde >= 30000) return false;

  for (int i = 0; i < AMOSTRAS; i++) {
    if (!ts.touched()) return false;
    TS_Point ponto = ts.getPoint();
    valoresX[i] = ponto.x;
    valoresY[i] = ponto.y;
    delay(6);
  }

  if (!esperarSolturaCalibracao(5000)) return false;

  ordenarAmostras(valoresX, AMOSTRAS);
  ordenarAmostras(valoresY, AMOSTRAS);
  long somaX = 0;
  long somaY = 0;
  for (int i = DESCARTAR; i < AMOSTRAS - DESCARTAR; i++) {
    somaX += valoresX[i];
    somaY += valoresY[i];
  }
  const int UTILIZADAS = AMOSTRAS - 2 * DESCARTAR;
  mediaX = somaX / UTILIZADAS;
  mediaY = somaY / UTILIZADAS;
  return true;
}

void desenharPassoCalibracao(int passo, int total, int alvoX, int alvoY, String instrucao) {
  tft.fillScreen(corFundo);
  centralizarTexto("CALIBRAR TOUCH", 78, corTexto, FONTE_GRANDE);
  centralizarTexto(instrucao, 110, corDestaque, FONTE_MEDIA);
  centralizarTexto("Ponto " + String(passo) + " de " + String(total), 136,
                   corTextoFraco, FONTE_PEQUENA);
  desenharMiraCalibracao(alvoX, alvoY, corDestaque);
}

bool executarCalibracaoTouch(bool forcar) {
  bool calibracaoAnteriorValida = carregarCalibracaoTouch();
  if (calibracaoAnteriorValida && !forcar) return true;

  const int MARGEM = 26;
  const int alvoX[4] = {MARGEM, TELA_W - MARGEM, MARGEM, TELA_W - MARGEM};
  const int alvoY[4] = {MARGEM, MARGEM, TELA_H - MARGEM, TELA_H - MARGEM};
  long brutoX[4];
  long brutoY[4];

  // O toque que pediu a recalibracao nao pode valer como o primeiro ponto.
  if (!esperarSolturaCalibracao(7000)) return false;

  for (int ponto = 0; ponto < 4; ponto++) {
    bool capturado = false;
    for (int tentativa = 0; tentativa < 3 && !capturado; tentativa++) {
      desenharPassoCalibracao(ponto + 1, 4, alvoX[ponto], alvoY[ponto],
                             "Toque no centro da mira");
      capturado = capturarPontoCalibracao(brutoX[ponto], brutoY[ponto]);
      if (!capturado) {
        centralizarTexto("MANTENHA O DEDO FIRME", 168, corErro, FONTE_PEQUENA);
        delay(700);
      }
    }
    if (!capturado) return false;
    desenharMiraCalibracao(alvoX[ponto], alvoY[ponto], corSucesso);
    delay(220);
  }

  long xEsquerda = (brutoX[0] + brutoX[2]) / 2;
  long xDireita = (brutoX[1] + brutoX[3]) / 2;
  long ySuperior = (brutoY[0] + brutoY[1]) / 2;
  long yInferior = (brutoY[2] + brutoY[3]) / 2;
  long spanX = diferencaAbsoluta(xEsquerda, xDireita);
  long spanY = diferencaAbsoluta(ySuperior, yInferior);

  bool ladosCoerentes = spanX >= 1800 && spanY >= 1400 &&
    diferencaAbsoluta(brutoX[0], brutoX[2]) <= spanX / 5 &&
    diferencaAbsoluta(brutoX[1], brutoX[3]) <= spanX / 5 &&
    diferencaAbsoluta(brutoY[0], brutoY[1]) <= spanY / 5 &&
    diferencaAbsoluta(brutoY[2], brutoY[3]) <= spanY / 5;

  if (!ladosCoerentes) {
    tft.fillScreen(corFundo);
    centralizarTexto("CALIBRACAO INCONSISTENTE", 78, corErro, FONTE_MEDIA);
    centralizarTexto("Tente novamente com o dedo firme", 112, corTexto, FONTE_PEQUENA);
    delay(1200);
    return false;
  }

  float escalaX = (float)(xDireita - xEsquerda) /
                  (float)(alvoX[1] - alvoX[0]);
  float escalaY = (float)(yInferior - ySuperior) /
                  (float)(alvoY[2] - alvoY[0]);
  long novoXMin = xEsquerda - (long)(MARGEM * escalaX);
  long novoXMax = xDireita + (long)((MARGEM - 1) * escalaX);
  long novoYMin = ySuperior - (long)(MARGEM * escalaY);
  long novoYMax = yInferior + (long)((MARGEM - 1) * escalaY);

  if (!calibracaoTouchPlausivel(novoXMin, novoXMax, novoYMin, novoYMax)) {
    return false;
  }

  // Um quinto ponto independente impede gravar uma calibracao ruim causada
  // por uma mira tocada fora do centro.
  long centroBrutoX, centroBrutoY;
  tft.fillScreen(corFundo);
  centralizarTexto("TESTE FINAL", 42, corTexto, FONTE_GRANDE);
  centralizarTexto("Toque na mira central", 184, corDestaque, FONTE_MEDIA);
  centralizarTexto("Ponto 5 de 5", 210, corTextoFraco, FONTE_PEQUENA);
  desenharMiraCalibracao(TELA_W / 2, TELA_H / 2, corDestaque);
  if (!capturarPontoCalibracao(centroBrutoX, centroBrutoY)) return false;

  int centroX, centroY;
  mapearToqueBruto(centroBrutoX, centroBrutoY,
                   novoXMin, novoXMax, novoYMin, novoYMax, centroX, centroY);
  if (diferencaAbsoluta(centroX, TELA_W / 2) > 25 ||
      diferencaAbsoluta(centroY, TELA_H / 2) > 25) {
    tft.fillScreen(corFundo);
    centralizarTexto("TESTE CENTRAL FALHOU", 82, corErro, FONTE_GRANDE);
    centralizarTexto("Refaca a calibracao", 120, corTexto, FONTE_MEDIA);
    delay(1200);
    return false;
  }

  touchXMin = novoXMin;
  touchXMax = novoXMax;
  touchYMin = novoYMin;
  touchYMax = novoYMax;
  bool persistiu = salvarCalibracaoTouch(novoXMin, novoXMax, novoYMin, novoYMax);

  tft.fillScreen(corFundo);
  centralizarTexto("TOUCH CALIBRADO", 80, corSucesso, FONTE_GRANDE);
  centralizarTexto(persistiu ? "Configuracao salva" : "Valido apenas nesta sessao",
                   122, persistiu ? corTexto : corAlerta, FONTE_MEDIA);
  delay(900);
  bloquearToqueAtualAteSoltar();

  Serial.print("[TOUCH] Limites: X=");
  Serial.print(touchXMin);
  Serial.print("..");
  Serial.print(touchXMax);
  Serial.print(" Y=");
  Serial.print(touchYMin);
  Serial.print("..");
  Serial.println(touchYMax);
  return persistiu;
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
  centralizarTexto("Segure a tela para calibrar", 202, corTextoFraco, FONTE_PEQUENA);
  desenharFaixaTracejada(226);
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
  bloquearToqueAtualAteSoltar();
}

Operacao verificarToqueTelaInicial() {
  int x, y;
  if (!lerNovoToque(x, y)) return OP_NENHUMA;

  if (toqueDentro(x, y, BTN_ENTRADA_X, BTN_ENTRADA_Y, BTN_OP_W, BTN_OP_H)) {
    return OP_ENTRADA;
  }
  if (toqueDentro(x, y, BTN_SAIDA_X, BTN_SAIDA_Y, BTN_OP_W, BTN_OP_H)) {
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

EventoTeclado criarEventoTeclado(AcaoTeclado acao, char caractere) {
  EventoTeclado evento;
  evento.acao = acao;
  evento.caractere = caractere;
  return evento;
}

ModoTecladoInterno obterModoTeclado(String placaAtual, FormatoPlaca formato) {
  int posicao = placaAtual.length();
  if (posicao < 3) return MODO_TECLADO_LETRAS;
  if (posicao == 3) return MODO_TECLADO_NUMEROS;
  if (posicao == 4) {
    if (formato == FORMATO_NAO_ESCOLHIDO) return MODO_TECLADO_ESCOLHER_FORMATO;
    return formato == FORMATO_MERCOSUL ? MODO_TECLADO_LETRAS : MODO_TECLADO_NUMEROS;
  }
  if (posicao < 7) return MODO_TECLADO_NUMEROS;
  return MODO_TECLADO_CONFIRMAR;
}

bool placaProntaParaConfirmar(String placaAtual, FormatoPlaca formato) {
  if (placaAtual.length() != 7 || formato == FORMATO_NAO_ESCOLHIDO) return false;
  for (int i = 0; i < 3; i++) {
    if (placaAtual[i] < 'A' || placaAtual[i] > 'Z') return false;
  }
  if (placaAtual[3] < '0' || placaAtual[3] > '9') return false;

  if (formato == FORMATO_ANTIGA) {
    for (int i = 4; i < 7; i++) {
      if (placaAtual[i] < '0' || placaAtual[i] > '9') return false;
    }
    return true;
  }

  return placaAtual[4] >= 'A' && placaAtual[4] <= 'Z' &&
         placaAtual[5] >= '0' && placaAtual[5] <= '9' &&
         placaAtual[6] >= '0' && placaAtual[6] <= '9';
}

void desenharAcoesTeclado(String placaAtual) {
  tft.fillRoundRect(BOTAO_VOLTAR_X, BOTAO_ACAO_Y,
                    BOTAO_VOLTAR_W, BOTAO_ACAO_H, 7, corPainel);
  tft.drawRoundRect(BOTAO_VOLTAR_X, BOTAO_ACAO_Y,
                    BOTAO_VOLTAR_W, BOTAO_ACAO_H, 7,
                    placaAtual.length() > 0 ? corErro : corBotaoBorda);
  textoCentralizadoEm(placaAtual.length() > 0 ? "APAGAR" : "VOLTAR",
                      BOTAO_VOLTAR_X, BOTAO_ACAO_Y,
                      BOTAO_VOLTAR_W, BOTAO_ACAO_H,
                      placaAtual.length() > 0 ? corErro : corTextoFraco,
                      FONTE_MEDIA);

  tft.fillRoundRect(BOTAO_CANCELAR_X, BOTAO_ACAO_Y,
                    BOTAO_CANCELAR_W, BOTAO_ACAO_H, 7, corPainel);
  tft.drawRoundRect(BOTAO_CANCELAR_X, BOTAO_ACAO_Y,
                    BOTAO_CANCELAR_W, BOTAO_ACAO_H, 7, corBotaoBorda);
  textoCentralizadoEm("CANCELAR", BOTAO_CANCELAR_X, BOTAO_ACAO_Y,
                      BOTAO_CANCELAR_W, BOTAO_ACAO_H,
                      corTextoFraco, FONTE_MEDIA);
}

void desenharGradeLetras() {
  for (int linha = 0; linha < 3; linha++) {
    int quantidade = LETRAS_POR_LINHA[linha];
    int largura = quantidade * LETRA_W + (quantidade - 1) * LETRA_GAP;
    int offsetX = (TELA_W - largura) / 2;
    for (int coluna = 0; coluna < quantidade; coluna++) {
      int x = offsetX + coluna * (LETRA_W + LETRA_GAP);
      int y = LETRA_ROW_Y[linha];
      tft.fillRoundRect(x, y, LETRA_W, LETRA_H, 5, corBotao);
      tft.drawRoundRect(x, y, LETRA_W, LETRA_H, 5, corBotaoBorda);
      textoCentralizadoEm(String(LINHAS_LETRAS[linha][coluna]),
                          x, y, LETRA_W, LETRA_H, corTexto, FONTE_MEDIA);
    }
  }
}

void desenharGradeNumeros() {
  for (int linha = 0; linha < 2; linha++) {
    int quantidade = 5;
    int largura = quantidade * NUMERO_W + (quantidade - 1) * NUMERO_GAP;
    int offsetX = (TELA_W - largura) / 2;
    for (int coluna = 0; coluna < quantidade; coluna++) {
      int x = offsetX + coluna * (NUMERO_W + NUMERO_GAP);
      int y = NUMERO_ROW_Y[linha];
      tft.fillRoundRect(x, y, NUMERO_W, NUMERO_H, 6, corBotao);
      tft.drawRoundRect(x, y, NUMERO_W, NUMERO_H, 6, corBotaoBorda);
      textoCentralizadoEm(String(LINHAS_NUMEROS[linha][coluna]),
                          x, y, NUMERO_W, NUMERO_H, corTexto, FONTE_GRANDE);
    }
  }
}

void desenharEscolhaFormato() {
  centralizarTexto("QUAL E O MODELO DA PLACA?", 76, corTexto, FONTE_PEQUENA);

  tft.fillRoundRect(12, 98, 142, 72, 8, corPainel);
  tft.drawRoundRect(12, 98, 142, 72, 8, corDestaque);
  textoCentralizadoEm("ANTIGA", 12, 102, 142, 28, corDestaque, FONTE_GRANDE);
  textoCentralizadoEm("5a: NUMERO", 12, 137, 142, 22,
                      corTextoFraco, FONTE_PEQUENA);

  tft.fillRoundRect(166, 98, 142, 72, 8, corPainel);
  tft.drawRoundRect(166, 98, 142, 72, 8, corSucesso);
  textoCentralizadoEm("MERCOSUL", 166, 102, 142, 28, corSucesso, FONTE_GRANDE);
  textoCentralizadoEm("5a: LETRA", 166, 137, 142, 22,
                      corTextoFraco, FONTE_PEQUENA);
}

void desenharConfirmacaoTeclado(bool placaValida) {
  centralizarTexto(placaValida ? "CONFIRME A PLACA" : "CORRIJA A PLACA",
                   82, placaValida ? corTexto : corErro, FONTE_GRANDE);

  tft.fillRoundRect(12, 122, 142, 60, 8, corPainel);
  tft.drawRoundRect(12, 122, 142, 60, 8, corBotaoBorda);
  textoCentralizadoEm("CORRIGIR", 12, 122, 142, 60,
                      corTextoFraco, FONTE_MEDIA);

  tft.fillRoundRect(166, 122, 142, 60, 8,
                    placaValida ? corSucesso : corPainel);
  tft.drawRoundRect(166, 122, 142, 60, 8,
                    placaValida ? corSucesso : corBotaoBorda);
  textoCentralizadoEm("CONFIRMAR", 166, 122, 142, 60,
                      placaValida ? corFundo : corTextoFraco, FONTE_MEDIA);

  tft.fillRoundRect(70, 194, 180, 40, 7, corPainel);
  tft.drawRoundRect(70, 194, 180, 40, 7, corBotaoBorda);
  textoCentralizadoEm("CANCELAR", 70, 194, 180, 40,
                      corTextoFraco, FONTE_MEDIA);
}

void desenharTeclado(String placaAtual, FormatoPlaca formato) {
  ModoTecladoInterno modo = obterModoTeclado(placaAtual, formato);
  if (modo == MODO_TECLADO_LETRAS) desenharGradeLetras();
  else if (modo == MODO_TECLADO_NUMEROS) desenharGradeNumeros();
  else if (modo == MODO_TECLADO_ESCOLHER_FORMATO) desenharEscolhaFormato();
  else {
    desenharConfirmacaoTeclado(placaProntaParaConfirmar(placaAtual, formato));
    return;
  }
  desenharAcoesTeclado(placaAtual);
}

void desenharTelaTeclado(String placaAtual, FormatoPlaca formato) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  atualizarCaixaPlaca(placaAtual);
  desenharTeclado(placaAtual, formato);
  bloquearToqueAtualAteSoltar();
}

EventoTeclado verificarToqueTeclado(String placaAtual, FormatoPlaca formato) {
  int x, y;
  if (!lerNovoToque(x, y)) return criarEventoTeclado(TECLADO_NENHUMA);

  ModoTecladoInterno modo = obterModoTeclado(placaAtual, formato);
  if (modo == MODO_TECLADO_CONFIRMAR) {
    if (toqueDentro(x, y, 12, 122, 142, 60)) {
      return criarEventoTeclado(TECLADO_APAGAR);
    }
    if (toqueDentro(x, y, 166, 122, 142, 60) &&
        placaProntaParaConfirmar(placaAtual, formato)) {
      return criarEventoTeclado(TECLADO_CONFIRMAR);
    }
    if (toqueDentro(x, y, 70, 194, 180, 40)) {
      return criarEventoTeclado(TECLADO_CANCELAR);
    }
    return criarEventoTeclado(TECLADO_NENHUMA);
  }

  if (toqueDentro(x, y, BOTAO_VOLTAR_X, BOTAO_ACAO_Y,
                  BOTAO_VOLTAR_W, BOTAO_ACAO_H)) {
    return criarEventoTeclado(placaAtual.length() > 0
      ? TECLADO_APAGAR : TECLADO_CANCELAR);
  }
  if (toqueDentro(x, y, BOTAO_CANCELAR_X, BOTAO_ACAO_Y,
                  BOTAO_CANCELAR_W, BOTAO_ACAO_H)) {
    return criarEventoTeclado(TECLADO_CANCELAR);
  }

  if (modo == MODO_TECLADO_ESCOLHER_FORMATO) {
    if (toqueDentro(x, y, 12, 98, 142, 72)) {
      return criarEventoTeclado(TECLADO_FORMATO_ANTIGA);
    }
    if (toqueDentro(x, y, 166, 98, 142, 72)) {
      return criarEventoTeclado(TECLADO_FORMATO_MERCOSUL);
    }
    return criarEventoTeclado(TECLADO_NENHUMA);
  }

  if (modo == MODO_TECLADO_LETRAS) {
    for (int linha = 0; linha < 3; linha++) {
      int quantidade = LETRAS_POR_LINHA[linha];
      int largura = quantidade * LETRA_W + (quantidade - 1) * LETRA_GAP;
      int offsetX = (TELA_W - largura) / 2;
      int alturaAlvo = LETRA_H + (linha < 2 ? LETRA_GAP : 0);
      if (y >= LETRA_ROW_Y[linha] && y < LETRA_ROW_Y[linha] + alturaAlvo &&
          x >= offsetX && x < offsetX + largura) {
        int coluna = (x - offsetX) / (LETRA_W + LETRA_GAP);
        if (coluna >= 0 && coluna < quantidade) {
          return criarEventoTeclado(TECLADO_CARACTERE,
                                    LINHAS_LETRAS[linha][coluna]);
        }
      }
    }
    return criarEventoTeclado(TECLADO_NENHUMA);
  }

  for (int linha = 0; linha < 2; linha++) {
    int quantidade = 5;
    int largura = quantidade * NUMERO_W + (quantidade - 1) * NUMERO_GAP;
    int offsetX = (TELA_W - largura) / 2;
    int alturaAlvo = linha == 0
      ? NUMERO_ROW_Y[1] - NUMERO_ROW_Y[0]
      : NUMERO_H;
    if (y >= NUMERO_ROW_Y[linha] && y < NUMERO_ROW_Y[linha] + alturaAlvo &&
        x >= offsetX && x < offsetX + largura) {
      int coluna = (x - offsetX) / (NUMERO_W + NUMERO_GAP);
      if (coluna >= 0 && coluna < quantidade) {
        return criarEventoTeclado(TECLADO_CARACTERE,
                                  LINHAS_NUMEROS[linha][coluna]);
      }
    }
  }
  return criarEventoTeclado(TECLADO_NENHUMA);
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
  bloquearToqueAtualAteSoltar();
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
  bloquearToqueAtualAteSoltar();
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
  bloquearToqueAtualAteSoltar();
}

// 1 = SIM, 0 = NAO, -1 = nada
int verificarToqueConfirmacao() {
  int x, y;
  if (!lerNovoToque(x, y)) return -1;

  if (toqueDentro(x, y, CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H)) {
    return 1;
  }
  if (toqueDentro(x, y, CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H)) {
    return 0;
  }
  return -1;
}

// -------------------------------------------------------------------------
// MANUTENCAO LOCAL — acesso discreto pelo status do cabecalho
// -------------------------------------------------------------------------
static unsigned long statusPressionadoDesde = 0;
static bool pressaoLongaStatusDisparada = false;

bool verificarPressaoLongaStatus() {
  atualizarEstadoToque();

  bool sobreCabecalho = toqueFisicoPresente && toqueEstavelAtivo &&
    toqueDentro(ultimoToqueX, ultimoToqueY, TELA_W - 90, 0, 90, HEADER_H + 8);

  if (!sobreCabecalho) {
    statusPressionadoDesde = 0;
    if (!toqueFisicoPresente) pressaoLongaStatusDisparada = false;
    return false;
  }

  if (statusPressionadoDesde == 0) statusPressionadoDesde = millis();
  if (!pressaoLongaStatusDisparada &&
      millis() - statusPressionadoDesde >= 3000) {
    pressaoLongaStatusDisparada = true;
    eventoToqueDisponivel = false;
    return true;
  }
  return false;
}

void desenharTelaConfiguracoes() {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  centralizarTexto("CONFIGURACOES", 42, corTexto, FONTE_GRANDE);

  tft.fillRoundRect(20, 76, 280, 46, 8, corPainel);
  tft.drawRoundRect(20, 76, 280, 46, 8, corDestaque);
  textoCentralizadoEm("TROCAR WIFI", 20, 76, 280, 46,
                      corDestaque, FONTE_GRANDE);

  tft.fillRoundRect(20, 134, 280, 46, 8, corPainel);
  tft.drawRoundRect(20, 134, 280, 46, 8, corBotaoBorda);
  textoCentralizadoEm("RECALIBRAR TOUCH", 20, 134, 280, 46,
                      corTexto, FONTE_MEDIA);

  tft.fillRoundRect(70, 194, 180, 38, 7, corPainel);
  tft.drawRoundRect(70, 194, 180, 38, 7, corBotaoBorda);
  textoCentralizadoEm("VOLTAR", 70, 194, 180, 38,
                      corTextoFraco, FONTE_MEDIA);
  bloquearToqueAtualAteSoltar();
}

int verificarToqueConfiguracoes() {
  int x, y;
  if (!lerNovoToque(x, y)) return 0;
  if (toqueDentro(x, y, 20, 76, 280, 46)) return 1;
  if (toqueDentro(x, y, 20, 134, 280, 46)) return 2;
  if (toqueDentro(x, y, 70, 194, 180, 38)) return 3;
  return 0;
}

String limitarTextoUI(String texto, int maximo) {
  if ((int)texto.length() <= maximo) return texto;
  if (maximo <= 3) return texto.substring(0, maximo);
  return texto.substring(0, maximo - 3) + "...";
}

void desenharBotaoCancelarPortal() {
  tft.fillRoundRect(60, 198, 200, 36, 7, corPainel);
  tft.drawRoundRect(60, 198, 200, 36, 7, corBotaoBorda);
  textoCentralizadoEm("CANCELAR", 60, 198, 200, 36,
                      corTextoFraco, FONTE_MEDIA);
}

void desenharTelaPortalWifi(String ap, String senha, String ip, String mensagem) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  centralizarTexto("CONFIGURAR WIFI", 38, corDestaque, FONTE_GRANDE);
  centralizarTexto("1. Conecte o celular na rede", 68,
                   corTextoFraco, FONTE_PEQUENA);
  centralizarTexto(limitarTextoUI(ap, 26), 88, corTexto, FONTE_MEDIA);
  centralizarTexto("Senha: " + limitarTextoUI(senha, 20), 110,
                   corTexto, FONTE_PEQUENA);
  centralizarTexto("2. Abra no navegador", 134,
                   corTextoFraco, FONTE_PEQUENA);
  centralizarTexto("http://" + limitarTextoUI(ip, 20), 154,
                   corDestaque, FONTE_MEDIA);
  if (mensagem.length() > 0) {
    centralizarTexto(limitarTextoUI(mensagem, 34), 176,
                     corAlerta, FONTE_PEQUENA);
  }
  desenharBotaoCancelarPortal();
  bloquearToqueAtualAteSoltar();
}

void desenharTelaTestandoWifi(String ssid) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  desenharIconeCarregando(160, 88, 24);
  centralizarTexto("TESTANDO A REDE", 126, corTexto, FONTE_GRANDE);
  centralizarTexto(limitarTextoUI(ssid, 28), 154, corDestaque, FONTE_MEDIA);
  centralizarTexto("Aguarde alguns segundos", 176,
                   corTextoFraco, FONTE_PEQUENA);
  desenharBotaoCancelarPortal();
  bloquearToqueAtualAteSoltar();
}

bool verificarToqueCancelarPortalWifi() {
  int x, y;
  if (!lerNovoToque(x, y)) return false;
  return toqueDentro(x, y, 60, 198, 200, 36);
}

#endif
