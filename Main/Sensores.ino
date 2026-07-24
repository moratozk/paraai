// =========================================================================
// MÓDULO DE SENSORES (Sensores.ino)
// 4 sensores HC-SR04 independentes (um por vaga), com filtro anti-ruído
// e reserva lógica de vaga.
//
// A reserva existe para fechar uma corrida real: sem ela, dois veículos
// digitando a placa em sequência rápida (antes do primeiro estacionar de
// fato) podiam receber a MESMA vaga, porque a escolha era baseada só no
// sensor (ainda fisicamente livre). Agora, ao assumir uma vaga na entrada,
// ela é reservada imediatamente; a reserva expira sozinha se o carro nunca
// chegar a ocupar o espaço (ex.: motorista desistiu no caminho).
// =========================================================================

#ifndef SENSORES_H
#define SENSORES_H

#include <Arduino.h>

#define NUM_VAGAS 4

// Pinos de cada sensor. Ajustados para não conflitar com T_CLK(25),
// T_DIN(32) e T_DO(36) do touch (ver DisplayUI.ino). ECHO 1 e 2 usam
// pinos só-entrada (34/35); ECHO 3 e 4 usam GPIOs comuns (5/16), que
// funcionam normalmente como entrada.
static const int PINOS_TRIGGER[NUM_VAGAS] = {18, 19, 23, 27};
static const int PINOS_ECHO[NUM_VAGAS]    = {34, 35, 5, 16};

static const int LIMITE_DISTANCIA_CM = 30;
static const unsigned long TIMEOUT_PULSO_US = 30000UL;
static const int LEITURAS_PARA_CONFIRMAR = 3;

// Se o carro nunca chegar a ocupar fisicamente a vaga reservada, ela volta
// a ficar disponível sozinha depois deste tempo (evita "vaga fantasma").
static const unsigned long TEMPO_MAX_RESERVA_MS = 2UL * 60UL * 1000UL;

static bool estadoConfirmado[NUM_VAGAS]    = {false, false, false, false};
static bool ultimaLeituraBruta[NUM_VAGAS]  = {false, false, false, false};
static int  contadorConfirmacao[NUM_VAGAS] = {0, 0, 0, 0};

static bool vagaReservada[NUM_VAGAS]         = {false, false, false, false};
static unsigned long reservaDesdeMillis[NUM_VAGAS] = {0, 0, 0, 0};

void initSensores() {
  for (int i = 0; i < NUM_VAGAS; i++) {
    pinMode(PINOS_TRIGGER[i], OUTPUT);
    digitalWrite(PINOS_TRIGGER[i], LOW);
    pinMode(PINOS_ECHO[i], INPUT);
  }
  Serial.println("[SENSORES] 4 sensores HC-SR04 inicializados.");
}

static bool lerDistanciaBruta(int indiceVaga) {
  digitalWrite(PINOS_TRIGGER[indiceVaga], LOW);
  delayMicroseconds(2);
  digitalWrite(PINOS_TRIGGER[indiceVaga], HIGH);
  delayMicroseconds(10);
  digitalWrite(PINOS_TRIGGER[indiceVaga], LOW);

  long duracao = pulseIn(PINOS_ECHO[indiceVaga], HIGH, TIMEOUT_PULSO_US);
  if (duracao == 0) return false; // timeout, fora de alcance

  int distancia = duracao * 0.034 / 2;
  if (distancia <= 0 || distancia > 400) return false; // leitura implausível

  return (distancia <= LIMITE_DISTANCIA_CM);
}

// Atualiza e retorna o estado (já filtrado) de UMA vaga específica (0 a 3)
bool verificarVagaOcupada(int indiceVaga) {
  bool leituraAtual = lerDistanciaBruta(indiceVaga);

  if (leituraAtual == ultimaLeituraBruta[indiceVaga]) {
    if (contadorConfirmacao[indiceVaga] < LEITURAS_PARA_CONFIRMAR) {
      contadorConfirmacao[indiceVaga]++;
    }
  } else {
    ultimaLeituraBruta[indiceVaga] = leituraAtual;
    contadorConfirmacao[indiceVaga] = 1;
  }

  if (contadorConfirmacao[indiceVaga] >= LEITURAS_PARA_CONFIRMAR) {
    estadoConfirmado[indiceVaga] = leituraAtual;
    // O carro chegou de verdade: a reserva lógica já cumpriu o papel dela.
    if (leituraAtual && vagaReservada[indiceVaga]) {
      vagaReservada[indiceVaga] = false;
    }
  }

  return estadoConfirmado[indiceVaga];
}

// Expira reservas antigas cujo carro nunca chegou a estacionar de fato.
// Chamar uma vez por iteração do loop principal.
void atualizarReservasVaga() {
  unsigned long agora = millis();
  for (int i = 0; i < NUM_VAGAS; i++) {
    if (vagaReservada[i] && (agora - reservaDesdeMillis[i] >= TEMPO_MAX_RESERVA_MS)) {
      vagaReservada[i] = false;
      Serial.print("[SENSORES] Reserva da vaga ");
      Serial.print(i + 1);
      Serial.println(" expirou sem o veiculo chegar - liberada.");
    }
  }
}

void reservarVaga(int indiceVaga) {
  vagaReservada[indiceVaga] = true;
  reservaDesdeMillis[indiceVaga] = millis();
}

void liberarReservaVaga(int indiceVaga) {
  vagaReservada[indiceVaga] = false;
}

// Estado bruto (já filtrado) de uma vaga - usado pela UI pra desenhar o
// painel de vagas individuais.
bool obterEstadoVaga(int indiceVaga) {
  return estadoConfirmado[indiceVaga];
}

// Índice (0 a 3) da primeira vaga livre E não reservada, ou -1 se lotado
int encontrarVagaLivre() {
  for (int i = 0; i < NUM_VAGAS; i++) {
    if (!estadoConfirmado[i] && !vagaReservada[i]) return i;
  }
  return -1;
}

// Quantas vagas estão realmente disponíveis para um novo veículo agora
// (livre no sensor E sem reserva de outra entrada em andamento). Usa a
// mesma regra de encontrarVagaLivre() de propósito, pra o número exibido
// na tela nunca prometer uma vaga que o sistema não vai de fato oferecer.
int contarVagasLivres() {
  int livres = 0;
  for (int i = 0; i < NUM_VAGAS; i++) {
    if (!estadoConfirmado[i] && !vagaReservada[i]) livres++;
  }
  return livres;
}

#endif
