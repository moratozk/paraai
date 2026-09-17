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

struct Cobranca { int64_t segundos = 0; double valor = 0; double saldoFinal = 0; };
inline bool calcularCobranca(int64_t entrada, int64_t saida, double tarifa,
                            double saldo, Cobranca& resultado) {
  resultado = {};
  if (entrada < PRIMEIRO_TIMESTAMP_VALIDO || saida < entrada ||
      !tarifaValida(tarifa) || !std::isfinite(saldo)) return false;
  resultado.segundos = saida - entrada;
  resultado.valor = std::round(resultado.segundos / 3600.0 * tarifa * 100.0) / 100.0;
  resultado.saldoFinal = saldo - resultado.valor; // Não arredondar créditos legados.
  return std::isfinite(resultado.valor) && std::isfinite(resultado.saldoFinal);
}
} // namespace paraai
#endif
