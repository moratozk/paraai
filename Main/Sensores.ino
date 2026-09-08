// =========================================================================
// MÓDULO DE SENSORES (Sensores.ino)
// 4 sensores HC-SR04 independentes (um por vaga), com filtro anti-ruído
// e reserva lógica de vaga.
//
// A reserva existe para fechar uma corrida real: sem ela, dois veículos
// digitando a placa em sequência rápida (antes do primeiro estacionar de
// fato) podiam receber a MESMA vaga, porque a escolha era baseada só no
// sensor (ainda fisicamente livre). Agora, ao assumir uma vaga na entrada,
// ela é reservada imediatamente e persistida antes de registrar a entrada.
// Somente uma saída confirmada ou a reconciliação com o servidor pode liberar
// a associação; tempo, leitura do sensor e reinicialização não a apagam.
// =========================================================================

#ifndef SENSORES_H
#define SENSORES_H

#include <Arduino.h>
#include <Preferences.h>
#include <stddef.h>
#include <string.h>

// MAX_VAGAS = sensores fisicamente instalados na placa. É o tamanho dos
// arrays, então precisa ser constante de compilação.
#define MAX_VAGAS 4
#define NUM_VAGAS MAX_VAGAS   // mantido para os arrays já existentes

// Quantas vagas estão REALMENTE em operação. O operador define isso no painel
// web (campo "Número de vagas") e o totem passa a considerar só as primeiras
// N — assim o número mostrado no site e no totem é sempre o mesmo, sem
// precisar regravar o firmware. Vale 1..MAX_VAGAS.
int vagasAtivas = MAX_VAGAS;

// Ajusta a quantidade em operação, ignorando valores fora do que o hardware
// suporta. Devolve true se o valor mudou (para o totem redesenhar a tela).
bool definirVagasAtivas(int quantidade) {
  if (quantidade < 1) quantidade = 1;
  if (quantidade > MAX_VAGAS) quantidade = MAX_VAGAS;
  if (quantidade == vagasAtivas) return false;
  vagasAtivas = quantidade;
  Serial.print("[SENSORES] Vagas em operacao agora: ");
  Serial.println(vagasAtivas);
  return true;
}

// Pinos de cada sensor. Ajustados para não conflitar com T_CLK(25),
// T_DIN(32) e T_DO(36) do touch (ver DisplayUI.ino). ECHO 1 e 2 usam
// pinos só-entrada (34/35); ECHO 3 e 4 usam GPIOs comuns (5/16), que
// funcionam normalmente como entrada.
static const int PINOS_TRIGGER[NUM_VAGAS] = {18, 19, 23, 27};
static const int PINOS_ECHO[NUM_VAGAS]    = {34, 35, 5, 16};

static const int LIMITE_DISTANCIA_CM = 30;
// A vaga vazia também precisa produzir eco válido: limitar a 8 ms excluiria
// anteparos acima de ~1,36 m. O loop escalona um único sensor por vez, então
// preservamos a faixa de até 4 m sem somar quatro esperas consecutivas.
static const unsigned long TIMEOUT_PULSO_US = 30000UL;
static const int LEITURAS_PARA_CONFIRMAR = 3;
static const int FALHAS_PARA_INVALIDAR = 3;

// Apenas diagnóstico: a passagem deste prazo nunca encerra uma estadia.
static const unsigned long TEMPO_AVISO_RESERVA_MS = 2UL * 60UL * 1000UL;

static bool estadoConfirmado[NUM_VAGAS]    = {false, false, false, false};
static bool ultimaLeituraBruta[NUM_VAGAS]  = {false, false, false, false};
static int  contadorConfirmacao[NUM_VAGAS] = {0, 0, 0, 0};
static int  falhasConsecutivas[NUM_VAGAS]  = {0, 0, 0, 0};
static bool leituraValida[NUM_VAGAS]       = {false, false, false, false};

