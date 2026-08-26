// =========================================================================
// Firmware TCC - Para Aí (Principal)
// Controle de acesso por placa, até 4 sensores e cobrança por tempo
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
// TARIFA
// ==========================================
// É apenas o valor de segurança para uma inicialização sem rede. Assim que o
// Firebase responde, tarifaPorHora recebe estacionamentos/{id}.tarifaHora.
const double TARIFA_PADRAO = 5.00;
double tarifaPorHora = TARIFA_PADRAO;

// ==========================================
// MÁQUINA DE ESTADOS DA TELA
// ==========================================
enum EstadoTela {
  TELA_INICIAL,
  TELA_TECLADO,
  TELA_PROCESSANDO,
  TELA_CONFIRMAR_CADASTRO,  // placa desconhecida: oferece cadastro no totem
  TELA_RESULTADO
};
EstadoTela estadoAtual = TELA_INICIAL;

// Placa aguardando confirmação de cadastro (usada na TELA_CONFIRMAR_CADASTRO)
String placaPendente = "";

String placaDigitada = "";
unsigned long resultadoDesde = 0;
const unsigned long TEMPO_TELA_RESULTADO_MS = 4000;
// O motorista declara na tela inicial se veio entrar ou sair. Antes o totem
// adivinhava pelo estado do veiculo; agora a intenção é explícita, o que evita
// abrir a catraca por engano quando alguém digita a placa errada.
Operacao operacaoEscolhida = OP_NENHUMA;

bool estadoAnteriorVaga[NUM_VAGAS] = {false, false, false, false};

