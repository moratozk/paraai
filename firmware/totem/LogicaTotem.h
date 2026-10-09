#ifndef PARAAI_LOGICA_TOTEM_H
#define PARAAI_LOGICA_TOTEM_H
#include <cmath>
#include <cstdint>
#include <cstring>

// Regras puras: usadas pelo firmware e pelos testes nativos, sem Arduino,
// GPIO, rede ou dados globais. A capacidade acompanha o limite do painel.
namespace paraai {
constexpr int MAX_VAGAS = 200;
constexpr int64_t PRIMEIRO_TIMESTAMP_VALIDO = 1704067200LL;

inline bool placaValida(const char* placa) {
  if (!placa || std::strlen(placa) != 7) return false;
  for (int i = 0; i < 3; ++i) if (placa[i] < 'A' || placa[i] > 'Z') return false;
  if (placa[3] < '0' || placa[3] > '9') return false;
  if (!((placa[4] >= 'A' && placa[4] <= 'Z') || (placa[4] >= '0' && placa[4] <= '9'))) return false;
  return placa[5] >= '0' && placa[5] <= '9' && placa[6] >= '0' && placa[6] <= '9';
}
inline bool capacidadeValida(int quantidade) { return quantidade >= 1 && quantidade <= MAX_VAGAS; }
inline bool tarifaValida(double tarifa) { return std::isfinite(tarifa) && tarifa >= 0 && tarifa <= 10000; }

// PIN da manutenção local: de 4 a 8 dígitos, conferido também na compilação.
constexpr int PIN_MAX_DIGITOS = 8;
constexpr bool pinFormatoValido(const char* pin) {
  if (!pin) return false;
  int n = 0;
  for (; pin[n]; ++n)
    if (n >= PIN_MAX_DIGITOS || pin[n] < '0' || pin[n] > '9') return false;
  return n >= 4;
}
inline bool pinConfere(const char* digitado, const char* esperado) {
  return digitado && pinFormatoValido(esperado) && std::strcmp(digitado, esperado) == 0;
}

// Tipo de vaga, e também o direito que o motorista declara no veículo
// (campo "vagaEspecial"): COMUM no direito significa nenhum direito especial.
enum class TipoVaga : uint8_t { COMUM, PCD, IDOSO, GESTANTE };

// Estado de cada vaga para decidir onde o totem coloca o carro.
struct EstadoVaga {
  bool usada = false;                // há placa na vaga operacional
  TipoVaga tipo = TipoVaga::COMUM;   // pelo campo "tipo" ou pela tabela padrão
  uint32_t reservadaAte = 0;         // segundos Unix; a reserva vale enquanto for maior que agora
};

// Texto gravado no Firestore -> tipo. Falso para ausente (nullptr) ou desconhecido.
inline bool lerTipoVaga(const char* texto, TipoVaga& tipo) {
  if (!texto) return false;
  if (std::strcmp(texto, "comum") == 0) tipo = TipoVaga::COMUM;
  else if (std::strcmp(texto, "pcd") == 0) tipo = TipoVaga::PCD;
  else if (std::strcmp(texto, "idoso") == 0) tipo = TipoVaga::IDOSO;
  else if (std::strcmp(texto, "gestante") == 0) tipo = TipoVaga::GESTANTE;
  else return false;
  return true;
}

// Tipo da vaga com a mesma regra do site (obterTipoVaga em
// web/src/utils/mapaVagas.js) e das regras do Firestore (tipoDaVaga): vale o
// campo "tipo" quando é um dos quatro conhecidos; sem ele, a tabela da
// demonstração FATEC (VAGAS_ESPECIAIS). As três precisam mudar juntas, senão o
// site mostra uma vaga como PCD e o totem a entrega como comum.
inline TipoVaga tipoVagaPorPadrao(int numero) {
  if (numero == 1 || numero == 2) return TipoVaga::PCD;
  if (numero == 9 || numero == 11) return TipoVaga::IDOSO;
  if (numero == 10) return TipoVaga::GESTANTE;
  return TipoVaga::COMUM;
}
// texto nullptr = documento sem o campo "tipo".
inline TipoVaga tipoDaVaga(const char* texto, int numero) {
  TipoVaga tipo;
  return lerTipoVaga(texto, tipo) ? tipo : tipoVagaPorPadrao(numero);
}
// Direito declarado pelo motorista; ausente, vazio ou desconhecido = nenhum.
inline TipoVaga direitoDeclarado(const char* texto) {
  TipoVaga tipo;
  return lerTipoVaga(texto, tipo) ? tipo : TipoVaga::COMUM;
}

// Modelo e cor que o dono informa no site, com a mesma regra de
// firebase/firestore.rules (nomeDeVeiculoValido) e web/src/utils/veiculo.js:
// nome de 1 a 20 caracteres, começando por letra ou número, só com letras sem
// acento, números, espaço, ponto, hífen e "!"; cor da tabela do RENAVAM.
// Tudo cabe na fonte do totem (0x20..0x7A).
constexpr int NOME_VEICULO_MAX = 20;
inline bool letraOuNumero(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}
inline bool nomeVeiculoValido(const char* nome) {
  if (!nome || !letraOuNumero(nome[0])) return false;
  for (int n = 0; nome[n]; ++n) {
    const char c = nome[n];
    if (n >= NOME_VEICULO_MAX || !(letraOuNumero(c) || c == ' ' || c == '.' || c == '-' || c == '!'))
      return false;
  }
  return true;
}
inline bool corVeiculoValida(const char* cor) {
  static const char* const CORES[] = {"branco", "preto", "prata", "cinza", "vermelho", "azul", "verde",
                                      "marrom", "bege", "amarelo", "dourado", "laranja", "vinho", "rosa", "roxo"};
  if (!cor) return false;
  for (const char* conhecida : CORES)
    if (std::strcmp(cor, conhecida) == 0) return true;
  return false;
}
// Vazio = não informado. Um campo fora do formato invalida os dois: o totem
// então não mostra nem copia nada, e a vaga continua aceita pelas regras.
inline bool descricaoVeiculoValida(const char* modelo, const char* cor) {
  return (!modelo || !*modelo || nomeVeiculoValido(modelo)) && (!cor || !*cor || corVeiculoValida(cor));
}

// Vaga da entrada: a reservada pelo dono da placa, se ainda livre; senão, para
// quem declarou direito, a primeira vaga livre do tipo dele; senão (ou se não
// houver), a primeira vaga comum livre. Vaga reservada por outra pessoa e
// valendo nunca é usada, e quem não declarou direito nunca recebe vaga
// especial. Retorna 0 quando não há vaga.
inline int escolherVaga(const EstadoVaga* vagas, int capacidade, int reservada, int64_t agora,
                        TipoVaga direito = TipoVaga::COMUM) {
  if (!vagas || capacidade < 1) return 0;
  if (capacidade > MAX_VAGAS) capacidade = MAX_VAGAS;
  if (reservada >= 1 && reservada <= capacidade && !vagas[reservada].usada) return reservada;
  if (direito != TipoVaga::COMUM)
    for (int n = 1; n <= capacidade; ++n)
      if (!vagas[n].usada && vagas[n].tipo == direito && vagas[n].reservadaAte <= agora) return n;
  for (int n = 1; n <= capacidade; ++n)
    if (!vagas[n].usada && vagas[n].tipo == TipoVaga::COMUM && vagas[n].reservadaAte <= agora) return n;
  return 0;
}

// Vagas livres na vitrine: sem placa e sem reserva valendo.
inline int contarLivres(const EstadoVaga* vagas, int capacidade, int64_t agora) {
  if (!vagas || capacidade < 1) return 0;
  if (capacidade > MAX_VAGAS) capacidade = MAX_VAGAS;
  int livres = 0;
  for (int n = 1; n <= capacidade; ++n)
    if (!vagas[n].usada && vagas[n].reservadaAte <= agora) ++livres;
  return livres;
}

// --- Wi-Fi configurado na própria tela do totem ---------------------------
// WPA2/WPA3 pessoal: SSID de 1 a 32 bytes; senha de 8 a 63 caracteres ASCII
// imprimíveis (o teclado da tela só gera esses caracteres).
constexpr int WIFI_SSID_MAX = 32;
constexpr int WIFI_SENHA_MIN = 8;
constexpr int WIFI_SENHA_MAX = 63;
inline bool caractereDigitavelWifi(char c) {
  const unsigned char u = static_cast<unsigned char>(c);
  return u >= 0x20 && u <= 0x7E;
}
inline bool textoDigitadoValido(const char* texto, int minimo, int maximo) {
  if (!texto) return false;
  int n = 0;
  for (; texto[n]; ++n)
    if (n >= maximo || !caractereDigitavelWifi(texto[n])) return false;
  return n >= minimo;
}
inline bool senhaWifiValida(const char* senha) {
  return textoDigitadoValido(senha, WIFI_SENHA_MIN, WIFI_SENHA_MAX);
}

// Motivo da desconexão (wifi_err_reason_t do ESP-IDF; ConfiguracaoWiFi.ino
// confere estes números na compilação) traduzido no que o operador pode fazer.
enum class FalhaWifi : uint8_t { NENHUMA, SENHA, SEM_REDE, OUTRA };
inline FalhaWifi classificarFalhaWifi(uint8_t motivo) {
  switch (motivo) {
    case 0:    // nenhum motivo registrado
    case 8:    // ASSOC_LEAVE: a própria troca desligou a rede anterior
      return FalhaWifi::NENHUMA;
    case 14:   // MIC_FAILURE
    case 15:   // 4WAY_HANDSHAKE_TIMEOUT: o roteador não aceitou a chave
    case 202:  // AUTH_FAIL
    case 204:  // HANDSHAKE_TIMEOUT
      return FalhaWifi::SENHA;
    case 201:  // NO_AP_FOUND
    case 210:  // NO_AP_FOUND_W_COMPATIBLE_SECURITY
    case 211:  // NO_AP_FOUND_IN_AUTHMODE_THRESHOLD
    case 212:  // NO_AP_FOUND_IN_RSSI_THRESHOLD
      return FalhaWifi::SEM_REDE;
    default:
      return FalhaWifi::OUTRA;
  }
}

// Mesmos limites do ícone do cabeçalho: 4 barras a partir de -60 dBm.
inline int barrasSinalWifi(int32_t rssi) {
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

// As fontes do totem só têm ASCII. O nome da rede é exibido sem acento
// ("Família" vira "Familia") e o que não tiver equivalente vira '?'. Serve só
// para mostrar: a conexão usa sempre os bytes originais do SSID.
inline size_t textoWifiExibivel(const char* origem, char* destino, size_t capacidade) {
  if (!destino || capacidade == 0) return 0;
  // U+00C0..U+00FF (UTF-8 0xC3 0x80..0xBF), na ordem da tabela Unicode.
  static const char LATIN1[] =
      "AAAAAAACEEEEIIIIDNOOOOOxOUUUUY?s"
      "aaaaaaaceeeeiiiidnooooo?ouuuuy?y";
  size_t n = 0;
  const unsigned char* p = reinterpret_cast<const unsigned char*>(origem ? origem : "");
  while (*p && n + 1 < capacidade) {
    const unsigned char c = *p;
    if (c >= 0x20 && c <= 0x7E) { destino[n++] = static_cast<char>(c); ++p; continue; }
    const int continuacoes = (c & 0xE0) == 0xC0 ? 1 : (c & 0xF0) == 0xE0 ? 2 : (c & 0xF8) == 0xF0 ? 3 : 0;
    int lidos = 0;
    while (lidos < continuacoes && (p[1 + lidos] & 0xC0) == 0x80) ++lidos;
    if (continuacoes > 0 && lidos == continuacoes) {
      destino[n++] = c == 0xC3 ? LATIN1[p[1] - 0x80] : '?';
      p += 1 + continuacoes;
    } else {
      destino[n++] = '?';  // byte solto ou sequência incompleta
      ++p;
    }
  }
  destino[n] = '\0';
  return n;
}

// Meio centavo absorve resíduo de ponto flutuante de recargas e débitos.
// O mesmo limite está em firestore.rules (entrada com saldo pendente).
constexpr double TOLERANCIA_SALDO = 0.005;
inline bool entradaPermitida(double saldo) {
  return std::isfinite(saldo) && saldo > -TOLERANCIA_SALDO;
}

// pendente: parte desta cobrança que o saldo não cobriu. Sem catraca, a saída
// sempre é registrada; a dívida fica visível no app e bloqueia nova entrada.
struct Cobranca { int64_t segundos = 0; double valor = 0; double saldoFinal = 0; double pendente = 0; };
inline bool calcularCobranca(int64_t entrada, int64_t saida, double tarifa,
                            double saldo, Cobranca& resultado) {
  resultado = {};
  if (entrada < PRIMEIRO_TIMESTAMP_VALIDO || saida < entrada ||
      !tarifaValida(tarifa) || !std::isfinite(saldo)) return false;
  resultado.segundos = saida - entrada;
  resultado.valor = std::round(resultado.segundos / 3600.0 * tarifa * 100.0) / 100.0;
  resultado.saldoFinal = saldo - resultado.valor; // Não arredondar créditos legados.
  // Mesma fórmula de historicoCorrespondeAEstadia em firestore.rules.
  resultado.pendente = resultado.saldoFinal >= 0 ? 0
    : resultado.saldoFinal + resultado.valor <= 0 ? resultado.valor : -resultado.saldoFinal;
  return std::isfinite(resultado.valor) && std::isfinite(resultado.saldoFinal);
}
} // namespace paraai
#endif
