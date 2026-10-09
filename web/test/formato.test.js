// Formatação e validação dos campos (src/utils/format.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarDuracao,
  formatarDuracaoAoVivo,
  formatarMoeda,
  formatarTelefone,
  lerValorEmReais,
  normalizarPlaca,
  normalizarTelefone,
  saldoEmPendencia,
  telefoneValido,
  valorPendente,
  valorRecebido,
} from "../src/utils/format.js";

// Intl usa espaço sem quebra depois de "R$".
const moeda = (valor) => formatarMoeda(valor).replace(/\s/g, " ");

test("placa: o campo tira hífen e espaço e passa para maiúsculas", () => {
  assert.equal(normalizarPlaca("abc-1d23"), "ABC1D23");
  assert.equal(normalizarPlaca(" abc 1234 "), "ABC1234");
  assert.equal(normalizarPlaca("ABC1234XYZ"), "ABC1234");
  assert.equal(normalizarPlaca(null), "");
});

test("celular: máscara enquanto digita e DDD com nono dígito", () => {
  assert.equal(normalizarTelefone("(41) 99999-8888"), "41999998888");
  assert.equal(formatarTelefone("4"), "(4");
  assert.equal(formatarTelefone("419999"), "(41) 9999");
  assert.equal(formatarTelefone("4199999"), "(41) 9999-9");
  assert.equal(formatarTelefone("41999998888"), "(41) 99999-8888");
  assert.equal(formatarTelefone(""), "");
  assert.ok(telefoneValido("(41) 99999-8888"));
  assert.ok(!telefoneValido("(41) 3333-4444"), "fixo");
  assert.ok(!telefoneValido("(10) 99999-8888"), "DDD 10");
  assert.ok(!telefoneValido("(41) 89999-8888"), "sem o nono dígito");
});

test("dinheiro: real com vírgula e milhar com ponto", () => {
  assert.equal(moeda(0), "R$ 0,00");
  assert.equal(moeda(8.5), "R$ 8,50");
  assert.equal(moeda(1234.5), "R$ 1.234,50");
  assert.equal(moeda(-6.3), "-R$ 6,30");
  assert.equal(moeda("texto"), "R$ 0,00");
});

test("valor digitado na recarga: vírgula, ponto de milhar e teclado de celular", () => {
  const casos = {
    "10": 10, "10,5": 10.5, "10,50": 10.5, "10,": 10, "0,01": 0.01, " 25 ": 25,
    "1.000": 1000, "10.505": 10505, "1.000,50": 1000.5, "1.234.567,89": 1234567.89,
    "35.5": 35.5, "35.50": 35.5, "1.00": 1,
  };
  for (const [texto, esperado] of Object.entries(casos)) assert.equal(lerValorEmReais(texto), esperado, texto);
  for (const texto of ["", "abc", "-5", "1,234", "10,505", "01.000", "1.0000", "1,000.50", "R$ 10"]) {
    assert.ok(Number.isNaN(lerValorEmReais(texto)), texto);
  }
});

test("pendência: meio centavo de tolerância, como o totem e as regras", () => {
  assert.equal(valorPendente({ valorPendente: 3.5 }), 3.5);
  assert.equal(valorPendente({ valorPendente: 0.004 }), 0);
  assert.equal(valorPendente({}), 0);
  assert.equal(valorRecebido({ valorCobrado: 8.5, valorPendente: 3.5 }), 5);
  assert.equal(valorRecebido({ valorCobrado: 8.5 }), 8.5);
  assert.ok(saldoEmPendencia(-0.005) && saldoEmPendencia(-8.5));
  assert.ok(!saldoEmPendencia(-0.004) && !saldoEmPendencia(0) && !saldoEmPendencia(undefined));
});

test("duração da estadia e do cronômetro ao vivo", () => {
  assert.equal(formatarDuracao(0), "0 min");
  assert.equal(formatarDuracao(59), "59 min");
  assert.equal(formatarDuracao(60), "1h 00min");
  assert.equal(formatarDuracao(125), "2h 05min");
  assert.equal(formatarDuracao(-5), "0 min");
  assert.equal(formatarDuracaoAoVivo(45), "45s");
  assert.equal(formatarDuracaoAoVivo(125), "2min 05s");
  assert.equal(formatarDuracaoAoVivo(3725), "1h 02min");
});
