#ifndef PARAAI_CONFIGURACAO_WIFI_H
#define PARAAI_CONFIGURACAO_WIFI_H

// =========================================================================
// ParaAi - configuracao local de Wi-Fi
// -------------------------------------------------------------------------
// Mantem somente SSID e senha da rede local na NVS. As credenciais do
// Firebase continuam exclusivamente no Credenciais.h e nunca passam pelo
// portal de configuracao.
// =========================================================================

#include <Arduino.h>
#include <stddef.h>
#include <string.h>
#include <WiFi.h>
#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <esp_system.h>

enum ResultadoConfiguracaoWifi {
  WIFI_CONFIG_SUCESSO,
  WIFI_CONFIG_CANCELADA,
  WIFI_CONFIG_EXPIRADA
};

// Interface implementada em DisplayUI.ino. As declaracoes locais deixam o
// modulo compilavel mesmo quando a ordem dos .ino mudar na Arduino IDE.
void desenharTelaPortalWifi(String ap, String senha, String ip, String mensagem);
void desenharTelaTestandoWifi(String ssid);
bool verificarToqueCancelarPortalWifi();

namespace ParaAiWifiConfig {

const char* NAMESPACE_NVS = "paraai-net";
const char* CHAVE_REDE_NVS = "rede";
const uint32_t MAGIC_REDE = 0x50415746UL;  // "PAWF"
const uint32_t VERSAO_REDE = 1;

const unsigned long TIMEOUT_TESTE_MS = 15000;
const unsigned long TIMEOUT_PORTAL_MS = 10UL * 60UL * 1000UL;
const uint8_t MAX_REDES_PORTAL = 12;

// Um unico blob evita deixar SSID e senha de gravacoes diferentes caso falte
// energia entre duas operacoes na NVS. O checksum detecta dados incompletos ou
// de uma versao incompatível.
struct DadosWifiPersistidos {
  uint32_t magic;
  uint32_t versao;
  char ssid[33];   // limite 802.11: 32 bytes + terminador
  char senha[64];  // WPA2: ate 63 bytes + terminador
  uint32_t checksum;
};

struct RedePortal {
  String ssid;
  int32_t rssi;
};

String ssidConfigurado;
String senhaConfigurada;
bool configuracaoCarregada = false;

uint32_t calcularChecksum(const DadosWifiPersistidos& dados) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&dados);
  const size_t tamanho = offsetof(DadosWifiPersistidos, checksum);
  uint32_t hash = 2166136261UL;  // FNV-1a de 32 bits (integridade, nao cifra)
  for (size_t i = 0; i < tamanho; i++) {
    hash ^= bytes[i];
    hash *= 16777619UL;
  }
  return hash;
}

size_t comprimentoLimitado(const char* texto, size_t capacidade) {
  for (size_t i = 0; i < capacidade; i++) {
    if (texto[i] == '\0') return i;
  }
  return capacidade;
}

bool credencialValida(const String& ssid, const String& senha) {
  return ssid.length() >= 1 && ssid.length() <= 32
      && senha.length() >= 8 && senha.length() <= 63;
}

bool blobValido(const DadosWifiPersistidos& dados) {
  if (dados.magic != MAGIC_REDE || dados.versao != VERSAO_REDE) return false;
  if (dados.checksum != calcularChecksum(dados)) return false;

  size_t tamanhoSsid = comprimentoLimitado(dados.ssid, sizeof(dados.ssid));
  size_t tamanhoSenha = comprimentoLimitado(dados.senha, sizeof(dados.senha));
  if (tamanhoSsid == sizeof(dados.ssid) || tamanhoSenha == sizeof(dados.senha)) return false;

  return tamanhoSsid >= 1 && tamanhoSsid <= 32
      && tamanhoSenha >= 8 && tamanhoSenha <= 63;
}

bool lerBlob(DadosWifiPersistidos& dados) {
  Preferences preferencias;
  if (!preferencias.begin(NAMESPACE_NVS, true)) return false;

  bool ok = preferencias.getBytesLength(CHAVE_REDE_NVS) == sizeof(dados)
         && preferencias.getBytes(CHAVE_REDE_NVS, &dados, sizeof(dados)) == sizeof(dados)
         && blobValido(dados);
  preferencias.end();
  return ok;
}

