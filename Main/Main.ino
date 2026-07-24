// =========================================================================
// Firmware TCC - Para Aí (Principal)
// Controlo de acesso por placa cadastrada, 4 vagas, cobrança por tempo
// =========================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <ESP32Servo.h>

#include "Credenciais.h"
#include "Sensores.ino"
#include "DisplayUI.ino"

// ==========================================
// MULTI-ESTACIONAMENTO
// O ParaAí atende vários estacionamentos; cada totem pertence a um deles.
// O ESTACIONAMENTO_ID (Credenciais.h) vincula este equipamento ao documento
// estacionamentos/{id}, que o painel web do dono acompanha em tempo real.
// Os veículos (veiculos/{placa}) são GLOBAIS: carteira única na rede toda.
// ==========================================
#define CAMINHO_ESTACIONAMENTO "estacionamentos/" ESTACIONAMENTO_ID

// ==========================================
// SERVO (CATRACA) - abre e fecha sozinha
// ==========================================
#define PIN_SERVO 4
Servo catraca;
const int ANGULO_ABERTO  = 90;
const int ANGULO_FECHADO = 0;
bool catracaAberta = false;
unsigned long catracaAbertaDesde = 0;
const unsigned long TEMPO_CATRACA_ABERTA_MS = 5000;

// ==========================================
// WIFI / FIREBASE / HORA
// ==========================================
const unsigned long WIFI_TIMEOUT_MS = 15000;
const unsigned long WIFI_RETRY_MS   = 10000;
const unsigned long HORA_RETRY_MS   = 10000;

bool horaSincronizada  = false;
bool firebaseConfigurado = false;
unsigned long ultimaTentativaWifi = 0;
unsigned long ultimaTentativaHora = 0;

// Heartbeat: o totem grava "estou vivo" no Firestore periodicamente, pro
// painel web conseguir mostrar se o dispositivo esta online ou fora do ar.
const unsigned long HEARTBEAT_INTERVALO_MS = 60000;
unsigned long ultimoHeartbeat = 0;
bool heartbeatJaEnviado = false;

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ==========================================
// HORA REAL (NTP) - necessário pra sobreviver reinicializações sem
// perder a contagem de tempo de quem já está estacionado, e também
// pro handshake HTTPS do Firebase validar o certificado TLS direito
// ==========================================
const char* NTP_SERVER = "pool.ntp.org";
const long  GMT_OFFSET_SEC = -3 * 3600; // Brasil (UTC-3, sem horario de verao)
const int   DAYLIGHT_OFFSET_SEC = 0;

// ==========================================
// TARIFA (ajuste aqui o preço)
// ==========================================
const double VALOR_POR_HORA = 5.00; // R$ por hora, cobrado proporcional aos minutos

// ==========================================
// MÁQUINA DE ESTADOS DA TELA
// ==========================================
enum EstadoTela { TELA_INICIAL, TELA_TECLADO, TELA_PROCESSANDO, TELA_RESULTADO };
EstadoTela estadoAtual = TELA_INICIAL;

String placaDigitada = "";
unsigned long resultadoDesde = 0;
const unsigned long TEMPO_TELA_RESULTADO_MS = 4000;
int vagasLivresExibidas = -1;

bool estadoAnteriorVaga[NUM_VAGAS] = {false, false, false, false};

// Declarações
bool conectarWiFi(unsigned long timeoutMs);
void gerenciarConexao();
bool sincronizarHora();
void configurarFirebase();
long obterTimestampAtual();
void abrirCatraca();
void processarPlacaDigitada(String placa);
bool atualizarOcupacaoFirestore(int indiceVaga, bool ocupada);
void atualizarPlacaNaVagaFirestore(int indiceVaga, String placa);
void enviarHeartbeat();
void imprimirStatus();

