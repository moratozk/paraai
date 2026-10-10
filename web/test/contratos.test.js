// Contratos entre o site, o totem e as regras (ver contratos/README.md). O
// site é testado aqui contra os arquivos de contratos/; o totem e as regras
// leem os mesmos arquivos nos testes deles. Os demais casos comparam o site
// com o que está escrito em firmware/totem/LogicaTotem.h e
// firebase/firestore.rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerArquivo, lerCsv } from "./apoio.js";
import { calcularCobranca, TOLERANCIA_SALDO } from "../src/utils/cobranca.js";
import { RECARGA_MAXIMA, RECARGA_MINIMA } from "../src/utils/constants.js";
import { placaValida } from "../src/utils/format.js";
import { DIREITOS_VAGA, obterTipoVaga, TIPOS_VAGA } from "../src/utils/mapaVagas.js";
import { CORES_VEICULO, nomeVeiculoValido, TAMANHO_NOME_VEICULO } from "../src/utils/veiculo.js";

const REGRAS = lerArquivo("firebase/firestore.rules");
const TOTEM = lerArquivo("firmware/totem/LogicaTotem.h");
// A mesma entrada dos testes do totem: 2026-09-08, depois do primeiro horário válido.
const ENTRADA = 1788800000;

function trecho(texto, expressao, descricao) {
  const achado = texto.match(expressao);
  assert.ok(achado, `não achei ${descricao}; se o código mudou de forma, ajuste este teste`);
  return achado;
}

test("cobrança: o site faz a conta de contratos/cobranca.csv", () => {
  const casos = lerCsv("cobranca.csv");
  assert.ok(casos.length >= 20);
  for (const caso of casos) {
    const rotulo = `${caso.segundos} s a R$ ${caso.tarifa}/h com saldo ${caso.saldo}`;
    const conta = calcularCobranca({
      entrada: ENTRADA,
      saida: ENTRADA + Number(caso.segundos),
      tarifa: Number(caso.tarifa),
      saldo: Number(caso.saldo),
    });
    assert.ok(conta, rotulo);
    assert.equal(conta.valor, Number(caso.valor), `${rotulo}: valor`);
    assert.ok(Math.abs(conta.saldoFinal - Number(caso.saldo_final)) < 1e-9, `${rotulo}: saldo final`);
    assert.ok(Math.abs(conta.pendente - Number(caso.pendente)) < 1e-9, `${rotulo}: pendente`);
  }
});

test("cobrança: o totem e as regras usam a mesma fórmula, na mesma ordem", () => {
  trecho(TOTEM, /std::round\(resultado\.segundos \/ 3600\.0 \* tarifa \* 100\.0\) \/ 100\.0/, "a conta no totem");
  trecho(
    REGRAS,
    /math\.round\(\(dados\.saida - dados\.entrada\) \/ 3600\.0 \* dados\.tarifaHora \* 100\) \/ 100\.0/,
    "a conta nas regras"
  );
});

test("vagas especiais: o site segue contratos/vagas-especiais.csv", () => {
  const tabela = new Map(lerCsv("vagas-especiais.csv").map((linha) => [Number(linha.vaga), linha.tipo]));
  for (const tipo of tabela.values()) assert.ok(tipo in TIPOS_VAGA, `tipo desconhecido: ${tipo}`);
  for (let vaga = 1; vaga <= 200; vaga++) {
    assert.equal(obterTipoVaga(undefined, vaga).tipo, tabela.get(vaga) || "comum", `vaga ${vaga}`);
  }
});

test("placas: o site e as regras aceitam as de contratos/placas.csv", () => {
  const expressoes = [...REGRAS.matchAll(/placa\.matches\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(expressoes.length >= 2, "as regras conferem a placa no recibo e na vaga");
  assert.equal(new Set(expressoes).size, 1, "as regras usam a mesma expressão de placa nos dois lugares");
  const dasRegras = new RegExp(expressoes[0]);
  for (const { placa, valida } of lerCsv("placas.csv")) {
    assert.equal(placaValida(placa), valida === "sim", `site: ${placa}`);
    assert.equal(dasRegras.test(placa), valida === "sim", `regras: ${placa}`);
  }
});

test("cores do veículo: a mesma lista no site, no totem e nas regras", () => {
  const nomes = (texto) => [...texto.matchAll(/['"]([a-z]+)['"]/g)].map((m) => m[1]);
  const doSite = CORES_VEICULO.map((cor) => cor.valor);
  assert.deepEqual(nomes(trecho(REGRAS, /dados\.cor in \[([^\]]+)\]/, "as cores nas regras")[1]), doSite);
  assert.deepEqual(nomes(trecho(TOTEM, /CORES\[\] = \{([^}]+)\}/, "as cores no totem")[1]), doSite);
});

test("marca e modelo: o site e as regras aceitam os mesmos nomes", () => {
  const dasRegras = new RegExp(trecho(REGRAS, /nome\.matches\('([^']+)'\)/, "o nome do veículo nas regras")[1]);
  const nomes = ["Gol", "Onix Plus", "HB20", "T-Cross", "C4 Cactus", "Up!", "Sw4 2.8", "A".repeat(20),
    "A".repeat(21), "", " Gol", "-Gol", "Ônix", "Gol ç", "Gol/1.0", "Gol\n"];
  for (const nome of nomes) assert.equal(nomeVeiculoValido(nome), dasRegras.test(nome), JSON.stringify(nome));
  assert.equal(TAMANHO_NOME_VEICULO, 20);
  trecho(TOTEM, /NOME_VEICULO_MAX = 20;/, "o tamanho do nome no totem");
});

test("direito a vaga especial: os mesmos valores no site, no totem e nas regras", () => {
  const dasRegras = trecho(REGRAS, /dados\.vagaEspecial in \[([^\]]+)\]/, "os direitos nas regras")[1];
  assert.deepEqual([...dasRegras.matchAll(/'([a-z]*)'/g)].map((m) => m[1]), DIREITOS_VAGA.map((d) => d.valor));
  for (const tipo of Object.keys(TIPOS_VAGA)) {
    trecho(TOTEM, new RegExp(`strcmp\\(texto, "${tipo}"\\)`), `o tipo ${tipo} no totem`);
  }
});

test("saldo: meio centavo de tolerância no site, no totem e nas regras", () => {
  assert.equal(TOLERANCIA_SALDO, 0.005);
  trecho(TOTEM, /TOLERANCIA_SALDO = 0\.005;/, "a tolerância no totem");
  const limites = [...REGRAS.matchAll(/saldo > (-[0-9.]+)/g)].map((m) => Number(m[1]));
  assert.ok(limites.length >= 3, "entrada, reserva e exclusão da conta conferem o saldo");
  for (const limite of limites) assert.equal(limite, -TOLERANCIA_SALDO);
});

test("recarga: os mesmos limites no site e nas regras", () => {
  const limites = trecho(REGRAS, /valor >= ([0-9.]+) && valor <= ([0-9.]+)/, "os limites da recarga nas regras");
  assert.equal(Number(limites[1]), RECARGA_MINIMA);
  assert.equal(Number(limites[2]), RECARGA_MAXIMA);
});