bool salvarBlob(const String& ssid, const String& senha) {
  if (!credencialValida(ssid, senha)) return false;

  DadosWifiPersistidos dados = {};
  dados.magic = MAGIC_REDE;
  dados.versao = VERSAO_REDE;
  memcpy(dados.ssid, ssid.c_str(), ssid.length());
  memcpy(dados.senha, senha.c_str(), senha.length());
  dados.checksum = calcularChecksum(dados);

  Preferences preferencias;
  if (!preferencias.begin(NAMESPACE_NVS, false)) return false;
  bool gravou = preferencias.putBytes(CHAVE_REDE_NVS, &dados, sizeof(dados)) == sizeof(dados);
  preferencias.end();
  if (!gravou) return false;

  // Le a gravacao de volta antes de considera-la ativa.
  DadosWifiPersistidos verificacao = {};
  return lerBlob(verificacao)
      && String(verificacao.ssid) == ssid
      && String(verificacao.senha) == senha;
}

String escaparHtml(const String& valor) {
  String escapado;
  escapado.reserve(valor.length() + 12);
  for (size_t i = 0; i < valor.length(); i++) {
    switch (valor[i]) {
      case '&':  escapado += F("&amp;");  break;
      case '<':  escapado += F("&lt;");   break;
      case '>':  escapado += F("&gt;");   break;
      case '"': escapado += F("&quot;"); break;
      case '\'': escapado += F("&#39;"); break;
      default:   escapado += valor[i];    break;
    }
  }
  return escapado;
}

const char* rotuloSinal(int32_t rssi) {
  if (rssi >= -60) return "excelente";
  if (rssi >= -70) return "bom";
  if (rssi >= -80) return "regular";
  return "fraco";
}

uint8_t buscarRedes(RedePortal* redes, uint8_t capacidade) {
  int16_t total = WiFi.scanNetworks(false, false, false, 120);
  if (total <= 0) {
    WiFi.scanDelete();
    return 0;
  }

  uint8_t quantidade = 0;
  for (int16_t i = 0; i < total; i++) {
    // O totem nao aceita rede aberta: o provisionamento transporta a senha
    // por HTTP local e depende da camada WPA2 do proprio ponto de acesso.
    wifi_auth_mode_t protecao = WiFi.encryptionType(i);
    if (protecao != WIFI_AUTH_WPA2_PSK && protecao != WIFI_AUTH_WPA_WPA2_PSK &&
        protecao != WIFI_AUTH_WPA3_PSK && protecao != WIFI_AUTH_WPA2_WPA3_PSK) continue;

    String ssid = WiFi.SSID(i);
    if (ssid.length() < 1 || ssid.length() > 32) continue;
    int32_t rssi = WiFi.RSSI(i);

    int indiceExistente = -1;
    for (uint8_t j = 0; j < quantidade; j++) {
      if (redes[j].ssid == ssid) {
        indiceExistente = j;
        break;
      }
    }

    if (indiceExistente >= 0) {
      if (rssi > redes[indiceExistente].rssi) redes[indiceExistente].rssi = rssi;
      continue;
    }

    if (quantidade < capacidade) {
      redes[quantidade].ssid = ssid;
      redes[quantidade].rssi = rssi;
      quantidade++;
      continue;
    }

    uint8_t maisFraca = 0;
    for (uint8_t j = 1; j < quantidade; j++) {
      if (redes[j].rssi < redes[maisFraca].rssi) maisFraca = j;
    }
    if (rssi > redes[maisFraca].rssi) {
      redes[maisFraca].ssid = ssid;
      redes[maisFraca].rssi = rssi;
    }
  }
  WiFi.scanDelete();

  // Ordena do sinal mais forte para o mais fraco.
  for (uint8_t i = 1; i < quantidade; i++) {
    RedePortal atual = redes[i];
    int j = i - 1;
    while (j >= 0 && redes[j].rssi < atual.rssi) {
      redes[j + 1] = redes[j];
      j--;
    }
    redes[j + 1] = atual;
  }
  return quantidade;
}

