// Marca, modelo e cor do carro (src/utils/veiculo.js). A regra dos nomes e a
// lista de cores são comparadas com o totem e as regras em contratos.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descreverVeiculo,
  descricaoParaFormulario,
  descricaoPreenchida,
  marcaEModelo,
  normalizarNomeVeiculo,
  OUTRA_MARCA,
  prepararDescricao,
} from "../src/utils/veiculo.js";

test("o nome digitado perde acento e símbolo e cabe em 20 caracteres", () => {
  assert.equal(normalizarNomeVeiculo("Ônix"), "Onix");
  assert.equal(normalizarNomeVeiculo("  gol   bola "), "gol bola ");
  assert.equal(normalizarNomeVeiculo("-Up!"), "Up!");
  assert.equal(normalizarNomeVeiculo("Fusca/1300"), "Fusca1300");
  assert.equal(normalizarNomeVeiculo("A".repeat(30)).length, 20);
});

test("formulário para os campos gravados e de volta", () => {
  assert.deepEqual(prepararDescricao({ marca: "Volkswagen", modelo: " Gol ", cor: "prata" }),
    { marca: "Volkswagen", modelo: "Gol", cor: "prata" });
  assert.deepEqual(prepararDescricao({ marca: OUTRA_MARCA, modelo: "Kombi", cor: "" }),
    { marca: "", modelo: "Kombi", cor: "" });
  assert.equal(prepararDescricao({ cor: "furta-cor" }), null);
  assert.deepEqual(descricaoParaFormulario({ modelo: "Kombi" }), { marca: OUTRA_MARCA, modelo: "Kombi", cor: "" });
  assert.deepEqual(descricaoParaFormulario(null), { marca: "", modelo: "", cor: "" });
  assert.ok(descricaoPreenchida({ cor: "azul" }));
  assert.ok(!descricaoPreenchida({ marca: "", modelo: "  ", cor: "" }));
});

test("como o carro aparece no Perfil e no totem", () => {
  assert.equal(descreverVeiculo({ modelo: "Gol", cor: "prata" }), "Gol prata");
  assert.equal(descreverVeiculo({ cor: "prata" }), "Prata");
  assert.equal(descreverVeiculo({ modelo: "Gol" }), "Gol");
  assert.equal(descreverVeiculo({ modelo: "Gol!@#", cor: "furta-cor" }), "");
  assert.equal(marcaEModelo({ marca: "Volkswagen", modelo: "Gol" }), "Volkswagen Gol");
  assert.equal(marcaEModelo({ modelo: "Kombi" }), "Kombi");
});
