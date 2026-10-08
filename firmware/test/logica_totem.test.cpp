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

  // Mesma regra do site (web/src/utils/mapaVagas.js) e das regras do Firestore:
  // o tipo gravado manda; sem ele, a tabela padrão (1-2 PCD, 9 e 11 60+, 10 gestante).
  assert(tipoDaVaga(nullptr, 1) == TipoVaga::PCD && tipoDaVaga(nullptr, 2) == TipoVaga::PCD);
  assert(tipoDaVaga(nullptr, 9) == TipoVaga::IDOSO && tipoDaVaga(nullptr, 11) == TipoVaga::IDOSO);
  assert(tipoDaVaga(nullptr, 10) == TipoVaga::GESTANTE);
  assert(tipoDaVaga(nullptr, 3) == TipoVaga::COMUM && tipoDaVaga(nullptr, 12) == TipoVaga::COMUM);
  assert(tipoDaVaga("comum", 1) == TipoVaga::COMUM);       // tipo gravado vence a tabela
  assert(tipoDaVaga("gestante", 3) == TipoVaga::GESTANTE);
  assert(tipoDaVaga("outro", 2) == TipoVaga::PCD && tipoDaVaga("outro", 4) == TipoVaga::COMUM);
  // Modelo e cor informados no site: mesma regra das regras do Firestore
  // (nomeDeVeiculoValido) e de web/src/utils/veiculo.js.
  for (const char* nome : {"Gol", "Up!", "T-Cross 200 TSI", "HB20S", "Range Rover Evoque", "C4 Cactus",
                           "500", "Classe C", "XXXXXXXXXXXXXXXXXXXX"})
    assert(nomeVeiculoValido(nome));
  for (const char* nome : {"", " Gol", "-Gol", "Gol<b>", "Citro\xC3\xABn", "Gol\nPrata", "Gol/Saveiro",
                           "XXXXXXXXXXXXXXXXXXXXX"})
    assert(!nomeVeiculoValido(nome));
  assert(!nomeVeiculoValido(nullptr));
  for (const char* cor : {"branco", "preto", "prata", "vinho", "roxo"}) assert(corVeiculoValida(cor));
  for (const char* cor : {"", "Prata", "PRATA", "prata ", "furta-cor", "grena"}) assert(!corVeiculoValida(cor));
  assert(!corVeiculoValida(nullptr));
  assert(descricaoVeiculoValida("", "") && descricaoVeiculoValida(nullptr, nullptr));
  assert(descricaoVeiculoValida("Gol", "prata") && descricaoVeiculoValida("Gol", "") && descricaoVeiculoValida("", "azul"));
  // Um campo fora do formato invalida os dois: o totem não mostra nem copia nada.
  assert(!descricaoVeiculoValida("Gol<b>", "prata") && !descricaoVeiculoValida("Gol", "neon"));
  // Direito declarado no veículo: ausente, vazio ou desconhecido = nenhum.
  assert(direitoDeclarado("pcd") == TipoVaga::PCD && direitoDeclarado("idoso") == TipoVaga::IDOSO);
  assert(direitoDeclarado(nullptr) == TipoVaga::COMUM && direitoDeclarado("") == TipoVaga::COMUM);
  assert(direitoDeclarado("vip") == TipoVaga::COMUM);

  {
    // Quem declarou direito recebe a primeira vaga do seu tipo; se acabarem,
    // uma comum. Sem direito, nunca uma especial.
    constexpr int64_t agora = 1788800000;
    EstadoVaga v[MAX_VAGAS + 1] = {};
    v[1].tipo = v[2].tipo = TipoVaga::PCD;
    v[3].tipo = TipoVaga::IDOSO;
    assert(escolherVaga(v, 6, 0, agora) == 4);                     // sem direito: comum
    assert(escolherVaga(v, 6, 0, agora, TipoVaga::PCD) == 1);
    assert(escolherVaga(v, 6, 0, agora, TipoVaga::IDOSO) == 3);
    assert(escolherVaga(v, 6, 0, agora, TipoVaga::GESTANTE) == 4); // não há vaga do tipo
    v[1].usada = true;
    v[2].reservadaAte = agora + 600;                                // reservada por outra pessoa
    assert(escolherVaga(v, 6, 0, agora, TipoVaga::PCD) == 4);
    assert(escolherVaga(v, 6, 2, agora, TipoVaga::PCD) == 2);       // a própria reserva
    v[4].usada = v[5].usada = v[6].usada = true;
    assert(escolherVaga(v, 6, 0, agora) == 0);                      // sobram só especiais
    assert(escolherVaga(v, 6, 0, agora, TipoVaga::IDOSO) == 3);
  }

  {
    constexpr int64_t agora = 1788800000;
    EstadoVaga v[MAX_VAGAS + 1] = {};
    assert(escolherVaga(v, 4, 0, agora) == 1);
    v[1].usada = true;
    v[2].tipo = TipoVaga::PCD;
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