static unsigned long reservaDesdeMillis[NUM_VAGAS] = {0, 0, 0, 0};
static bool avisoReservaEmitido[NUM_VAGAS] = {false, false, false, false};

struct DadosReservasPersistidos {
  uint32_t versao;
  char placas[NUM_VAGAS][8];
  uint32_t checksum;
};

static const char* NVS_RESERVAS_NAMESPACE = "paraai-res";
static const char* NVS_RESERVAS_CHAVE = "reservas";
static const uint32_t VERSAO_RESERVAS = 1;
static DadosReservasPersistidos reservasPersistidas = {};
static bool reservasProntas = false;

static uint32_t calcularChecksumReservas(const DadosReservasPersistidos& dados) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&dados);
  uint32_t checksum = 2166136261UL;
  for (size_t i = 0; i < offsetof(DadosReservasPersistidos, checksum); i++) {
    checksum ^= bytes[i];
    checksum *= 16777619UL;
  }
  return checksum;
}

static bool placaReservaValida(const char* placa) {
  if (placa[7] != '\0') return false;
  for (int i = 0; i < 3; i++) {
    if (placa[i] < 'A' || placa[i] > 'Z') return false;
  }
  if (placa[3] < '0' || placa[3] > '9') return false;
  bool quintaValida = (placa[4] >= 'A' && placa[4] <= 'Z') ||
                     (placa[4] >= '0' && placa[4] <= '9');
  return quintaValida && placa[5] >= '0' && placa[5] <= '9' &&
         placa[6] >= '0' && placa[6] <= '9';
}

static bool dadosReservasValidos(const DadosReservasPersistidos& dados) {
  if (dados.versao != VERSAO_RESERVAS ||
      dados.checksum != calcularChecksumReservas(dados)) return false;

  for (int i = 0; i < NUM_VAGAS; i++) {
    if (dados.placas[i][0] == '\0') {
      for (int j = 1; j < 8; j++) {
        if (dados.placas[i][j] != '\0') return false;
      }
    } else if (!placaReservaValida(dados.placas[i])) {
      return false;
    }
  }
  return true;
}

static bool lerReservasPersistidas(Preferences& preferencias,
                                  DadosReservasPersistidos& dados) {
  return preferencias.getBytesLength(NVS_RESERVAS_CHAVE) == sizeof(dados) &&
         preferencias.getBytes(NVS_RESERVAS_CHAVE, &dados, sizeof(dados)) == sizeof(dados) &&
         dadosReservasValidos(dados);
}

// Um único blob mantém todas as associações na mesma transação da NVS.
// Só adotamos o novo estado depois de reler e conferir exatamente a gravação.
static bool gravarReservasPersistidas(Preferences& preferencias,
                                     DadosReservasPersistidos& dados) {
  dados.versao = VERSAO_RESERVAS;
  dados.checksum = calcularChecksumReservas(dados);
  if (!dadosReservasValidos(dados) ||
      preferencias.putBytes(NVS_RESERVAS_CHAVE, &dados, sizeof(dados)) != sizeof(dados)) {
    return false;
  }
  DadosReservasPersistidos verificacao = {};
  return lerReservasPersistidas(preferencias, verificacao) &&
         memcmp(&verificacao, &dados, sizeof(dados)) == 0;
}

static bool carregarReservasPersistidas() {
  Preferences preferencias;
  if (!preferencias.begin(NVS_RESERVAS_NAMESPACE, false)) return false;

  DadosReservasPersistidos dados = {};
  // Ausência na primeira instalação é diferente de conteúdo inválido.
  // Nunca substituir dados existentes corrompidos por vagas supostamente livres.
  bool ok = preferencias.isKey(NVS_RESERVAS_CHAVE)
    ? lerReservasPersistidas(preferencias, dados)
    : gravarReservasPersistidas(preferencias, dados);
  preferencias.end();
  if (ok) reservasPersistidas = dados;
  return ok;
}

