#include "../LogicaTotem.h"
#include <cassert>
#include <cstdio>
#include <limits>
#include <initializer_list>

int main() {
  using namespace paraai;
  for (const char* placa : {"ABC1234", "ABC1D23", "ZZZ9Z99", "AAA0000"}) assert(placaValida(placa));
  for (const char* placa : {"", "ABC123", "ABC12345", "abc1234", "ABC-1234", "123ABCD",
                            "AB11D23", "ABCA123", "ABC1DD3", "ABC1D2X", "ABC1_23", " ABC1234"})
    assert(!placaValida(placa));
  assert(!placaValida(nullptr));
  assert(capacidadeValida(1) && capacidadeValida(200));
  assert(!capacidadeValida(-1) && !capacidadeValida(0) && !capacidadeValida(201));
  assert(tarifaValida(0) && tarifaValida(8.5) && tarifaValida(10000));
  assert(!tarifaValida(-0.01) && !tarifaValida(10000.01));
  assert(!tarifaValida(NAN) && !tarifaValida(INFINITY));

  constexpr int64_t entrada = 1788800000;
  Cobranca c;
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 100, c));
  assert(c.segundos == 3600 && c.valor == 8.5 && c.saldoFinal == 91.5);
  assert(calcularCobranca(entrada, entrada + 1800, 8.5, 100, c));
  assert(c.valor == 4.25 && c.saldoFinal == 95.75);
  assert(calcularCobranca(entrada, entrada + 1, 8.5, 100, c) && c.valor == 0);
  assert(calcularCobranca(entrada, entrada + 3, 8.5, 100, c) && c.valor == 0.01);
  assert(calcularCobranca(entrada, entrada, 8.5, 0, c) && c.valor == 0);
  assert(calcularCobranca(entrada, entrada + 3600, 0, 20, c) && c.saldoFinal == 20);
  // Carteira acadêmica admite dívida; não inventar quitação quando falta saldo.
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 0, c) && c.saldoFinal == -8.5);
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 100.123456, c));
  assert(std::abs(c.saldoFinal - 91.623456) < 1e-9);
  assert(calcularCobranca(entrada, entrada + 86400, 8.5, 300, c) && c.valor == 204);
  assert(calcularCobranca(PRIMEIRO_TIMESTAMP_VALIDO, PRIMEIRO_TIMESTAMP_VALIDO, 0, 0, c));
  assert(!calcularCobranca(0, entrada, 8.5, 100, c));
  assert(c.segundos == 0 && c.valor == 0 && c.saldoFinal == 0);
  assert(!calcularCobranca(entrada, entrada - 1, 8.5, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, -1, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, NAN, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, 8.5, INFINITY, c));
  assert(!calcularCobranca(entrada, entrada + 1, 8.5, NAN, c));
  assert(!calcularCobranca(std::numeric_limits<int64_t>::min(), entrada, 8.5, 100, c));
  std::puts("LogicaTotem: placas, capacidade, tarifa e cobranca aprovadas.");
}