String gerarCodigoAleatorio(size_t tamanho) {
  static const char ALFABETO[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const size_t totalCaracteres = sizeof(ALFABETO) - 1;
  String codigo;
  codigo.reserve(tamanho);
  for (size_t i = 0; i < tamanho; i++) {
    codigo += ALFABETO[esp_random() % totalCaracteres];
  }
  return codigo;
}

String gerarNomePontoAcesso() {
  uint32_t sufixo = static_cast<uint32_t>(ESP.getEfuseMac() & 0xFFFFFFULL);
  char texto[7];
  snprintf(texto, sizeof(texto), "%06lX", static_cast<unsigned long>(sufixo));
  return String("ParaAi-") + texto;
}

void adicionarCabecalhosSeguros(WebServer& servidor) {
  servidor.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  servidor.sendHeader("Pragma", "no-cache");
  servidor.sendHeader("X-Content-Type-Options", "nosniff");
  servidor.sendHeader("Referrer-Policy", "no-referrer");
  servidor.sendHeader("Content-Security-Policy",
                       "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
}

String gerarPaginaPortal(const RedePortal* redes, uint8_t quantidade,
                         const String& mensagem, bool permitirCancelar,
                         const String& token) {
  String pagina;
  pagina.reserve(7600);
  pagina += F(
    "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>Configurar Wi-Fi | ParaAi</title><style>"
    ":root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif}"
    "*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#151513;color:#f4efe4;"
    "display:grid;place-items:center;padding:22px}main{width:min(100%,520px);background:#24231f;"
    "border:1px solid #4a463b;border-radius:20px;padding:24px;box-shadow:0 18px 55px #0008}"
    ".marca{display:flex;align-items:center;gap:10px;color:#f4b942;font-weight:800;letter-spacing:.08em}"
    ".selo{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#f4b942;"
    "color:#171612;font-weight:900}h1{font-size:clamp(1.55rem,7vw,2.2rem);line-height:1.05;margin:24px 0 10px}"
    "p{color:#c7c0b2;line-height:1.5}.aviso{padding:12px 14px;border-left:4px solid #f4b942;"
    "background:#302d25;border-radius:8px;color:#f4efe4}label{display:block;margin:18px 0 7px;font-weight:700}"
    "select,input{width:100%;min-height:48px;border:1px solid #5a5549;border-radius:10px;background:#191815;"
    "color:#fff;padding:11px 12px;font:inherit;outline:none}select:focus,input:focus{border-color:#f4b942;"
    "box-shadow:0 0 0 3px #f4b9422c}.dica{font-size:.87rem;margin:7px 0 0;color:#aaa294}"
    "button{width:100%;min-height:50px;margin-top:22px;border:0;border-radius:11px;background:#f4b942;"
    "color:#171612;font:800 1rem inherit;cursor:pointer}.secundario{background:transparent;color:#d5cec1;"
    "border:1px solid #5a5549;margin-top:10px}footer{font-size:.78rem;color:#8f887b;margin-top:22px;text-align:center}"
    "</style></head><body><main><div class=\"marca\"><span class=\"selo\">P</span>PARAAI</div>"
    "<h1>Conectar o totem</h1><p>Escolha uma rede protegida de 2,4 GHz. A nova senha so sera salva depois que a conexao for testada.</p>");

  if (mensagem.length() > 0) {
    pagina += F("<p class=\"aviso\">");
    pagina += escaparHtml(mensagem);
    pagina += F("</p>");
  }

  pagina += F("<form method=\"post\" action=\"/salvar\" autocomplete=\"off\">"
              "<input type=\"hidden\" name=\"token\" value=\"");
  pagina += escaparHtml(token);
  pagina += F("\"><label for=\"rede\">Redes encontradas</label><select id=\"rede\" name=\"rede\">"
              "<option value=\"\">Selecione uma rede</option>");

  for (uint8_t i = 0; i < quantidade; i++) {
    String ssidSeguro = escaparHtml(redes[i].ssid);
    pagina += F("<option value=\"");
    pagina += ssidSeguro;
    pagina += F("\">");
    pagina += ssidSeguro;
    pagina += F(" — sinal ");
    pagina += rotuloSinal(redes[i].rssi);
    pagina += F("</option>");
  }

  pagina += F(
    "</select><p class=\"dica\">Redes abertas nao sao exibidas por seguranca.</p>"
    "<label for=\"ssid\">Outra rede ou rede oculta</label>"
    "<input id=\"ssid\" name=\"ssid\" maxlength=\"32\" placeholder=\"Nome exato da rede\">"
    "<label for=\"senha\">Senha da rede</label>"
    "<input id=\"senha\" name=\"senha\" type=\"password\" minlength=\"8\" maxlength=\"63\" required "
    "autocomplete=\"new-password\" placeholder=\"8 a 63 caracteres\">"
    "<button type=\"submit\">Testar e salvar</button></form>");

  if (permitirCancelar) {
    pagina += F("<form method=\"post\" action=\"/cancelar\"><input type=\"hidden\" name=\"token\" value=\"");
    pagina += escaparHtml(token);
    pagina += F("\"><button class=\"secundario\" type=\"submit\">Cancelar configuracao</button></form>");
  }

  pagina += F("<footer>As credenciais do sistema nao sao exibidas nem alteradas aqui.</footer>"
              "</main></body></html>");
  return pagina;
}

String gerarPaginaStatus(const String& titulo, const String& mensagem) {
  String pagina;
  pagina.reserve(1700);
  pagina += F(
    "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>ParaAi</title><style>"
    ":root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif}"
    "body{margin:0;min-height:100vh;background:#151513;color:#f4efe4;display:grid;place-items:center;padding:22px}"
    "main{width:min(100%,480px);background:#24231f;border:1px solid #4a463b;border-radius:20px;padding:26px}"
    "b{color:#f4b942;letter-spacing:.08em}h1{font-size:2rem;line-height:1.08;margin:28px 0 10px}"
    "p{color:#c7c0b2;line-height:1.5}</style></head><body><main><b>PARAAI</b><h1>");
  pagina += escaparHtml(titulo);
  pagina += F("</h1><p>");
  pagina += escaparHtml(mensagem);
  pagina += F("</p></main></body></html>");
  return pagina;
}

void iniciarConexaoBruta(const String& ssid, const String& senha) {
  WiFi.disconnect(false, false);
  delay(80);
  if (ssid.length() > 0) WiFi.begin(ssid.c_str(), senha.c_str());
}

enum ResultadoTesteInterno {
  TESTE_CONECTOU,
  TESTE_FALHOU,
  TESTE_CANCELADO,
  TESTE_EXPIROU
};

ResultadoTesteInterno aguardarTeste(unsigned long inicioPortal, bool permitirCancelar) {
  unsigned long inicioTeste = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (permitirCancelar && verificarToqueCancelarPortalWifi()) return TESTE_CANCELADO;
    if (millis() - inicioPortal >= TIMEOUT_PORTAL_MS) return TESTE_EXPIROU;
    if (millis() - inicioTeste >= TIMEOUT_TESTE_MS) return TESTE_FALHOU;
    delay(40);
  }
  return TESTE_CONECTOU;
}

}  // namespace ParaAiWifiConfig