void setup() {
  Serial.begin(115200);

  catraca.setPeriodHertz(50);
  catraca.attach(PIN_SERVO, 500, 2400);
  catraca.write(ANGULO_FECHADO);
  Serial.println("[CATRACA] Servo inicializado e fechado.");

  initSensores();

  // WiFi/Firebase primeiro (tela ainda apagada) - evita somar o pico de
  // corrente do WiFi conectando com o consumo do backlight
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  bool wifiOk = conectarWiFi(WIFI_TIMEOUT_MS);
  if (wifiOk) {
    // A hora precisa vir ANTES do Firebase: além de a cobrança depender de
    // timestamps corretos, o handshake HTTPS do Firebase valida a validade
    // do certificado TLS usando o relógio do ESP32 - com o relógio "zerado"
    // (1970) a conexão pode falhar de um jeito dificil de diagnosticar.
    horaSincronizada = sincronizarHora();
    if (horaSincronizada) {
      configurarFirebase();
    } else {
      Serial.println("[SETUP] Hora nao sincronizada - Firebase sera configurado assim que possivel.");
    }
  } else {
    Serial.println("\n[WIFI] Nao conectou a tempo - seguindo em modo OFFLINE.");
  }

  initUI();
  vagasLivresExibidas = contarVagasLivres();
  desenharTelaInicial(vagasLivresExibidas);

  Serial.println("TUDO PRONTO! A entrar no Loop Principal...");
}

void loop() {
  // ----- WiFi/Hora/Firebase em segundo plano, com reconexao de verdade -----
  gerenciarConexao();

  // ----- Reservas de vaga expiram sozinhas se o carro nunca chegar -----
  atualizarReservasVaga();

  // ----- Sensores das 4 vagas - só envia ao Firebase quando MUDA -----
  // Só marca como "sincronizado" se a escrita no Firestore realmente deu
  // certo; se falhar, tenta de novo na proxima volta do loop sozinho.
  for (int i = 0; i < NUM_VAGAS; i++) {
    bool ocupadaAgora = verificarVagaOcupada(i);
    if (ocupadaAgora != estadoAnteriorVaga[i]) {
      if (atualizarOcupacaoFirestore(i, ocupadaAgora)) {
        estadoAnteriorVaga[i] = ocupadaAgora;
      }
    }
  }

  // ----- Heartbeat pro painel web saber que o totem esta online -----
  if (!heartbeatJaEnviado || (millis() - ultimoHeartbeat >= HEARTBEAT_INTERVALO_MS)) {
    if (firebaseConfigurado && Firebase.ready()) {
      ultimoHeartbeat = millis();
      heartbeatJaEnviado = true;
      enviarHeartbeat();
    }
  }

  // ----- Catraca fecha sozinha depois do tempo configurado -----
  if (catracaAberta && (millis() - catracaAbertaDesde >= TEMPO_CATRACA_ABERTA_MS)) {
    catraca.write(ANGULO_FECHADO);
    catracaAberta = false;
    Serial.println("[CATRACA] Fechada automaticamente.");
  }

  // ----- Relogio/wifi do cabecalho (leve, só a área pequena, 1x/segundo) -----
  atualizarRelogioCabecalho();

  // ----- Máquina de estados da tela -----
  switch (estadoAtual) {
    case TELA_INICIAL: {
      int livres = contarVagasLivres();
      if (livres != vagasLivresExibidas) {
        vagasLivresExibidas = livres;
        atualizarVagasInicial(livres);
      }
      if (verificarToqueTelaInicial()) {
        placaDigitada = "";
        estadoAtual = TELA_TECLADO;
        desenharTelaTeclado(placaDigitada);
      }
      break;
    }

    case TELA_TECLADO: {
      char tecla = verificarToqueTeclado();
      if (tecla == 27) { // CANCELAR
        estadoAtual = TELA_INICIAL;
        vagasLivresExibidas = contarVagasLivres();
        desenharTelaInicial(vagasLivresExibidas);
      } else if (tecla == '\b') { // APAGAR
        if (placaDigitada.length() > 0) {
          placaDigitada.remove(placaDigitada.length() - 1);
          atualizarCaixaPlaca(placaDigitada);
        }
      } else if (tecla == '\n') { // OK
        if (placaDigitada.length() >= 4) {
          estadoAtual = TELA_PROCESSANDO;
          desenharTelaProcessando();
          processarPlacaDigitada(placaDigitada);
        }
      } else if (tecla != 0) {
        if (placaDigitada.length() < 7) {
          placaDigitada += tecla;
          atualizarCaixaPlaca(placaDigitada);
        }
      }
      break;
    }

    case TELA_PROCESSANDO:
      // processarPlacaDigitada() já roda de forma síncrona e troca de
      // estado sozinha ao terminar - nada a fazer aqui
      break;

    case TELA_RESULTADO:
      if (millis() - resultadoDesde >= TEMPO_TELA_RESULTADO_MS) {
        estadoAtual = TELA_INICIAL;
        vagasLivresExibidas = contarVagasLivres();
        desenharTelaInicial(vagasLivresExibidas);
      }
      break;
  }

  // ----- Comandos seriais manuais (debug / demonstração) -----
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'A' || c == 'a') abrirCatraca();
    else if (c == 'S' || c == 's') imprimirStatus();
  }

  delay(15);
}

