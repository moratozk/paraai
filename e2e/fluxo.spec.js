// Fluxo completo do ParaAí nos emuladores, na ordem da apresentação: cadastro
// com o aceite da política, placa, recarga simulada, reserva no mapa, entrada
// no totem, mapa ao vivo do dono, saída e a cobrança no painel, no comprovante
// e no extrato. O totem é simulado aqui com as mesmas gravações do firmware
// (firmware/totem/Atendimento.cpp), e elas passam pelas regras de verdade
// (firebase/firestore.rules), carregadas no emulador antes de tudo.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, Timestamp, writeBatch } from "firebase/firestore";
import { calcularCobranca } from "../web/src/utils/cobranca.js";
import { formatarDuracao, formatarMoeda } from "../web/src/utils/format.js";

const PROJETO = "demo-paraai";
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const SENHA = "Teste1234";
const EST = "EST-BANCA";
const NOME_EST = "Pátio da Banca";
const TARIFA = 8.5;
const TOTEM = "totem-banca";
const PLACA = "TCC2E26";
const MOTORISTA = { nome: "Marina Alves", email: "marina@paraai.test", celular: "19991234567" };
const DONO = { nome: "Otávio Lima", email: "otavio@paraai.test" };
// Tipos da tabela padrão (contratos/vagas-especiais.csv): 1 e 2 PCD.
const VAGAS = { 1: "pcd", 2: "pcd", 3: "comum", 4: "comum" };

// O site formata com espaço sem quebra depois de "R$"; o Playwright compara
// com os espaços normalizados.
const moeda = (valor) => formatarMoeda(valor).replace(/\s/g, " ");

let env;

async function criarConta(email, nome) {
  const resposta = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: SENHA, displayName: nome, returnSecureToken: true }),
    }
  );
  const dados = await resposta.json();
  if (!dados.localId) throw new Error(`Conta ${email}: ${JSON.stringify(dados)}`);
  return dados.localId;
}

async function uidDaConta(email) {
  const resposta = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: SENHA, returnSecureToken: true }),
    }
  );
  return (await resposta.json()).localId;
}

async function lerSemRegras(caminho) {
  let dados;
  await env.withSecurityRulesDisabled(async (contexto) => {
    const snap = await getDoc(doc(contexto.firestore(), caminho));
    dados = snap.exists() ? snap.data() : null;
  });
  return dados;
}

