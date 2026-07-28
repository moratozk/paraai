// =========================================================================
// ParaAí - CALIBRAÇÃO DO TOUCH (XPT2046)
// -------------------------------------------------------------------------
// Rode este sketch UMA VEZ para descobrir os valores reais do seu módulo.
// Cada tela sai de fábrica com uma variação; usar valores "genéricos" faz
// o toque cair na tecla errada (você toca no "O" e ele registra "I").
//
// COMO USAR
//   1. Grave este sketch no ESP32 (mesma fiação do projeto)
//   2. Abra o Monitor Serial em 115200
//   3. Toque no CENTRO de cada mira que aparecer (são 4, nos cantos)
//   4. No fim, o Serial mostra as 4 linhas #define prontas
//   5. Copie essas linhas para Main/DisplayUI.ino, substituindo as antigas
//   6. Regrave o firmware principal
//
// Para refazer a calibração, é só gravar este sketch de novo.
// =========================================================================

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>

// ---- Mesma pinagem do firmware principal ----
#define TFT_SCLK   14
#define TFT_MOSI   13
#define TFT_MISO   12
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    -1
#define TFT_LED    21

#define TOUCH_CS   33
#define TOUCH_SCLK 25
#define TOUCH_MOSI 32
#define TOUCH_MISO 36

SPIClass spiTela(VSPI);
SPIClass spiTouch(HSPI);
Adafruit_ILI9341 tft = Adafruit_ILI9341(&spiTela, TFT_DC, TFT_CS, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS);

const int TELA_W = 320, TELA_H = 240;
const int MARGEM = 26;   // distância da mira até a borda

// Os 4 pontos de referência, em coordenadas de tela
const int alvoX[4] = { MARGEM, TELA_W - MARGEM, MARGEM,           TELA_W - MARGEM };
const int alvoY[4] = { MARGEM, MARGEM,          TELA_H - MARGEM,  TELA_H - MARGEM };
const char* nomes[4] = { "SUPERIOR ESQUERDO", "SUPERIOR DIREITO",
                         "INFERIOR ESQUERDO", "INFERIOR DIREITO" };

// Leituras BRUTAS do touch em cada ponto
long brutoX[4], brutoY[4];

uint16_t corFundo, corMira, corTexto, corOk;

void desenharMira(int x, int y, uint16_t cor) {
  tft.drawCircle(x, y, 12, cor);
  tft.drawCircle(x, y, 11, cor);
  tft.drawFastHLine(x - 18, y, 36, cor);
  tft.drawFastVLine(x, y - 18, 36, cor);
  tft.fillCircle(x, y, 3, cor);
}

void textoCentro(const char* txt, int y, uint16_t cor, uint8_t tam) {
  tft.setTextColor(cor);
  tft.setTextSize(tam);
  int largura = strlen(txt) * 6 * tam;
  tft.setCursor((TELA_W - largura) / 2, y);
  tft.print(txt);
}

// Espera um toque estável e devolve a média das leituras brutas
void lerToqueEstavel(long &mediaX, long &mediaY) {
  const int AMOSTRAS = 24;
  long somaX = 0, somaY = 0;
  int lidas = 0;

  while (!ts.touched()) { delay(10); }   // espera encostar

  while (lidas < AMOSTRAS) {
    if (ts.touched()) {
      TS_Point p = ts.getPoint();
      somaX += p.x;
      somaY += p.y;
      lidas++;
    }
    delay(8);
  }

  mediaX = somaX / AMOSTRAS;
  mediaY = somaY / AMOSTRAS;

  while (ts.touched()) { delay(10); }    // espera soltar
  delay(250);                            // anti-repique
}

