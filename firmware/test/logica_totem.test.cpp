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

  // Wi-Fi pela tela: senha WPA de 8 a 63 caracteres ASCII imprimíveis.
  assert(senhaWifiValida("12345678") && senhaWifiValida("Casa da Vo 2024!~"));
  assert(senhaWifiValida("123456789012345678901234567890123456789012345678901234567890123"));
  assert(!senhaWifiValida("1234567") && !senhaWifiValida("") && !senhaWifiValida(nullptr));
  assert(!senhaWifiValida("1234567890123456789012345678901234567890123456789012345678901234"));
  assert(!senhaWifiValida("senha\tcomtab") && !senhaWifiValida("senha\x7f" "1234"));
  assert(!senhaWifiValida("fam\xc3\xadlia1234")); // O teclado não gera acento.
  assert(textoDigitadoValido("Rede_Oculta", 1, WIFI_SSID_MAX) && !textoDigitadoValido("", 1, WIFI_SSID_MAX));
  assert(!textoDigitadoValido("123456789012345678901234567890123", 1, WIFI_SSID_MAX));
  for (int c = 0x20; c <= 0x7E; ++c) assert(caractereDigitavelWifi(static_cast<char>(c)));
  assert(!caractereDigitavelWifi('\n') && !caractereDigitavelWifi(static_cast<char>(0xC3)));

  // Motivo de desconexão -> o que dizer ao operador.
  assert(classificarFalhaWifi(0) == FalhaWifi::NENHUMA && classificarFalhaWifi(8) == FalhaWifi::NENHUMA);
  for (uint8_t motivo : {14, 15, 202, 204}) assert(classificarFalhaWifi(motivo) == FalhaWifi::SENHA);
  for (uint8_t motivo : {201, 210, 211, 212}) assert(classificarFalhaWifi(motivo) == FalhaWifi::SEM_REDE);
  for (uint8_t motivo : {1, 2, 200, 203, 205}) assert(classificarFalhaWifi(motivo) == FalhaWifi::OUTRA);

  assert(barrasSinalWifi(-40) == 4 && barrasSinalWifi(-60) == 4 && barrasSinalWifi(-61) == 3);
  assert(barrasSinalWifi(-70) == 3 && barrasSinalWifi(-80) == 2 && barrasSinalWifi(-81) == 1);
  assert(barrasSinalWifi(-100) == 1);

  {
    char t[33];
    assert(textoWifiExibivel("NET_2G#5", t, sizeof(t)) == 8 && std::strcmp(t, "NET_2G#5") == 0);
    textoWifiExibivel("Fam\xc3\xadlia Concei\xc3\xa7\xc3\xa3o", t, sizeof(t));
    assert(std::strcmp(t, "Familia Conceicao") == 0);
    textoWifiExibivel("\xc3\x80\xc3\x89\xc3\x94\xc3\x9c\xc3\x87\xc3\x91 \xc3\xbf", t, sizeof(t));
    assert(std::strcmp(t, "AEOUCN y") == 0);
    textoWifiExibivel("Caf\xe2\x98\x95 \xf0\x9f\x9a\x97!", t, sizeof(t)); // emoji de 3 e 4 bytes
    assert(std::strcmp(t, "Caf? ?!") == 0);
    textoWifiExibivel("Caf\xe9 X", t, sizeof(t)); // Latin-1 cru, não UTF-8
    assert(std::strcmp(t, "Caf? X") == 0);
    textoWifiExibivel("fim\xc3", t, sizeof(t)); // sequência cortada no fim
    assert(std::strcmp(t, "fim?") == 0);
    textoWifiExibivel("a\x01" "b\x7f", t, sizeof(t));
    assert(std::strcmp(t, "a?b?") == 0);
    char curto[4];
    assert(textoWifiExibivel("abcdef", curto, sizeof(curto)) == 3 && std::strcmp(curto, "abc") == 0);
    assert(textoWifiExibivel(nullptr, t, sizeof(t)) == 0 && t[0] == '\0');
  }
  std::puts("LogicaTotem: placas, capacidade, tarifa, cobranca, PIN, escolha de vaga e Wi-Fi pela tela aprovados.");
}
