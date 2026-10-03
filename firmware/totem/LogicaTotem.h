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