// ==========================================
// CATRACA
// ==========================================
void abrirCatraca() {
  catraca.write(ANGULO_ABERTO);
  catracaAberta = true;
  catracaAbertaDesde = millis();
  Serial.println("[CATRACA] Aberta.");
}

// ==========================================
// WIFI / FIREBASE / NTP
// ==========================================

// Tentativa inicial e BLOQUEANTE de conectar, usada só no setup() - decide
// se o sistema já sobe online ou entra em modo offline. As tentativas
// seguintes (se a conexão cair depois) são feitas em segundo plano por
// gerenciarConexao(), sem travar a tela.
bool conectarWiFi(unsigned long timeoutMs) {
  Serial.print("A ligar ao Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - inicio > timeoutMs) return false;
    Serial.print(".");
    delay(300);
  }
  Serial.println("\nWiFi Conectado!");
  return true;
}

// Máquina de reconexão não-bloqueante: cuida de WiFi -> hora -> Firebase,
// nessa ordem, e funciona tanto na primeira conexão quanto depois de uma
// queda de rede (o firmware antigo só tentava reconectar UMA vez na vida).
void gerenciarConexao() {
  unsigned long agora = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (agora - ultimaTentativaWifi >= WIFI_RETRY_MS) {
      ultimaTentativaWifi = agora;
      Serial.println("[WIFI] Desconectado - tentando (re)conectar em segundo plano...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }

  if (!horaSincronizada) {
    if (agora - ultimaTentativaHora >= HORA_RETRY_MS) {
      ultimaTentativaHora = agora;
      horaSincronizada = sincronizarHora();
    }
    return;
  }

  if (!firebaseConfigurado) {
    configurarFirebase();
  }
}

void configurarFirebase() {
  Serial.println("A iniciar o Firebase. Aguarde...");
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true;
  fbdo.setResponseSize(2048);

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  firebaseConfigurado = true;
  Serial.println("Firebase OK!");
}

// Retorna true se a hora foi sincronizada com sucesso. Cada tentativa de
// leitura tem um timeout curto (500ms) para o pior caso ficar em ~10s, e
// nao em quase 2 minutos como no calculo original (5s de timeout default
// da getLocalTime() + 300ms de delay, vezes 20 tentativas).
bool sincronizarHora() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  Serial.print("Sincronizando hora via NTP");
  struct tm timeinfo;
  int tentativas = 0;
  while (!getLocalTime(&timeinfo, 500) && tentativas < 20) {
    Serial.print(".");
    tentativas++;
  }
  bool ok = tentativas < 20;
  Serial.println(ok ? "\nHora sincronizada!" : "\n[NTP] Falhou ao sincronizar - tentando de novo em breve.");
  return ok;
}

long obterTimestampAtual() {
  time_t agora;
  time(&agora);
  return (long)agora;
}

// ==========================================
// FIRESTORE - VAGAS
// ==========================================
bool atualizarOcupacaoFirestore(int indiceVaga, bool ocupada) {
  if (!firebaseConfigurado || !Firebase.ready()) return false;
  String caminho = String(CAMINHO_ESTACIONAMENTO) + "/vagas/" + String(indiceVaga + 1);
  FirebaseJson conteudo;
  conteudo.set("fields/ocupada/booleanValue", ocupada);
  bool ok = Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "ocupada");
  if (!ok) {
    Serial.print("[FIRESTORE] Falha ao atualizar ocupacao da vaga ");
    Serial.print(indiceVaga + 1);
    Serial.println(" - tentando de novo na proxima leitura.");
  }
  return ok;
}

void atualizarPlacaNaVagaFirestore(int indiceVaga, String placa) {
  if (!firebaseConfigurado || !Firebase.ready()) return;
  String caminho = String(CAMINHO_ESTACIONAMENTO) + "/vagas/" + String(indiceVaga + 1);
  FirebaseJson conteudo;
  conteudo.set("fields/placa/stringValue", placa);
  if (!Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "placa")) {
    Serial.println("[FIRESTORE] Aviso: falha ao gravar a placa na vaga (nao critico).");
  }
}