static bool salvarReservasPersistidas(DadosReservasPersistidos& dados) {
  Preferences preferencias;
  bool ok = preferencias.begin(NVS_RESERVAS_NAMESPACE, false);
  if (ok) {
    ok = gravarReservasPersistidas(preferencias, dados);
    preferencias.end();
  }
  if (!ok) {
    // A escrita pode ter sido aplicada sem a releitura conseguir confirmá-la.
    // Bloquear novas entradas evita usar um estado de persistência incerto.
    reservasProntas = false;
    Serial.println("[RESERVAS] Falha de persistencia; novas entradas bloqueadas.");
    return false;
  }
  reservasPersistidas = dados;
  return true;
}

bool estadoReservasPronto() {
  return reservasProntas;
}

String obterPlacaReservada(int indiceVaga) {
  if (indiceVaga < 0 || indiceVaga >= NUM_VAGAS) return "";
  return String(reservasPersistidas.placas[indiceVaga]);
}

void initSensores() {
  for (int i = 0; i < NUM_VAGAS; i++) {
    pinMode(PINOS_TRIGGER[i], OUTPUT);
    digitalWrite(PINOS_TRIGGER[i], LOW);
    pinMode(PINOS_ECHO[i], INPUT);
  }
  reservasProntas = carregarReservasPersistidas();
  for (int i = 0; i < NUM_VAGAS; i++) {
    reservaDesdeMillis[i] = millis();
    avisoReservaEmitido[i] = false;
  }
  Serial.println(reservasProntas
    ? "[RESERVAS] Associacoes de vagas carregadas da memoria."
    : "[RESERVAS] Memoria indisponivel ou invalida; novas entradas bloqueadas.");
  Serial.println("[SENSORES] 4 sensores HC-SR04 inicializados.");
}

enum ResultadoSensor { SENSOR_SEM_LEITURA, SENSOR_LIVRE, SENSOR_OCUPADO };

static ResultadoSensor lerDistanciaBruta(int indiceVaga) {
  digitalWrite(PINOS_TRIGGER[indiceVaga], LOW);
  delayMicroseconds(2);
  digitalWrite(PINOS_TRIGGER[indiceVaga], HIGH);
  delayMicroseconds(10);
  digitalWrite(PINOS_TRIGGER[indiceVaga], LOW);

  long duracao = pulseIn(PINOS_ECHO[indiceVaga], HIGH, TIMEOUT_PULSO_US);
  if (duracao == 0) return SENSOR_SEM_LEITURA;

  int distancia = duracao * 0.034 / 2;
  if (distancia <= 0 || distancia > 400) return SENSOR_SEM_LEITURA;

  return distancia <= LIMITE_DISTANCIA_CM ? SENSOR_OCUPADO : SENSOR_LIVRE;
}

// Atualiza e retorna o estado (já filtrado) de UMA vaga específica (0 a 3)
bool verificarVagaOcupada(int indiceVaga) {
  ResultadoSensor resultado = lerDistanciaBruta(indiceVaga);

  // Timeout e valor implausível não significam "vaga livre". Conservamos o
  // último estado e, após falhas repetidas, tiramos a vaga da seleção até o
  // sensor voltar a produzir leituras válidas.
  if (resultado == SENSOR_SEM_LEITURA) {
    contadorConfirmacao[indiceVaga] = 0;
    if (falhasConsecutivas[indiceVaga] < FALHAS_PARA_INVALIDAR) {
      falhasConsecutivas[indiceVaga]++;
    }
    if (falhasConsecutivas[indiceVaga] >= FALHAS_PARA_INVALIDAR) {
      leituraValida[indiceVaga] = false;
    }
    return estadoConfirmado[indiceVaga];
  }

  falhasConsecutivas[indiceVaga] = 0;
  bool leituraAtual = resultado == SENSOR_OCUPADO;

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
    leituraValida[indiceVaga] = true;
    // A leitura física não encerra a associação da placa com a vaga.
  }

  return estadoConfirmado[indiceVaga];
}