void carregarConfiguracaoWifi() {
  using namespace ParaAiWifiConfig;

  // O core 3.3.10 usa persistencia interna por padrao. Desativamos antes da
  // primeira inicializacao do radio para que exista uma unica fonte de dados.
  WiFi.persistent(false);

  ssidConfigurado = String(WIFI_SSID);
  senhaConfigurada = String(WIFI_PASSWORD);

  DadosWifiPersistidos dados = {};
  if (lerBlob(dados)) {
    ssidConfigurado = String(dados.ssid);
    senhaConfigurada = String(dados.senha);
    Serial.println("[WIFI] Configuracao local carregada da memoria protegida por checksum.");
  } else {
    Serial.println("[WIFI] Usando a rede de instalacao definida no firmware.");
  }
  configuracaoCarregada = true;
}

bool conectarWifiConfigurado(unsigned long timeoutMs) {
  using namespace ParaAiWifiConfig;
  if (!configuracaoCarregada) carregarConfiguracaoWifi();
  if (ssidConfigurado.length() < 1 || ssidConfigurado.length() > 32) return false;

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.begin(ssidConfigurado.c_str(), senhaConfigurada.c_str());

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - inicio >= timeoutMs) {
      WiFi.disconnect(false, false);
      return false;
    }
    delay(100);
  }
  return true;
}

void iniciarReconexaoWifiConfigurado() {
  using namespace ParaAiWifiConfig;
  if (!configuracaoCarregada) carregarConfiguracaoWifi();
  if (ssidConfigurado.length() < 1 || ssidConfigurado.length() > 32) return;

  WiFi.disconnect(false, false);
  WiFi.begin(ssidConfigurado.c_str(), senhaConfigurada.c_str());
}