// Grava "estou vivo" + resumo direto no documento do estacionamento. O
// painel web considera o totem online se a ultima atualizacao tiver menos
// de ~2,5 minutos.
void enviarHeartbeat() {
  FirebaseJson conteudo;
  conteudo.set("fields/ultimaAtualizacao/integerValue", String(obterTimestampAtual()));
  conteudo.set("fields/vagasLivres/integerValue", String(contarVagasLivres()));
  if (!Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", CAMINHO_ESTACIONAMENTO, conteudo.raw(), "ultimaAtualizacao,vagasLivres")) {
    Serial.println("[FIRESTORE] Aviso: falha ao enviar heartbeat.");
  }
}

// ==========================================
// LÓGICA PRINCIPAL: ENTRADA / SAÍDA POR PLACA
// ==========================================
void processarPlacaDigitada(String placa) {
  if (!firebaseConfigurado || !Firebase.ready()) {
    desenharTelaResultado(RESULTADO_ERRO, "SEM CONEXAO", "Tente novamente", "Verifique o WiFi");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  String caminho = "veiculos/" + placa;
  bool encontrado = Firebase.Firestore.getDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), "");

  if (!encontrado) {
    if (fbdo.httpCode() == 404) {
      Serial.print("[FIRESTORE] Veiculo nao encontrado: ");
      Serial.println(placa);
      desenharTelaResultado(RESULTADO_ERRO, "NAO CADASTRADO", "Placa: " + placa, "Procure o balcao");
    } else {
      Serial.print("[FIRESTORE] Erro de comunicacao (codigo ");
      Serial.print(fbdo.httpCode());
      Serial.println(") ao consultar veiculo.");
      desenharTelaResultado(RESULTADO_ERRO, "ERRO NO SERVIDOR", "Tente novamente", "Codigo " + String(fbdo.httpCode()));
    }
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  FirebaseJson json;
  json.setJsonData(fbdo.payload());
  FirebaseJsonData resultado;

  bool ativo = false;
  int vagaAtual = 0;
  long horaEntrada = 0;
  double saldo = 0;

  if (json.get(resultado, "fields/ativo/booleanValue"))       ativo = resultado.to<bool>();
  if (json.get(resultado, "fields/vagaAtual/integerValue"))   vagaAtual = resultado.to<int>();
  if (json.get(resultado, "fields/horaEntrada/integerValue")) horaEntrada = resultado.to<int>();
  // O saldo pode chegar como doubleValue (gravado por este firmware) ou como
  // integerValue (gravado pela pagina web: o SDK JavaScript salva numeros
  // inteiros, ex. recarga de R$ 50, como integerValue automaticamente).
  if (json.get(resultado, "fields/saldo/doubleValue"))        saldo = resultado.to<double>();
  else if (json.get(resultado, "fields/saldo/integerValue"))  saldo = resultado.to<double>();

  if (!ativo) {
    desenharTelaResultado(RESULTADO_ERRO, "CADASTRO INATIVO", "Placa: " + placa, "Procure o balcao");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  if (vagaAtual == 0) {
    // ----- ENTRADA -----
    int indiceVagaLivre = encontrarVagaLivre();
    if (indiceVagaLivre == -1) {
      desenharTelaResultado(RESULTADO_ALERTA, "LOTADO", "Nenhuma vaga livre", "Tente novamente mais tarde");
      resultadoDesde = millis();
      estadoAtual = TELA_RESULTADO;
      return;
    }

    // Reserva a vaga JA, antes de escrever no Firestore: fecha a corrida
    // onde duas placas digitadas em sequencia rapida poderiam receber o
    // mesmo indice de vaga (o sensor ainda nao teria detectado o primeiro
    // carro fisicamente estacionado).
    reservarVaga(indiceVagaLivre);

    long agora = obterTimestampAtual();
    int numeroVaga = indiceVagaLivre + 1;

    FirebaseJson conteudo;
    conteudo.set("fields/vagaAtual/integerValue", String(numeroVaga));
    conteudo.set("fields/horaEntrada/integerValue", String(agora));
    conteudo.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
    bool ok = Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "vagaAtual,horaEntrada,estacionamentoId");

    if (!ok) {
      // A escrita que abre a "conta" do veiculo falhou: libera a reserva e
      // NAO abre a catraca, senao o carro entra sem nada registrado.
      liberarReservaVaga(indiceVagaLivre);
      Serial.println("[FIRESTORE] Falha ao registrar entrada - catraca nao sera aberta.");
      desenharTelaResultado(RESULTADO_ERRO, "ERRO NO SERVIDOR", "Nao foi possivel registrar", "Tente novamente");
      resultadoDesde = millis();
      estadoAtual = TELA_RESULTADO;
      return;
    }

    atualizarPlacaNaVagaFirestore(indiceVagaLivre, placa);

    abrirCatraca();
    desenharTelaResultado(RESULTADO_SUCESSO, "BEM-VINDO!", "Vaga " + String(numeroVaga), placa);
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;

  } else {
    // ----- SAÍDA -----
    long agora = obterTimestampAtual();
    long duracaoSegundos = 0;
    if (horaEntrada > 0 && agora > horaEntrada) {
      duracaoSegundos = agora - horaEntrada;
    } else {
      Serial.println("[COBRANCA] Timestamp de entrada invalido - cobranca zerada por seguranca.");
    }
    double valorCobrado = (duracaoSegundos / 3600.0) * VALOR_POR_HORA;
    double novoSaldo = saldo - valorCobrado;

    FirebaseJson conteudo;
    conteudo.set("fields/vagaAtual/integerValue", String(0));
    conteudo.set("fields/horaEntrada/integerValue", String(0));
    conteudo.set("fields/estacionamentoId/stringValue", "");
    conteudo.set("fields/saldo/doubleValue", novoSaldo);
    bool ok = Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "vagaAtual,horaEntrada,estacionamentoId,saldo");

    if (!ok) {
      // Nao fecha a conta do veiculo no banco: nao abre a catraca e deixa
      // o motorista tentar de novo, em vez de liberar a saida sem cobrar.
      Serial.println("[FIRESTORE] Falha ao registrar saida - catraca nao sera aberta.");
      desenharTelaResultado(RESULTADO_ERRO, "ERRO NO SERVIDOR", "Nao foi possivel registrar", "Tente novamente");
      resultadoDesde = millis();
      estadoAtual = TELA_RESULTADO;
      return;
    }

    int indiceVaga = vagaAtual - 1;
    atualizarPlacaNaVagaFirestore(indiceVaga, "");

    String idHistorico = placa + "_" + String((unsigned long)agora);
    String caminhoHistorico = "historico/" + idHistorico;
    FirebaseJson historico;
    historico.set("fields/placa/stringValue", placa);
    historico.set("fields/vaga/integerValue", String(vagaAtual));
    historico.set("fields/entrada/integerValue", String(horaEntrada));
    historico.set("fields/saida/integerValue", String(agora));
    historico.set("fields/duracaoMinutos/integerValue", String(duracaoSegundos / 60));
    historico.set("fields/valorCobrado/doubleValue", valorCobrado);
    historico.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
    if (!Firebase.Firestore.createDocument(&fbdo, PROJECT_ID, "", caminhoHistorico.c_str(), historico.raw())) {
      Serial.println("[FIRESTORE] Aviso: falha ao gravar historico (a saida ja foi liberada normalmente).");
    }

    abrirCatraca();
    char bufValor[16];
    snprintf(bufValor, sizeof(bufValor), "R$ %.2f", valorCobrado);
    int minutos = duracaoSegundos / 60;
    desenharTelaResultado(RESULTADO_SUCESSO, "ATE LOGO!", String(minutos) + " min - " + String(bufValor), placa);
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
  }
}

// ==========================================
// DEBUG / DEMONSTRACAO
// ==========================================
void imprimirStatus() {
  Serial.println("===== STATUS PARA AI =====");
  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "conectado" : "desconectado");
  Serial.print("Hora sincronizada: ");
  Serial.println(horaSincronizada ? "sim" : "nao");
  Serial.print("Firebase configurado: ");
  Serial.println(firebaseConfigurado ? "sim" : "nao");
  Serial.print("Vagas livres (disponiveis para nova entrada): ");
  Serial.println(contarVagasLivres());
  for (int i = 0; i < NUM_VAGAS; i++) {
    Serial.print("  Vaga ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.println(obterEstadoVaga(i) ? "ocupada" : "livre");
  }
  Serial.println("=============================");
}