// Só uma leitura confirmada pode alimentar o Firestore ou liberar uma vaga.
bool leituraVagaValida(int indiceVaga) {
  return indiceVaga >= 0 && indiceVaga < NUM_VAGAS && leituraValida[indiceVaga];
}

// Avisa uma vez se o carro não ocupou a vaga. A estadia continua aberta e a
// reserva só é liberada por confirmação da lógica de entrada/saída no Main.
void atualizarReservasVaga() {
  unsigned long agora = millis();
  for (int i = 0; i < NUM_VAGAS; i++) {
    if (reservasPersistidas.placas[i][0] != '\0' && !avisoReservaEmitido[i] &&
        leituraValida[i] && !estadoConfirmado[i] &&
        agora - reservaDesdeMillis[i] >= TEMPO_AVISO_RESERVA_MS) {
      avisoReservaEmitido[i] = true;
      Serial.print("[SENSORES] Reserva da vaga ");
      Serial.print(i + 1);
      Serial.println(" aguarda o veiculo; associacao preservada ate confirmar a saida.");
    }
  }
}

bool reservarVaga(int indiceVaga, String placa) {
  if (!reservasProntas || indiceVaga < 0 || indiceVaga >= NUM_VAGAS ||
      placa.length() != 7 || !placaReservaValida(placa.c_str())) return false;
  if (reservasPersistidas.placas[indiceVaga][0] != '\0') {
    return placa == reservasPersistidas.placas[indiceVaga];
  }
  // Uma placa não pode reservar duas vagas no mesmo totem.
  for (int i = 0; i < NUM_VAGAS; i++) {
    if (placa == reservasPersistidas.placas[i]) return false;
  }

  DadosReservasPersistidos dados = reservasPersistidas;
  memcpy(dados.placas[indiceVaga], placa.c_str(), 8);
  if (!salvarReservasPersistidas(dados)) return false;
  reservaDesdeMillis[indiceVaga] = millis();
  avisoReservaEmitido[indiceVaga] = false;
  return true;
}

bool liberarReservaVaga(int indiceVaga) {
  if (!reservasProntas || indiceVaga < 0 || indiceVaga >= NUM_VAGAS) return false;
  if (reservasPersistidas.placas[indiceVaga][0] == '\0') return true;

  DadosReservasPersistidos dados = reservasPersistidas;
  memset(dados.placas[indiceVaga], 0, sizeof(dados.placas[indiceVaga]));
  if (!salvarReservasPersistidas(dados)) return false;
  reservaDesdeMillis[indiceVaga] = 0;
  avisoReservaEmitido[indiceVaga] = false;
  return true;
}

// Estado bruto (já filtrado) de uma vaga - usado pela UI pra desenhar o
// painel de vagas individuais.
bool obterEstadoVaga(int indiceVaga) {
  return estadoConfirmado[indiceVaga];
}

// Índice (0 a 3) da primeira vaga livre E não reservada, ou -1 se lotado
int encontrarVagaLivre() {
  if (!reservasProntas) return -1;
  for (int i = 0; i < vagasAtivas; i++) {
    if (leituraValida[i] && !estadoConfirmado[i] &&
        reservasPersistidas.placas[i][0] == '\0') return i;
  }
  return -1;
}

// Quantas vagas estão realmente disponíveis para um novo veículo agora
// (livre no sensor E sem reserva de outra entrada em andamento). Usa a
// mesma regra de encontrarVagaLivre() de propósito, pra o número exibido
// na tela nunca prometer uma vaga que o sistema não vai de fato oferecer.
int contarVagasLivres() {
  if (!reservasProntas) return 0;
  int livres = 0;
  for (int i = 0; i < vagasAtivas; i++) {
    if (leituraValida[i] && !estadoConfirmado[i] &&
        reservasPersistidas.placas[i][0] == '\0') livres++;
  }
  return livres;
}

#endif