void setup() {
  Serial.begin(115200);
  delay(400);

  pinMode(TFT_LED, OUTPUT);
  digitalWrite(TFT_LED, HIGH);

  spiTela.begin(TFT_SCLK, TFT_MISO, TFT_MOSI, TFT_CS);
  tft.begin(40000000UL);
  tft.setRotation(3);

  spiTouch.begin(TOUCH_SCLK, TOUCH_MISO, TOUCH_MOSI, TOUCH_CS);
  ts.begin(spiTouch);
  ts.setRotation(3);

  corFundo = tft.color565(12, 14, 18);
  corMira  = tft.color565(255, 196, 0);
  corTexto = tft.color565(244, 246, 251);
  corOk    = tft.color565(46, 214, 130);

  Serial.println();
  Serial.println("=============================================");
  Serial.println("   ParaAi - Calibracao do touch XPT2046");
  Serial.println("=============================================");
  Serial.println("Toque no CENTRO de cada mira que aparecer.");
  Serial.println();

  // ---- coleta dos 4 pontos ----
  for (int i = 0; i < 4; i++) {
    tft.fillScreen(corFundo);
    textoCentro("CALIBRACAO DO TOUCH", 80, corTexto, 2);
    textoCentro("Toque no centro da mira", 112, corMira, 1);

    char passo[24];
    snprintf(passo, sizeof(passo), "Ponto %d de 4", i + 1);
    textoCentro(passo, 132, corTexto, 1);

    desenharMira(alvoX[i], alvoY[i], corMira);

    Serial.print("Ponto ");
    Serial.print(i + 1);
    Serial.print("/4 - ");
    Serial.print(nomes[i]);
    Serial.println(" ... aguardando toque");

    lerToqueEstavel(brutoX[i], brutoY[i]);

    Serial.print("   bruto: x=");
    Serial.print(brutoX[i]);
    Serial.print("  y=");
    Serial.println(brutoY[i]);

    desenharMira(alvoX[i], alvoY[i], corOk);
    delay(350);
  }

  // ---- cálculo ----
  // Média dos lados para reduzir erro de mira.
  long xEsq = (brutoX[0] + brutoX[2]) / 2;   // pontos na coluna da esquerda
  long xDir = (brutoX[1] + brutoX[3]) / 2;   // coluna da direita
  long yCim = (brutoY[0] + brutoY[1]) / 2;   // linha de cima
  long yBai = (brutoY[2] + brutoY[3]) / 2;   // linha de baixo

  // As miras não estão na borda (MARGEM), então extrapolamos até x=0 e x=319
  float escalaX = (float)(xDir - xEsq) / (float)(alvoX[1] - alvoX[0]);
  float escalaY = (float)(yBai - yCim) / (float)(alvoY[2] - alvoY[0]);

  long xMin = xEsq - (long)(MARGEM * escalaX);
  long xMax = xDir + (long)(MARGEM * escalaX);
  long yMin = yCim - (long)(MARGEM * escalaY);
  long yMax = yBai + (long)(MARGEM * escalaY);

  // Se o eixo estiver invertido, os valores saem trocados: o map() do
  // firmware lida com isso naturalmente (min > max funciona).
  Serial.println();
  Serial.println("=============================================");
  Serial.println(" PRONTO! Copie as 4 linhas abaixo para o");
  Serial.println(" arquivo Main/DisplayUI.ino (substitua as");
  Serial.println(" linhas #define TOUCH_X_MIN ... existentes)");
  Serial.println("=============================================");
  Serial.println();
  Serial.print("#define TOUCH_X_MIN "); Serial.println(xMin);
  Serial.print("#define TOUCH_X_MAX "); Serial.println(xMax);
  Serial.print("#define TOUCH_Y_MIN "); Serial.println(yMin);
  Serial.print("#define TOUCH_Y_MAX "); Serial.println(yMax);
  Serial.println();
  Serial.println("=============================================");
  Serial.println("Agora toque na tela para TESTAR a calibracao.");
  Serial.println("O ponto deve aparecer exatamente sob o dedo.");
  Serial.println("=============================================");

  // ---- tela de teste ----
  tft.fillScreen(corFundo);
  textoCentro("CALIBRADO!", 14, corOk, 2);
  textoCentro("Veja os #define no Monitor Serial", 40, corTexto, 1);
  textoCentro("Toque para testar a precisao", 56, corMira, 1);

  // guarda os valores para o loop de teste
  Serial.println();
}

// valores calculados, usados no teste interativo
long tXMin, tXMax, tYMin, tYMax;
bool valoresProntos = false;

void loop() {
  if (!valoresProntos) {
    long xEsq = (brutoX[0] + brutoX[2]) / 2;
    long xDir = (brutoX[1] + brutoX[3]) / 2;
    long yCim = (brutoY[0] + brutoY[1]) / 2;
    long yBai = (brutoY[2] + brutoY[3]) / 2;
    float escalaX = (float)(xDir - xEsq) / (float)(alvoX[1] - alvoX[0]);
    float escalaY = (float)(yBai - yCim) / (float)(alvoY[2] - alvoY[0]);
    tXMin = xEsq - (long)(MARGEM * escalaX);
    tXMax = xDir + (long)(MARGEM * escalaX);
    tYMin = yCim - (long)(MARGEM * escalaY);
    tYMax = yBai + (long)(MARGEM * escalaY);
    valoresProntos = true;
  }

  if (ts.touched()) {
    TS_Point p = ts.getPoint();
    int x = map(p.x, tXMin, tXMax, 0, TELA_W);
    int y = map(p.y, tYMin, tYMax, 0, TELA_H);
    x = constrain(x, 0, TELA_W - 1);
    y = constrain(y, 0, TELA_H - 1);

    tft.fillCircle(x, y, 4, corMira);

    Serial.print("toque -> tela x=");
    Serial.print(x);
    Serial.print(" y=");
    Serial.print(y);
    Serial.print("   (bruto ");
    Serial.print(p.x);
    Serial.print(",");
    Serial.print(p.y);
    Serial.println(")");
    delay(40);
  }
}