// Declarações
bool conectarWiFi(unsigned long timeoutMs);
void gerenciarConexao();
bool sincronizarHora();
void configurarFirebase();
long obterTimestampAtual();
void abrirCatraca();
bool placaValida(String placa);
void processarPlacaDigitada(String placa);
bool atualizarOcupacaoFirestore(int indiceVaga, bool ocupada);
void atualizarPlacaNaVagaFirestore(int indiceVaga, String placa);
void enviarHeartbeat();
void sincronizarConfiguracao();
bool cadastrarVeiculoNoTotem(String placa);
void registrarEntrada(String placa, String caminho);
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

  // Busca vagas e tarifa do painel antes de liberar o uso do totem.
  sincronizarConfiguracao();

  desenharTelaInicial();

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
  for (int i = 0; i < vagasAtivas; i++) {
    bool ocupadaAgora = verificarVagaOcupada(i);
    if (ocupadaAgora != estadoAnteriorVaga[i]) {
      if (atualizarOcupacaoFirestore(i, ocupadaAgora)) {
        estadoAnteriorVaga[i] = ocupadaAgora;
      }
    }
  }

  // ----- Heartbeat pro painel web saber que o totem esta online -----
  // Na mesma passada lemos a configuração do painel (número de vagas), para
  // o totem acompanhar o que o operador ajustou no site.
  if (!heartbeatJaEnviado || (millis() - ultimoHeartbeat >= HEARTBEAT_INTERVALO_MS)) {
    if (firebaseConfigurado && Firebase.ready()) {
      ultimoHeartbeat = millis();
      heartbeatJaEnviado = true;
      sincronizarConfiguracao();
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
      Operacao escolha = verificarToqueTelaInicial();
      if (escolha != OP_NENHUMA) {
        operacaoEscolhida = escolha;
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
        desenharTelaInicial();
      } else if (tecla == '\b') { // APAGAR
        if (placaDigitada.length() > 0) {
          placaDigitada.remove(placaDigitada.length() - 1);
          atualizarCaixaPlaca(placaDigitada);
        }
      } else if (tecla == '\n') { // OK
        if (placaValida(placaDigitada)) {
          estadoAtual = TELA_PROCESSANDO;
          desenharTelaProcessando("Consultando placa...");
          processarPlacaDigitada(placaDigitada);
        } else {
          desenharTelaResultado(RESULTADO_ALERTA, "PLACA INVALIDA",
                                "Use ABC1234", "ou ABC1D23");
          resultadoDesde = millis();
          estadoAtual = TELA_RESULTADO;
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

    case TELA_CONFIRMAR_CADASTRO: {
      int resposta = verificarToqueConfirmacao();
      if (resposta == 1) {
        // Cadastra a placa aqui mesmo e segue direto para a entrada
        desenharTelaProcessando("Cadastrando placa...");
        if (cadastrarVeiculoNoTotem(placaPendente)) {
          String caminho = "veiculos/" + placaPendente;
          registrarEntrada(placaPendente, caminho);
        } else {
          desenharTelaResultado(RESULTADO_ERRO, "NAO FOI POSSIVEL",
                                "Tente novamente", "Procure o balcao");
          resultadoDesde = millis();
          estadoAtual = TELA_RESULTADO;
        }
      } else if (resposta == 0) {
        estadoAtual = TELA_INICIAL;
        desenharTelaInicial();
      }
      break;
    }

    case TELA_RESULTADO:
      if (millis() - resultadoDesde >= TEMPO_TELA_RESULTADO_MS) {
        estadoAtual = TELA_INICIAL;
        desenharTelaInicial();
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
    if (millis() - inicio > timeoutMs) {
      // Cancela a tentativa pendente. Sem isso, a próxima chamada a
      // WiFi.begin() pode falhar com "sta is connecting, cannot set config".
      WiFi.disconnect(false, false);
      Serial.println("\n[WIFI] Tentativa inicial expirou.");
      return false;
    }
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
      // Uma tentativa anterior pode ainda estar pendente. Cancela-a antes de
      // configurar a nova, para o ESP32 aceitar a troca de credenciais/rede.
      WiFi.disconnect(false, false);
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
  Serial.println("A autenticar o totem no Firebase. Aguarde...");
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.token_status_callback = tokenStatusCallback;
  auth.user.email = TOTEM_EMAIL;
  auth.user.password = TOTEM_PASSWORD;
  fbdo.setResponseSize(2048);

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  firebaseConfigurado = true;
  Serial.println("Firebase iniciado; aguardando token seguro do dispositivo.");
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

// Aceita os dois formatos brasileiros que o painel também valida:
// ABC1234 (antigo) e ABC1D23 (Mercosul). O teclado só produz A-Z e 0-9,
// mas validar aqui impede criar cadastros que o motorista não conseguiria
// vincular depois pelo app.
bool placaValida(String placa) {
  if (placa.length() != 7) return false;

  for (int i = 0; i < 3; i++) {
    if (placa[i] < 'A' || placa[i] > 'Z') return false;
  }
  if (placa[3] < '0' || placa[3] > '9') return false;

  bool antiga = true;
  for (int i = 4; i < 7; i++) {
    if (placa[i] < '0' || placa[i] > '9') antiga = false;
  }
  bool mercosul = placa[4] >= 'A' && placa[4] <= 'Z'
    && placa[5] >= '0' && placa[5] <= '9'
    && placa[6] >= '0' && placa[6] <= '9';
  return antiga || mercosul;
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
  // Quantos sensores existem de fato na placa. O painel usa isso para avisar
  // o operador caso ele configure mais vagas do que o totem consegue ler.
  conteudo.set("fields/vagasSuportadasTotem/integerValue", String(MAX_VAGAS));
  conteudo.set("fields/vagasEmOperacao/integerValue", String(vagasAtivas));
  conteudo.set("fields/tarifaAplicadaTotem/doubleValue", tarifaPorHora);

  if (!Firebase.Firestore.patchDocument(
          &fbdo, PROJECT_ID, "", CAMINHO_ESTACIONAMENTO, conteudo.raw(),
          "ultimaAtualizacao,vagasLivres,vagasSuportadasTotem,vagasEmOperacao,tarifaAplicadaTotem")) {
    Serial.println("[FIRESTORE] Aviso: falha ao enviar heartbeat.");
  }
}

// ==========================================
// CONFIGURAÇÃO VINDA DO PAINEL
// ==========================================
// Lê numVagas e tarifaHora do documento do estacionamento. O operador edita
// no painel e o equipamento se ajusta sem precisar regravar o firmware.
void sincronizarConfiguracao() {
  if (!firebaseConfigurado || !Firebase.ready()) return;

  if (!Firebase.Firestore.getDocument(&fbdo, PROJECT_ID, "",
                                      CAMINHO_ESTACIONAMENTO, "numVagas,tarifaHora")) {
    return;   // sem rede ou documento ainda não existe: mantém o valor atual
  }

  FirebaseJson resposta;
  FirebaseJsonData campo;
  resposta.setJsonData(fbdo.payload().c_str());

  if (resposta.get(campo, "fields/numVagas/integerValue") && campo.success) {
    int desejadas = campo.to<String>().toInt();
    if (desejadas > 0 && definirVagasAtivas(desejadas)) {
      Serial.print("[CONFIG] Vagas monitoradas: ");
      Serial.println(vagasAtivas);
    }
    if (desejadas > MAX_VAGAS) {
      Serial.print("[CONFIG] Painel pediu ");
      Serial.print(desejadas);
      Serial.print(" vagas, mas o hardware so tem ");
      Serial.print(MAX_VAGAS);
      Serial.println(" sensores. Operando com o maximo possivel.");
    }
  }

  double novaTarifa = -1.0;
  if (resposta.get(campo, "fields/tarifaHora/doubleValue") && campo.success) {
    novaTarifa = campo.to<String>().toDouble();
  } else if (resposta.get(campo, "fields/tarifaHora/integerValue") && campo.success) {
    novaTarifa = campo.to<String>().toDouble();
  }

  if (novaTarifa >= 0.0 && novaTarifa <= 10000.0 && novaTarifa != tarifaPorHora) {
    tarifaPorHora = novaTarifa;
    Serial.print("[CONFIG] Tarifa sincronizada: R$ ");
    Serial.println(tarifaPorHora, 2);
  }
}

// ==========================================
// CADASTRO DE VEÍCULO PELO PRÓPRIO TOTEM
// ==========================================
// Cria veiculos/{placa} com o mesmo formato que o painel web usa. O campo
// ownerUid fica de fora de propósito: assim o motorista consegue reivindicar
// essa placa depois, ao cadastrá-la na conta dele no app.
bool cadastrarVeiculoNoTotem(String placa) {
  if (!firebaseConfigurado || !Firebase.ready()) return false;

  String caminho = "veiculos/" + placa;
  FirebaseJson conteudo;
  conteudo.set("fields/ativo/booleanValue", true);
  conteudo.set("fields/vagaAtual/integerValue", String(0));
  conteudo.set("fields/horaEntrada/integerValue", String(0));
  conteudo.set("fields/saldo/doubleValue", 0.0);
  conteudo.set("fields/estacionamentoId/stringValue", "");
  conteudo.set("fields/tarifaHoraEntrada/doubleValue", 0.0);
  conteudo.set("fields/cadastradoNoTotem/booleanValue", true);

  bool ok = Firebase.Firestore.createDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw());
  if (ok) {
    Serial.print("[FIRESTORE] Veiculo cadastrado pelo totem: ");
    Serial.println(placa);
  } else {
    Serial.print("[FIRESTORE] Falha ao cadastrar veiculo (codigo ");
    Serial.print(fbdo.httpCode());
    Serial.println(").");
  }
  return ok;
}

// ==========================================
// ENTRADA (usada tanto pelo fluxo normal quanto após o auto-cadastro)
// ==========================================
void registrarEntrada(String placa, String caminho) {
  int indiceVagaLivre = encontrarVagaLivre();
  if (indiceVagaLivre == -1) {
    desenharTelaResultado(RESULTADO_ALERTA, "LOTADO", "Nenhuma vaga livre", "Volte mais tarde");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  // Reserva a vaga JA, antes de escrever no Firestore: fecha a corrida
  // onde duas placas digitadas em sequencia rapida poderiam receber o
  // mesmo indice de vaga (o sensor ainda nao teria detectado o primeiro
  // carro fisicamente estacionado).
  reservarVaga(indiceVagaLivre);

  // Atualiza a tarifa antes de abrir a conta e a congela nesta entrada. Uma
  // mudança de preço no painel não deve alterar retroativamente uma estadia.
  sincronizarConfiguracao();
  long agora = obterTimestampAtual();
  int numeroVaga = indiceVagaLivre + 1;

  FirebaseJson conteudo;
  conteudo.set("fields/vagaAtual/integerValue", String(numeroVaga));
  conteudo.set("fields/horaEntrada/integerValue", String(agora));
  conteudo.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
  conteudo.set("fields/tarifaHoraEntrada/doubleValue", tarifaPorHora);
  bool ok = Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "vagaAtual,horaEntrada,estacionamentoId,tarifaHoraEntrada");

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
  desenharTelaResultado(RESULTADO_SUCESSO, "BEM-VINDO!", "VAGA " + String(numeroVaga), placa);
  resultadoDesde = millis();
  estadoAtual = TELA_RESULTADO;
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
      // Numa SAÍDA a placa desconhecida é quase sempre erro de digitação:
      // cadastrar aqui só criaria um veículo fantasma sem entrada aberta.
      if (operacaoEscolhida == OP_SAIDA) {
        desenharTelaResultado(RESULTADO_ALERTA, "PLACA NAO ENCONTRADA",
                              placa, "Confira os caracteres");
        resultadoDesde = millis();
        estadoAtual = TELA_RESULTADO;
        return;
      }

      // Na entrada, em vez de barrar o motorista, o totem oferece o cadastro
      // na hora (ele vincula essa placa à conta dele no app depois, e o saldo
      // é adicionado por lá).
      Serial.print("[FIRESTORE] Veiculo nao cadastrado, oferecendo cadastro: ");
      Serial.println(placa);
      placaPendente = placa;
      desenharTelaConfirmarCadastro(placa);
      estadoAtual = TELA_CONFIRMAR_CADASTRO;
      return;
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
  double tarifaHoraEntrada = -1.0;

  if (json.get(resultado, "fields/ativo/booleanValue"))       ativo = resultado.to<bool>();
  if (json.get(resultado, "fields/vagaAtual/integerValue"))   vagaAtual = resultado.to<int>();
  if (json.get(resultado, "fields/horaEntrada/integerValue")) horaEntrada = resultado.to<int>();
  // O saldo pode chegar como doubleValue (gravado por este firmware) ou como
  // integerValue (gravado pela pagina web: o SDK JavaScript salva numeros
  // inteiros, ex. recarga de R$ 50, como integerValue automaticamente).
  if (json.get(resultado, "fields/saldo/doubleValue"))        saldo = resultado.to<double>();
  else if (json.get(resultado, "fields/saldo/integerValue"))  saldo = resultado.to<double>();
  if (json.get(resultado, "fields/tarifaHoraEntrada/doubleValue"))
    tarifaHoraEntrada = resultado.to<double>();
  else if (json.get(resultado, "fields/tarifaHoraEntrada/integerValue"))
    tarifaHoraEntrada = resultado.to<double>();

  if (!ativo) {
    desenharTelaResultado(RESULTADO_ERRO, "CADASTRO INATIVO", "Placa: " + placa, "Procure o balcao");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  // O motorista já disse o que veio fazer. Se o que ele pediu não bate com a
  // situação do veículo, explicamos em vez de fazer a operação oposta em
  // silêncio — abrir a catraca por engano é pior do que recusar.
  if (operacaoEscolhida == OP_ENTRADA && vagaAtual != 0) {
    desenharTelaResultado(RESULTADO_ALERTA, "ENTRADA JA REGISTRADA",
                          "Placa " + placa, "Use SAIDA para ir embora");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  if (operacaoEscolhida == OP_SAIDA && vagaAtual == 0) {
    desenharTelaResultado(RESULTADO_ALERTA, "SEM ENTRADA ABERTA",
                          "Placa " + placa, "Use ENTRADA ao chegar");
    resultadoDesde = millis();
    estadoAtual = TELA_RESULTADO;
    return;
  }

  if (vagaAtual == 0) {
    // ----- ENTRADA -----
    registrarEntrada(placa, caminho);

  } else {
    // ----- SAÍDA -----
    long agora = obterTimestampAtual();
    long duracaoSegundos = 0;
    if (horaEntrada > 0 && agora > horaEntrada) {
      duracaoSegundos = agora - horaEntrada;
    } else {
      Serial.println("[COBRANCA] Timestamp de entrada invalido - cobranca zerada por seguranca.");
    }
    // Registros antigos podem não ter a tarifa congelada. Nesse caso usa a
    // configuração atual como fallback, sem impedir a saída.
    if (tarifaHoraEntrada < 0.0) sincronizarConfiguracao();
    double tarifaAplicada = tarifaHoraEntrada >= 0.0
                               ? tarifaHoraEntrada
                               : tarifaPorHora;
    double valorCobrado = (duracaoSegundos / 3600.0) * tarifaAplicada;
    double novoSaldo = saldo - valorCobrado;

    FirebaseJson conteudo;
    conteudo.set("fields/vagaAtual/integerValue", String(0));
    conteudo.set("fields/horaEntrada/integerValue", String(0));
    conteudo.set("fields/estacionamentoId/stringValue", "");
    conteudo.set("fields/saldo/doubleValue", novoSaldo);
    conteudo.set("fields/tarifaHoraEntrada/doubleValue", 0.0);
    bool ok = Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", caminho.c_str(), conteudo.raw(), "vagaAtual,horaEntrada,estacionamentoId,saldo,tarifaHoraEntrada");

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
    historico.set("fields/tarifaHora/doubleValue", tarifaAplicada);
    historico.set("fields/estacionamentoId/stringValue", ESTACIONAMENTO_ID);
    if (!Firebase.Firestore.createDocument(&fbdo, PROJECT_ID, "", caminhoHistorico.c_str(), historico.raw())) {
      Serial.println("[FIRESTORE] Aviso: falha ao gravar historico (a saida ja foi liberada normalmente).");
    }

    abrirCatraca();
    char bufValor[16];
    snprintf(bufValor, sizeof(bufValor), "R$ %.2f", valorCobrado);
    int minutos = duracaoSegundos / 60;
    desenharTelaResultado(RESULTADO_SUCESSO, "ATE LOGO!", String(bufValor), String(minutos) + " min  ·  " + placa);
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
  Serial.print("Tarifa sincronizada: R$ ");
  Serial.println(tarifaPorHora, 2);
  Serial.print("Vagas livres (disponiveis para nova entrada): ");
  Serial.println(contarVagasLivres());
  for (int i = 0; i < vagasAtivas; i++) {
    Serial.print("  Vaga ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.println(obterEstadoVaga(i) ? "ocupada" : "livre");
  }
  Serial.println("=============================");
}
