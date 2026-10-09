// Conta da estadia no site (src/utils/cobranca.js): o que o totem recusa e a
// estimativa ao vivo do painel. Os casos de valor estão em contratos.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCobranca, PRIMEIRO_TIMESTAMP_VALIDO, valorDaEstadia } from "../src/utils/cobranca.js";

const entrada = 1788800000;
const conta = (extra) => calcularCobranca({ entrada, saida: entrada + 3600, tarifa: 8.5, saldo: 100, ...extra });

test("recusa o que o totem também recusa", () => {
  assert.equal(conta({ entrada: 0 }), null);
  assert.equal(conta({ entrada: PRIMEIRO_TIMESTAMP_VALIDO - 1, saida: PRIMEIRO_TIMESTAMP_VALIDO }), null);
  assert.equal(conta({ saida: entrada - 1 }), null);
  assert.equal(conta({ entrada: entrada + 0.5 }), null);
  for (const tarifa of [-0.01, 10000.01, NaN, Infinity]) assert.equal(conta({ tarifa }), null, `tarifa ${tarifa}`);
  for (const saldo of [NaN, Infinity, -Infinity]) assert.equal(conta({ saldo }), null, `saldo ${saldo}`);
  assert.ok(conta({ entrada: PRIMEIRO_TIMESTAMP_VALIDO, saida: PRIMEIRO_TIMESTAMP_VALIDO, tarifa: 0, saldo: 0 }));
  assert.ok(conta({ tarifa: 10000 }));
});

test("a duração do recibo conta só minutos inteiros, como as regras", () => {
  assert.equal(conta({ saida: entrada + 59 }).duracaoMinutos, 0);
  assert.equal(conta({ saida: entrada + 119 }).duracaoMinutos, 1);
  assert.equal(conta({ saida: entrada + 3600 }).duracaoMinutos, 60);
  assert.equal(conta({ saida: entrada + 3600 }).segundos, 3600);
});

test("a estimativa do painel é a mesma conta, segundo a segundo", () => {
  assert.equal(valorDaEstadia(0, 8.5), 0);
  assert.equal(valorDaEstadia(3600, 8.5), 8.5);
  assert.equal(valorDaEstadia(3900, 8.5), 9.21);
  for (let segundos = 0; segundos <= 7200; segundos += 37) {
    assert.equal(valorDaEstadia(segundos, 7.9), conta({ saida: entrada + segundos, tarifa: 7.9 }).valor);
  }
});
