// Totais e recortes das estadias (src/utils/relatorios.js), usados nos
// painéis do dono e da rede. Os horários partem do relógio local, como lá.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularClientes,
  calcularHorarioPico,
  calcularSerieDiaria,
  inicioDoDia,
  inicioDoPeriodo,
  PERIODOS,
  resumirEstadias,
} from "../src/utils/relatorios.js";

const segundos = (data) => Math.floor(data.getTime() / 1000);
const hoje = (hora, minuto = 0) => {
  const data = new Date();
  data.setHours(hora, minuto, 0, 0);
  return segundos(data);
};

test("totais: o recebido não conta a parte pendente", () => {
  const resumo = resumirEstadias([
    { valorCobrado: 10, valorPendente: 0, duracaoMinutos: 60 },
    { valorCobrado: 8.5, valorPendente: 3.5, duracaoMinutos: 30 },
  ]);
  assert.deepEqual(resumo, { estadias: 2, recebido: 15, pendente: 3.5, ticketMedio: 9.25, permanenciaMedia: 45 });
  assert.deepEqual(resumirEstadias([]), { estadias: 0, recebido: 0, pendente: 0, ticketMedio: 0, permanenciaMedia: 0 });
});

test("períodos: hoje começa à meia-noite e 7 dias incluem hoje", () => {
  const porId = Object.fromEntries(PERIODOS.map((p) => [p.id, p]));
  assert.equal(inicioDoPeriodo(porId.tudo), 0);
  assert.equal(inicioDoPeriodo(porId.hoje), inicioDoDia(0));
  assert.equal(inicioDoPeriodo(porId["7d"]), inicioDoDia(6));
  assert.equal(new Date(inicioDoDia(0) * 1000).getHours(), 0);
});

test("série diária: a saída de hoje entra no último dia, pelo valor recebido", () => {
  const serie = calcularSerieDiaria(
    [{ saida: hoje(0, 30), valorCobrado: 8.5, valorPendente: 3.5 }, { saida: inicioDoDia(1) + 60, valorCobrado: 4 }],
    7
  );
  assert.equal(serie.length, 7);
  assert.ok(serie.at(-1).hoje);
  assert.equal(serie.at(-1).valor, 5);
  assert.equal(serie.at(-1).acessos, 1);
  assert.equal(serie.at(-2).valor, 4);
  assert.match(calcularSerieDiaria([], 30)[0].rotulo, /^\d{2}$/);
});

test("clientes frequentes e horário de pico", () => {
  const historico = [
    { placa: "ABC1D23", valorCobrado: 8.5, entrada: hoje(8, 5), saida: hoje(9) },
    { placa: "ABC1D23", valorCobrado: 4, entrada: hoje(8, 40), saida: hoje(10) },
    { placa: "XYZ1234", valorCobrado: 20, entrada: hoje(18), saida: hoje(20) },
  ];
  const clientes = calcularClientes(historico);
  assert.deepEqual(clientes.map((c) => [c.placa, c.acessos, c.total]), [["XYZ1234", 1, 20], ["ABC1D23", 2, 12.5]]);
  assert.equal(clientes[1].ultimo, hoje(10));
  assert.deepEqual(calcularHorarioPico(historico), { hora: 8, quantidade: 2 });
  assert.equal(calcularHorarioPico([]), null);
});