// Estacionamento com quatro vagas no mapa, o dono dele e um totem pareado.
// Cada projeto (computador e celular) começa dos emuladores vazios.
test.beforeAll(async () => {
  const [host, porta] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: {
      host,
      port: Number(porta),
      rules: await readFile(new URL("../firebase/firestore.rules", import.meta.url), "utf8"),
    },
  });
  await env.clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJETO}/accounts`, { method: "DELETE" });
  const donoUid = await criarConta(DONO.email, DONO.nome);

  await env.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    const agora = Timestamp.now();
    const endereco = {
      cep: "13469-111", logradouro: "Rua Emílio de Menezes", numero: "s/n",
      bairro: "Vila Amorim", cidade: "Americana", uf: "SP",
    };
    const publico = {
      nome: NOME_EST, numVagas: 4, tarifaHora: TARIFA, ativo: true, ...endereco,
      modoDisponibilidade: "mapa", vagasLivresMapeadas: 4,
    };
    const lote = writeBatch(db);
    lote.set(doc(db, "users", donoUid), {
      name: DONO.nome, email: DONO.email, role: "operador", estacionamentoId: EST, createdAt: agora,
    });
    lote.set(doc(db, "estacionamentos", EST), { ...publico, ownerUid: donoUid, criadoEm: agora });
    lote.set(doc(db, "catalogoEstacionamentos", EST), {
      ...publico, ultimaAtualizacaoMapa: agora, atualizadoEm: agora,
    });
    for (const [vaga, tipo] of Object.entries(VAGAS)) {
      lote.set(doc(db, "estacionamentos", EST, "vagas", vaga),
        { ocupada: false, placa: "", origemOcupacao: "registro" });
      lote.set(doc(db, "catalogoEstacionamentos", EST, "vagas", vaga),
        { ocupada: false, tipo, reservadaAte: 0 });
    }
    lote.set(doc(db, "totems", TOTEM), {
      estacionamentoId: EST, nome: "Totem da entrada", ativo: true, criadoEm: agora,
    });
    await lote.commit();
  });
});

test.afterAll(async () => {
  await env?.cleanup();
});

// ---- Totem: as mesmas gravações do firmware, com a conta do equipamento ----
const totem = () => env.authenticatedContext(TOTEM).firestore();

// Entrada pela placa: usa a vaga reservada pelo dono da placa e consome a
// reserva no mesmo lote. As regras aceitam até 5 minutos de diferença no
// relógio do totem; a entrada fica 4 minutos no passado para a estadia ter
// tempo e valor de verdade sem o teste esperar.
async function totemRegistraEntrada(placa) {
  const d = totem();
  const veiculo = (await getDoc(doc(d, "veiculos", placa))).data();
  const reserva = (await getDoc(doc(d, "reservas", veiculo.ownerUid))).data();
  expect(reserva?.status).toBe("ativa");
  const vaga = reserva.vaga;
  const lote = writeBatch(d);
  lote.update(doc(d, "veiculos", placa), {
    vagaAtual: vaga,
    horaEntrada: Math.floor(Date.now() / 1000) - 240,
    estacionamentoId: EST,
    tarifaHoraEntrada: TARIFA,
  });
  lote.set(doc(d, "estacionamentos", EST, "vagas", String(vaga)),
    { ocupada: true, placa, origemOcupacao: "registro" });
  lote.update(doc(d, "catalogoEstacionamentos", EST, "vagas", String(vaga)),
    { ocupada: true, reservadaAte: 0 });
  lote.update(doc(d, "reservas", veiculo.ownerUid), { status: "utilizada" });
  await lote.commit();
  return vaga;
}

// Saída: a conta do totem (a mesma de web/src/utils/cobranca.js, conferida
// pelos contratos), o débito, a vaga livre e o recibo, juntos.
async function totemRegistraSaida(placa) {
  const d = totem();
  const veiculo = (await getDoc(doc(d, "veiculos", placa))).data();
  const saida = Math.floor(Date.now() / 1000);
  const conta = calcularCobranca({
    entrada: veiculo.horaEntrada, saida, tarifa: veiculo.tarifaHoraEntrada, saldo: veiculo.saldo,
  });
  const vaga = String(veiculo.vagaAtual);
  const recibo = {
    placa, vaga: veiculo.vagaAtual, entrada: veiculo.horaEntrada, saida,
    duracaoMinutos: conta.duracaoMinutos, valorCobrado: conta.valor, valorPendente: conta.pendente,
    tarifaHora: veiculo.tarifaHoraEntrada, estacionamentoId: EST,
  };
  const lote = writeBatch(d);
  lote.update(doc(d, "veiculos", placa), {
    vagaAtual: 0, horaEntrada: 0, estacionamentoId: "", tarifaHoraEntrada: 0, saldo: conta.saldoFinal,
  });
  lote.update(doc(d, "estacionamentos", EST, "vagas", vaga),
    { ocupada: false, placa: "", origemOcupacao: "registro" });
  lote.update(doc(d, "catalogoEstacionamentos", EST, "vagas", vaga), { ocupada: false });
  lote.set(doc(d, "historico", `${placa}_${veiculo.horaEntrada}`), recibo);
  await lote.commit();
  return { ...recibo, saldoFinal: conta.saldoFinal };
}

// ---- Navegador ----------------------------------------------------------

// Só o site e os emuladores: nada sai para a internet (fontes, mapas). Erros
// de JavaScript e do console ficam guardados para o fim do teste, menos o
// aviso das fontes bloqueadas aqui.
async function novaPagina(browser, opcoes) {
  const contexto = await browser.newContext(opcoes);
  await contexto.route(/^(?!https?:\/\/(127\.0\.0\.1|localhost)[:/])/, (rota) => rota.abort());
  const pagina = await contexto.newPage();
  pagina.erros = [];
  pagina.on("pageerror", (erro) => pagina.erros.push(erro.message));
  pagina.on("console", (mensagem) => {
    if (mensagem.type() === "error" && !mensagem.text().startsWith("Failed to load resource")) {
      pagina.erros.push(mensagem.text());
    }
  });
  return pagina;
}

// Cartão da página pelo título ("Meu veículo", "Meu carro").
const cartao = (pagina, titulo) =>
  pagina.locator(".card").filter({ has: pagina.getByRole("heading", { name: titulo, exact: true }) });

async function entrar(pagina, email) {
  await pagina.goto("/login");
  await pagina.locator("#email").fill(email);
  await pagina.locator("#password").fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(pagina).toHaveURL(/\/dashboard$/);
}

test("motorista e dono: do cadastro à cobrança, com o totem pelas regras", async ({ browser }, info) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId } =
    info.project.use;
  const opcoes = { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId };
  const motorista = await novaPagina(browser, opcoes);
  let vaga;
  let recibo;

  await test.step("cadastro com o aceite da política de privacidade", async () => {
    await motorista.goto("/cadastro");
    await motorista.locator("#name").fill(MOTORISTA.nome);
    await motorista.locator("#email").fill(MOTORISTA.email);
    await motorista.locator("#telefone").fill(MOTORISTA.celular);
    await motorista.locator("#password").fill(SENHA);
    await motorista.locator("#confirmPassword").fill(SENHA);
    await motorista.getByLabel("Li e aceito a política de privacidade").check();
    await motorista.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(motorista).toHaveURL(/\/dashboard$/);
    await expect(motorista.getByRole("heading", { name: /Olá, Marina/ })).toBeVisible();
    // O perfil é gravado logo depois do acesso: esperar antes de sair da página.
    const uid = await uidDaConta(MOTORISTA.email);
    await expect
      .poll(async () => (await lerSemRegras(`users/${uid}`))?.versaoPrivacidade ?? null)
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const perfil = await lerSemRegras(`users/${uid}`);
    expect(perfil).toMatchObject({ role: "motorista", name: MOTORISTA.nome, telefone: "(19) 99123-4567" });
    expect(typeof perfil.privacidadeAceitaEm?.toMillis).toBe("function");
    await expect(motorista.getByText("Não conseguimos carregar os dados da sua conta.")).toHaveCount(0);
  });

  await test.step("placa cadastrada no Perfil", async () => {
    await motorista.goto("/perfil");
    await motorista.getByLabel("Placa do veículo").fill(PLACA);
    await motorista.getByRole("button", { name: "Cadastrar", exact: true }).click();
    await expect(cartao(motorista, "Meu veículo").locator(".placa-tag")).toHaveText(PLACA);
  });

  await test.step("recarga simulada de R$ 50 pelo Pix", async () => {
    await motorista.getByRole("button", { name: "Adicionar saldo" }).click();
    const recarga = motorista.getByRole("dialog", { name: "Adicionar saldo" });
    await recarga.getByLabel("Ou digite outro valor").fill("50");
    await recarga.getByRole("button", { name: "Continuar" }).click();
    await recarga.getByRole("button", { name: "Confirmar recarga simulada" }).click();
    await expect(recarga.getByRole("heading", { name: "Saldo adicionado!" })).toBeVisible();
    await recarga.getByRole("button", { name: "Concluir" }).click();
    await expect(cartao(motorista, "Meu veículo").locator(".money")).toHaveText(moeda(50));
    expect((await lerSemRegras(`veiculos/${PLACA}`)).saldo).toBe(50);
  });

  await test.step("reserva da vaga 3 no mapa do estacionamento", async () => {
    await motorista.goto("/estacionamentos");
    const cartaoDoPatio = motorista
      .locator(".marketplace-card")
      .filter({ has: motorista.getByRole("heading", { name: NOME_EST }) });
    await cartaoDoPatio.getByRole("button", { name: "Abrir mapa de vagas" }).click();
    // Sem direito declarado no Perfil, a vaga PCD é explicada e não reserva.
    await motorista.getByRole("button", { name: "Vaga 1, livre, para PCD", exact: true }).click();
    await expect(motorista.getByText("Vaga para PCD: só para quem declarou esse direito em Perfil."))
      .toBeVisible();
    await expect(motorista.getByRole("button", { name: "Reservar vaga 01" })).toBeDisabled();
    await motorista.getByRole("button", { name: "← Trocar vaga" }).click();
    await motorista.getByRole("button", { name: "Vaga 3, livre", exact: true }).click();
    await motorista.getByRole("button", { name: "Reservar vaga 03" }).click();
    await expect(motorista.getByRole("heading", { name: "Vaga 03 reservada" })).toBeVisible();
    await motorista.getByRole("link", { name: "Ver no meu painel" }).click();
    await expect(motorista).toHaveURL(/\/dashboard$/);
    await expect(motorista.locator(".reserva-ativa")).toContainText(`Vaga 03 · ${NOME_EST}`);
    await expect(motorista.locator(".stat-value.situacao")).toHaveText("Vaga reservada");
  });

  const dono = await novaPagina(browser, opcoes);

  await test.step("dono vê a reserva no mapa do estacionamento", async () => {
    await entrar(dono, DONO.email);
    await expect(dono.getByRole("heading", { name: NOME_EST, level: 1 })).toBeVisible();
    await expect(dono.getByRole("button", { name: /^Vaga 3 reservada pelo app até \d{2}:\d{2}$/ }))
      .toBeVisible();
  });

  await test.step("entrada no totem pela placa, na vaga reservada", async () => {
    vaga = await totemRegistraEntrada(PLACA);
    expect(vaga).toBe(3);
    // Os dois painéis mudam sozinhos, sem recarregar a página.
    await expect(motorista.locator(".stat-value.situacao")).toHaveText("Estacionado");
    await expect(motorista.locator(".reserva-ativa")).toHaveCount(0);
    await expect(cartao(motorista, "Meu carro")).toContainText(`Vaga ${vaga}`);
    await expect(cartao(motorista, "Meu carro")).toContainText(NOME_EST);
    await expect(
      dono.getByRole("button", { name: `Vaga ${vaga} ocupada pela placa ${PLACA}`, exact: true })
    ).toBeVisible();
    expect((await lerSemRegras(`reservas/${await uidDaConta(MOTORISTA.email)}`)).status).toBe("utilizada");
  });

  await test.step("saída no totem: débito, vaga livre e recibo juntos", async () => {
    recibo = await totemRegistraSaida(PLACA);
    expect(recibo.duracaoMinutos).toBeGreaterThanOrEqual(4);
    expect(recibo.valorCobrado).toBeGreaterThan(0);
    expect(recibo.valorPendente).toBe(0);
    await expect(dono.getByRole("button", { name: `Vaga ${vaga} livre`, exact: true })).toBeVisible();
    const linha = dono
      .getByRole("region", { name: "Movimentações" })
      .getByRole("row")
      .filter({ hasText: PLACA });
    await expect(linha).toContainText(moeda(recibo.valorCobrado));
    expect((await lerSemRegras(`veiculos/${PLACA}`)).saldo).toBeCloseTo(50 - recibo.valorCobrado, 9);
  });

  await test.step("cobrança no painel e no comprovante", async () => {
    await expect(motorista.locator(".stat-value.situacao")).toHaveText("Na rua");
    await expect(motorista.locator(".stat-card").filter({ hasText: "Total gasto" }))
      .toContainText(moeda(recibo.valorCobrado));
    await motorista.getByRole("button", { name: new RegExp(`^Ver comprovante: Vaga ${vaga}`) }).click();
    const comprovante = motorista.getByRole("dialog", { name: NOME_EST });
    await expect(comprovante).toContainText("Comprovante de estadia");
    await expect(comprovante).toContainText("Quitada");
    await expect(comprovante.locator(".comprovante-total dd")).toHaveText(moeda(recibo.valorCobrado));
    await expect(comprovante).toContainText(formatarDuracao(recibo.duracaoMinutos));
    await expect(comprovante).toContainText(`${moeda(TARIFA)}/hora`);
  });

  await test.step("extrato da carteira com a recarga e a estadia", async () => {
    await motorista.goto("/perfil");
    const extrato = motorista.locator(".extrato-card");
    await expect(extrato.locator(".extrato-item").filter({ hasText: "Recarga via Pix" }))
      .toContainText(moeda(50));
    await expect(extrato.locator(".extrato-item").filter({ hasText: NOME_EST }))
      .toContainText(moeda(recibo.valorCobrado));
    await expect(cartao(motorista, "Meu veículo").locator(".money"))
      .toHaveText(moeda(recibo.saldoFinal));
  });

  // Nenhum erro nas telas do motorista e do dono.
  expect(motorista.erros).toEqual([]);
  expect(dono.erros).toEqual([]);
});