String obterSsidWifiConfigurado() {
  using namespace ParaAiWifiConfig;
  if (!configuracaoCarregada) carregarConfiguracaoWifi();
  return ssidConfigurado;
}

ResultadoConfiguracaoWifi executarPortalConfiguracaoWifi(bool permitirCancelar) {
  using namespace ParaAiWifiConfig;
  if (!configuracaoCarregada) carregarConfiguracaoWifi();

  const String ssidAnterior = ssidConfigurado;
  const String senhaAnterior = senhaConfigurada;
  const String nomeAp = gerarNomePontoAcesso();
  const String senhaAp = gerarCodigoAleatorio(12);
  const String tokenFormulario = gerarCodigoAleatorio(24);
  const IPAddress ipAp(192, 168, 4, 1);
  const IPAddress mascara(255, 255, 255, 0);

  WiFi.mode(WIFI_AP_STA);
  bool apConfigurado = WiFi.softAPConfig(ipAp, ipAp, mascara)
                   && WiFi.softAP(nomeAp.c_str(), senhaAp.c_str(), 1, 0, 2);
  if (!apConfigurado) {
    WiFi.softAPdisconnect(false);
    WiFi.mode(WIFI_STA);
    if (WiFi.status() != WL_CONNECTED) iniciarReconexaoWifiConfigurado();
    return WIFI_CONFIG_EXPIRADA;
  }

  // Faz Android/Windows/iOS reconhecerem a rede como portal cativo. Esta API
  // faz parte do core ESP32 3.3.10 usado pelo projeto.
  WiFi.AP.enableDhcpCaptivePortal();

  desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), "Procurando redes 2,4 GHz...");
  RedePortal redes[MAX_REDES_PORTAL];
  uint8_t quantidadeRedes = buscarRedes(redes, MAX_REDES_PORTAL);
  String mensagemPortal = quantidadeRedes > 0
    ? "Escolha a rede no celular e informe a senha."
    : "Nenhuma rede protegida apareceu. Digite o nome exato da rede oculta.";
  desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), mensagemPortal);

  DNSServer servidorDns;
  WebServer servidorWeb(80);
  servidorDns.start();  // catch-all assincrono no core 3.3.10

  bool finalizar = false;
  ResultadoConfiguracaoWifi resultado = WIFI_CONFIG_EXPIRADA;
  const unsigned long inicioPortal = millis();

  // O servidor escuta em ambas as interfaces do ESP. Somente a conexão feita
  // no AP temporário pode acessar formulário/token ou mudar a rede.
  auto acessoPeloAp = [&]() -> bool {
    if (servidorWeb.client().localIP() == WiFi.softAPIP()) return true;
    adicionarCabecalhosSeguros(servidorWeb);
    servidorWeb.send(403, "text/plain; charset=utf-8", "Conecte-se a rede temporaria exibida no totem.");
    return false;
  };

  servidorWeb.on("/", HTTP_GET, [&]() {
    if (!acessoPeloAp()) return;
    adicionarCabecalhosSeguros(servidorWeb);
    servidorWeb.send(200, "text/html; charset=utf-8",
                     gerarPaginaPortal(redes, quantidadeRedes, mensagemPortal,
                                       permitirCancelar, tokenFormulario));
  });

  servidorWeb.on("/salvar", HTTP_POST, [&]() {
    if (!acessoPeloAp()) return;
    if (!servidorWeb.hasArg("token") || servidorWeb.arg("token") != tokenFormulario) {
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(403, "text/plain; charset=utf-8", "Solicitacao invalida.");
      return;
    }

    String novaSsid = servidorWeb.arg("ssid");
    if (novaSsid.length() == 0) novaSsid = servidorWeb.arg("rede");
    String novaSenha = servidorWeb.arg("senha");

    if (!credencialValida(novaSsid, novaSenha)) {
      mensagemPortal = "Confira o nome da rede e use uma senha WPA2 de 8 a 63 caracteres.";
      desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), mensagemPortal);
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(400, "text/html; charset=utf-8",
                       gerarPaginaPortal(redes, quantidadeRedes, mensagemPortal,
                                         permitirCancelar, tokenFormulario));
      novaSenha = "";
      return;
    }

    desenharTelaTestandoWifi(novaSsid);
    iniciarConexaoBruta(novaSsid, novaSenha);
    ResultadoTesteInterno teste = aguardarTeste(inicioPortal, permitirCancelar);

    if (teste == TESTE_CANCELADO || teste == TESTE_EXPIROU) {
      iniciarConexaoBruta(ssidAnterior, senhaAnterior);
      resultado = teste == TESTE_CANCELADO ? WIFI_CONFIG_CANCELADA : WIFI_CONFIG_EXPIRADA;
      finalizar = true;
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(200, "text/html; charset=utf-8",
                       gerarPaginaStatus("Configuracao encerrada",
                                         "A rede anterior foi preservada."));
      novaSenha = "";
      return;
    }

    if (teste != TESTE_CONECTOU) {
      iniciarConexaoBruta(ssidAnterior, senhaAnterior);
      mensagemPortal = "Nao foi possivel conectar. Confira a senha e tente novamente.";
      desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), mensagemPortal);
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(422, "text/html; charset=utf-8",
                       gerarPaginaPortal(redes, quantidadeRedes, mensagemPortal,
                                         permitirCancelar, tokenFormulario));
      novaSenha = "";
      return;
    }

    if (!salvarBlob(novaSsid, novaSenha)) {
      iniciarConexaoBruta(ssidAnterior, senhaAnterior);
      mensagemPortal = "A gravacao nao foi confirmada. Reconectando a rede anterior nesta sessao; confira apos reiniciar.";
      desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), mensagemPortal);
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(500, "text/html; charset=utf-8",
                       gerarPaginaPortal(redes, quantidadeRedes, mensagemPortal,
                                         permitirCancelar, tokenFormulario));
      novaSenha = "";
      return;
    }

    ssidConfigurado = novaSsid;
    senhaConfigurada = novaSenha;
    configuracaoCarregada = true;
    resultado = WIFI_CONFIG_SUCESSO;
    finalizar = true;
    desenharTelaPortalWifi(nomeAp, senhaAp, WiFi.softAPIP().toString(), "Rede testada e salva com sucesso.");
    adicionarCabecalhosSeguros(servidorWeb);
    servidorWeb.send(200, "text/html; charset=utf-8",
                     gerarPaginaStatus("Wi-Fi configurado",
                                       "A nova rede foi testada e salva. Voce ja pode fechar esta pagina."));
    novaSenha = "";
  });

  servidorWeb.on("/cancelar", HTTP_POST, [&]() {
    if (!acessoPeloAp()) return;
    if (!permitirCancelar) {
      servidorWeb.send(404, "text/plain", "");
      return;
    }
    if (!servidorWeb.hasArg("token") || servidorWeb.arg("token") != tokenFormulario) {
      adicionarCabecalhosSeguros(servidorWeb);
      servidorWeb.send(403, "text/plain; charset=utf-8", "Solicitacao invalida.");
      return;
    }
    resultado = WIFI_CONFIG_CANCELADA;
    finalizar = true;
    adicionarCabecalhosSeguros(servidorWeb);
    servidorWeb.send(200, "text/html; charset=utf-8",
                     gerarPaginaStatus("Configuracao cancelada",
                                       "Nenhuma credencial foi alterada."));
  });

  servidorWeb.onNotFound([&]() {
    if (!acessoPeloAp()) return;
    adicionarCabecalhosSeguros(servidorWeb);
    servidorWeb.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
    servidorWeb.send(302, "text/plain", "");
  });

  servidorWeb.begin();
  while (!finalizar && millis() - inicioPortal < TIMEOUT_PORTAL_MS) {
    servidorWeb.handleClient();
    if (permitirCancelar && verificarToqueCancelarPortalWifi()) {
      resultado = WIFI_CONFIG_CANCELADA;
      finalizar = true;
    }
    delay(5);
  }

  if (!finalizar) resultado = WIFI_CONFIG_EXPIRADA;

  delay(250); // Dá tempo ao cliente de receber a resposta antes de fechar o AP.
  servidorWeb.stop();
  servidorDns.stop();
  WiFi.softAPdisconnect(false);
  WiFi.mode(WIFI_STA);

  // Cancelamento, expiracao e falhas preservam o blob anterior. Se o radio
  // nao voltou sozinho, inicia explicitamente a reconexao com ele.
  if (resultado != WIFI_CONFIG_SUCESSO && WiFi.status() != WL_CONNECTED) {
    iniciarReconexaoWifiConfigurado();
  }

  return resultado;
}

#endif  // PARAAI_CONFIGURACAO_WIFI_H
