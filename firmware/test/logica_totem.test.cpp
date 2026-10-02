#include "../totem/LogicaTotem.h"
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

  static_assert(pinFormatoValido("1234") && pinFormatoValido("12345678"), "PIN valido");
  for (const char* pin : {"", "123", "123456789", "12a4", "12 34", "-1234"}) assert(!pinFormatoValido(pin));
  assert(!pinFormatoValido(nullptr));
  assert(pinConfere("482915", "482915"));
  assert(!pinConfere("48291", "482915") && !pinConfere("4829150", "482915") && !pinConfere("", "482915"));
  assert(!pinConfere(nullptr, "482915"));
  assert(!pinConfere("12", "12")); // PIN configurado fora do formato nunca libera.

  {
    constexpr int64_t agora = 1788800000;
    EstadoVaga v[MAX_VAGAS + 1] = {};
    assert(escolherVaga(v, 4, 0, agora) == 1);
    v[1].usada = true;
    v[2].especial = true;
    v[3].reservadaAte = agora + 600; // reserva de outra pessoa, valendo
    assert(escolherVaga(v, 4, 0, agora) == 4);
    assert(escolherVaga(v, 4, 3, agora) == 3);  // a própria reserva
    assert(escolherVaga(v, 4, 2, agora) == 2);  // especial, só por reserva
    v[3].reservadaAte = agora;                  // venceu agora
    assert(escolherVaga(v, 4, 0, agora) == 3);
    v[3].usada = v[4].usada = true;
    assert(escolherVaga(v, 4, 0, agora) == 0);  // sobra só a especial
    assert(escolherVaga(v, 4, 1, agora) == 0);  // reservada ocupada, sem outra comum
    assert(escolherVaga(v, 4, 9, agora) == 0);  // reserva fora da capacidade
    assert(contarLivres(v, 4, agora) == 1);     // a especial conta como livre
    v[2].reservadaAte = agora + 1;
    assert(contarLivres(v, 4, agora) == 0);
    assert(escolherVaga(nullptr, 4, 0, agora) == 0 && contarLivres(v, 0, agora) == 0);
  }

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
  assert(c.pendente == 8.5);
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 5, c) && c.saldoFinal == -3.5 && c.pendente == 3.5);
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 8.5, c) && c.saldoFinal == 0 && c.pendente == 0);
  // Dívida anterior não entra no pendente desta estadia.
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, -2, c) && c.saldoFinal == -10.5 && c.pendente == 8.5);
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 100, c) && c.pendente == 0);
  assert(entradaPermitida(0) && entradaPermitida(10) && entradaPermitida(-0.004));
  assert(!entradaPermitida(-0.005) && !entradaPermitida(-8.5));
  assert(!entradaPermitida(NAN) && !entradaPermitida(-INFINITY));
  assert(calcularCobranca(entrada, entrada + 3600, 8.5, 100.123456, c));
  assert(std::abs(c.saldoFinal - 91.623456) < 1e-9);
  assert(calcularCobranca(entrada, entrada + 86400, 8.5, 300, c) && c.valor == 204);
  assert(calcularCobranca(PRIMEIRO_TIMESTAMP_VALIDO, PRIMEIRO_TIMESTAMP_VALIDO, 0, 0, c));
  assert(!calcularCobranca(0, entrada, 8.5, 100, c));
  assert(c.segundos == 0 && c.valor == 0 && c.saldoFinal == 0 && c.pendente == 0);
  assert(!calcularCobranca(entrada, entrada - 1, 8.5, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, -1, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, NAN, 100, c));
  assert(!calcularCobranca(entrada, entrada + 1, 8.5, INFINITY, c));
  assert(!calcularCobranca(entrada, entrada + 1, 8.5, NAN, c));
  assert(!calcularCobranca(std::numeric_limits<int64_t>::min(), entrada, 8.5, 100, c));
  std::puts("LogicaTotem: placas, capacidade, tarifa, cobranca, PIN e escolha de vaga aprovados.");
}
