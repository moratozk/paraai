// Tipo, ocupação e reserva das vagas (src/utils/mapaVagas.js). A tabela das
// vagas sem tipo gravado está em contratos.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combinarVagasDoPatio,
  direitoVagaValido,
  iconeAoLadoDoRotulo,
  obterTipoVaga,
  resumirVagas,
  rotuloDireito,
  TIPOS_VAGA,
} from "../src/utils/mapaVagas.js";

test("o tipo gravado vale mais que a tabela; tipo desconhecido usa a tabela", () => {
  assert.equal(obterTipoVaga("gestante", 3).tipo, "gestante");
  assert.equal(obterTipoVaga("comum", 1).tipo, "comum");
  assert.equal(obterTipoVaga("outro", 2).tipo, "pcd");
  assert.equal(obterTipoVaga("outro", 4).tipo, "comum");
  assert.equal(obterTipoVaga(undefined, "10").tipo, "gestante");
});

test("mapa do pátio: ocupação do totem, reserva e tipo do mapa público", () => {
  const vagas = combinarVagasDoPatio(
    [
      { numero: 1, ocupada: false, placa: "" },
      { numero: 2, ocupada: true, placa: "ABC1D23" },
      { numero: 3, ocupada: false, placa: "", tipo: "pcd" },
      { numero: 4, ocupada: false, placa: "" },
    ],
    [{ tipo: "comum", reservada: true, reservadaAte: 1788800000 }, { reservada: true }, {}, { tipo: "idoso" }]
  );
  assert.deepEqual(vagas.map((v) => [v.ocupada, v.reservada, v.tipo]), [
    [false, true, "comum"],
    [true, false, "pcd"], // ocupada não aparece como reservada; vaga 2 sem tipo é PCD pela tabela
    [false, false, "pcd"], // tipo antigo da vaga operacional
    [false, false, "idoso"],
  ]);
  assert.equal(vagas[0].reservadaAte, 1788800000);
  assert.equal(vagas[0].especial, null);
  assert.equal(vagas[3].especial, TIPOS_VAGA.idoso);
  assert.deepEqual(resumirVagas(vagas), { total: 4, ocupadas: 1, reservadas: 1, livres: 2, ocupacao: 50 });
  assert.deepEqual(resumirVagas([]), { total: 0, ocupadas: 0, reservadas: 0, livres: 0, ocupacao: 0 });
});

test("direito declarado e rótulos da vaga especial", () => {
  for (const valor of ["", "pcd", "idoso", "gestante"]) assert.ok(direitoVagaValido(valor), valor);
  for (const valor of ["comum", "outro", undefined, null]) assert.ok(!direitoVagaValido(valor), String(valor));
  assert.equal(rotuloDireito(undefined), "Não preciso");
  assert.equal(rotuloDireito("idoso"), "60+ (pessoa idosa)");
  assert.equal(iconeAoLadoDoRotulo(TIPOS_VAGA.pcd), "♿");
  assert.equal(iconeAoLadoDoRotulo(TIPOS_VAGA.idoso), "");
  assert.equal(iconeAoLadoDoRotulo(TIPOS_VAGA.gestante), "");
});
