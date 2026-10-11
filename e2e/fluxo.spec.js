// Fluxo completo do ParaAí nos emuladores, na ordem da apresentação: cadastro
// com o aceite da política, placa, recarga simulada, reserva no mapa, entrada
// no totem, mapa ao vivo do dono, saída e a cobrança no painel, no comprovante
// e no extrato. O totem é simulado (patio.js) com as mesmas leituras e
// gravações do firmware (firmware/totem/Atendimento.cpp), e elas passam pelas
// regras de verdade (firebase/firestore.rules), carregadas no emulador antes
// de tudo.
import { expect, test } from "@playwright/test";
import { formatarDuracao, formatarMoeda } from "../web/src/utils/format.js";
import {
  abrirEmuladores,
  criarConta,
  lerSemRegras,
  prepararAdministrador,
  prepararPatio,
  totemSimulado,
  uidDaConta,
} from "./patio.js";

const SENHA = "Teste1234";
const EST = "EST-BANCA";
const NOME_EST = "Pátio da Banca";
const TARIFA = 8.5;
const TOTEM = "totem-banca";
const PLACA = "TCC2E26";
const MOTORISTA = { nome: "Marina Alves", email: "marina@paraai.test", celular: "19991234567" };
const DONO = { nome: "Otávio Lima", email: "otavio@paraai.test" };

// O site formata com espaço sem quebra depois de "R$"; o Playwright compara
// com os espaços normalizados.
const moeda = (valor) => formatarMoeda(valor).replace(/\s/g, " ");

let env;
let totem;
const lerNoBanco = (caminho) => lerSemRegras(env, caminho);

// Estacionamento com quatro vagas no mapa (1 e 2 PCD, como na tabela padrão
// de contratos/vagas-especiais.csv), o dono dele e um totem pareado, que manda
// o primeiro sinal de vida ao ligar. Cada projeto (computador e celular)
// começa dos emuladores vazios.
test.beforeAll(async () => {
  env = await abrirEmuladores();
  const donoUid = await criarConta({ email: DONO.email, senha: SENHA, nome: DONO.nome });
  await prepararPatio(env, {
    id: EST,
    nome: NOME_EST,
    tarifa: TARIFA,
    tipos: ["pcd", "pcd", "comum", "comum"],
    endereco: {
      cep: "13469-111", logradouro: "Rua Emílio de Menezes", numero: "s/n",
      bairro: "Vila Amorim", cidade: "Americana", uf: "SP",
    },
    dono: { uid: donoUid, ...DONO },
    totem: { uid: TOTEM, nome: "Totem da entrada", email: "totem-banca@dispositivo.paraai.test" },
  });
  totem = totemSimulado(env, { uid: TOTEM, estacionamentoId: EST });
  expect(await totem.sinal()).toBe(true);
});

test.afterAll(async () => {
  await env?.cleanup();
});

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
    const uid = await uidDaConta(MOTORISTA.email, SENHA);
    await expect
      .poll(async () => (await lerNoBanco(`users/${uid}`))?.versaoPrivacidade ?? null)
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const perfil = await lerNoBanco(`users/${uid}`);
    expect(perfil).toMatchObject({ role: "motorista", name: MOTORISTA.nome, telefone: "(19) 99123-4567" });
    expect(typeof perfil.privacidadeAceitaEm?.toMillis).toBe("function");
    await expect(motorista.getByText("Não conseguimos carregar os dados da sua conta.")).toHaveCount(0);
  });

  await test.step("placa cadastrada no Perfil", async () => {
    await motorista.goto("/perfil");
    await motorista.getByLabel("Placa do veículo").fill(PLACA);
    await motorista.getByRole("button", { name: "Cadastrar", exact: true }).click();
    await expect(cartao(motorista, "Meu veículo").locator(".placa-carro")).toHaveText(PLACA);
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
    expect((await lerNoBanco(`veiculos/${PLACA}`)).saldo).toBe(50);
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
    // Quatro minutos no passado, para a estadia ter tempo e valor sem esperar.
    const entrada = await totem.entrada(PLACA, { segundosAtras: 240 });
    expect(entrada).toMatchObject({ titulo: "ENTRADA CONFIRMADA", vaga: 3, reservada: true });
    vaga = entrada.vaga;
    // Os dois painéis mudam sozinhos, sem recarregar a página.
    await expect(motorista.locator(".stat-value.situacao")).toHaveText("Estacionado");
    await expect(motorista.locator(".reserva-ativa")).toHaveCount(0);
    await expect(cartao(motorista, "Meu carro")).toContainText(`Vaga ${vaga}`);
    await expect(cartao(motorista, "Meu carro")).toContainText(NOME_EST);
    await expect(
      dono.getByRole("button", { name: `Vaga ${vaga} ocupada pela placa ${PLACA}`, exact: true })
    ).toBeVisible();
    expect((await lerNoBanco(`reservas/${await uidDaConta(MOTORISTA.email, SENHA)}`)).status).toBe("utilizada");
  });

  await test.step("saída no totem: débito, vaga livre e recibo juntos", async () => {
    const saida = await totem.saida(PLACA);
    expect(saida.titulo).toBe("SAIDA CONFIRMADA");
    recibo = { ...saida.recibo, saldoFinal: saida.saldoFinal };
    expect(recibo.duracaoMinutos).toBeGreaterThanOrEqual(4);
    expect(recibo.valorCobrado).toBeGreaterThan(0);
    expect(recibo.valorPendente).toBe(0);
    await expect(dono.getByRole("button", { name: `Vaga ${vaga} livre`, exact: true })).toBeVisible();
    const linha = dono
      .getByRole("region", { name: "Movimentações" })
      .getByRole("row")
      .filter({ hasText: PLACA });
    await expect(linha).toContainText(moeda(recibo.valorCobrado));
    expect((await lerNoBanco(`veiculos/${PLACA}`)).saldo).toBeCloseTo(50 - recibo.valorCobrado, 9);
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

// Estacionamento novo na rede: quem tem o pátio pede pelo site, a equipe
// aprova no painel da rede e a conta vira dona, com o pátio no mapa. O CEP é
// respondido aqui mesmo (nada sai para a internet).
const CANDIDATA = { nome: "Carla Souza", email: "carla@paraai.test", celular: "41998765432" };
const EQUIPE = { nome: "Equipe ParaAí", email: "equipe@paraai.test" };
const PATIO_NOVO = "Pátio da Carla";

test("estacionamento novo: pedido pelo site, aprovação na rede e painel de dono", async ({ browser }, info) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId } =
    info.project.use;
  const opcoes = { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId };
  await prepararAdministrador(env, { ...EQUIPE, senha: SENHA });
  const candidata = await novaPagina(browser, opcoes);
  await candidata.route(/^https:\/\/viacep\.com\.br\//, (rota) =>
    rota.fulfill({
      json: { cep: "80010-000", logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" },
    }));
  let equipe;

  await test.step("pedido em três etapas no cadastro", async () => {
    await candidata.goto("/");
    await expect(candidata.getByRole("link", { name: "Cadastrar meu estacionamento" }))
      .toHaveAttribute("href", "/cadastro?perfil=estacionamento");
    await candidata.goto("/cadastro?perfil=estacionamento");
    await expect(candidata.getByRole("heading", { name: "Cadastre seu estacionamento" })).toBeVisible();
    await candidata.locator("#name").fill(CANDIDATA.nome);
    await candidata.locator("#email").fill(CANDIDATA.email);
    await candidata.locator("#telefone").fill(CANDIDATA.celular);
    await candidata.locator("#password").fill(SENHA);
    await candidata.locator("#confirmPassword").fill(SENHA);
    await candidata.getByRole("button", { name: "Continuar" }).click();

    await candidata.locator("#nomeEstacionamento").fill(PATIO_NOVO);
    await candidata.locator("#cep").fill("80010000");
    await expect(candidata.getByText("✓ Endereço localizado")).toBeVisible();
    await candidata.locator("#numero").fill("100");
    await candidata.getByRole("button", { name: "Continuar" }).click();

    await candidata.locator("#numVagas").fill("12");
    await candidata.locator("#tarifa").fill("7,50");
    await candidata.locator("#mensagem").fill("Abrimos das 7h às 22h.");
    await candidata.getByLabel("Li e aceito a política de privacidade").check();
    await candidata.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(candidata).toHaveURL(/\/dashboard$/);
    await expect(candidata.getByRole("heading", { name: "Pedido em análise" })).toBeVisible();
    await expect(candidata.locator(".pedido-resumo")).toContainText(moeda(7.5));
  });

  await test.step("a equipe aprova no painel da rede", async () => {
    equipe = await novaPagina(browser, opcoes);
    await entrar(equipe, EQUIPE.email);
    const pedido = equipe.locator(".pedido-rede").filter({ hasText: PATIO_NOVO });
    await expect(pedido).toContainText(CANDIDATA.nome);
    await pedido.getByRole("button", { name: "Aprovar e publicar" }).click();
    await pedido.getByRole("button", { name: "Confirmar aprovação" }).click();
    await expect(equipe.locator(".pedido-rede")).toHaveCount(0);
    await expect(equipe.locator(".admin-estacionamento").filter({ hasText: PATIO_NOVO }))
      .toContainText("Publicado");
  });

  await test.step("a conta vira dona e o painel troca sozinho", async () => {
    await expect(candidata.getByRole("heading", { name: PATIO_NOVO, level: 1 })).toBeVisible();
    const uid = await uidDaConta(CANDIDATA.email, SENHA);
    const conta = await lerNoBanco(`users/${uid}`);
    expect(conta.role).toBe("operador");
    const estacionamento = await lerNoBanco(`estacionamentos/${conta.estacionamentoId}`);
    expect(estacionamento.ownerUid).toBe(uid);
    expect(estacionamento.tarifaHora).toBe(7.5);
    expect((await lerNoBanco(`catalogoEstacionamentos/${conta.estacionamentoId}`)).nome).toBe(PATIO_NOVO);
  });

  expect(candidata.erros).toEqual([]);
  expect(equipe.erros).toEqual([]);
});

test("sem internet: o painel do dono avisa e não culpa o totem", async ({ browser }, info) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId } =
    info.project.use;
  const opcoes = { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, timezoneId };
  const dono = await novaPagina(browser, opcoes);
  expect(await totem.sinal()).toBe(true);
  await entrar(dono, DONO.email);
  await expect(dono.getByText("Totem online")).toBeVisible();

  await test.step("a conexão do aparelho cai", async () => {
    await dono.context().setOffline(true);
    await expect(dono.locator(".aviso-conexao")).toContainText("Sem internet neste aparelho.");
    await expect(dono.getByRole("heading", { name: "Sem internet neste aparelho" })).toBeVisible();
    await expect(dono.getByText("Totem sem resposta")).toHaveCount(0);
    await expect(dono.locator(".mapa-vagas-card .live-dot")).toHaveText("SEM INTERNET");
  });

  await test.step("a conexão volta", async () => {
    await dono.context().setOffline(false);
    await expect(dono.locator(".aviso-conexao")).toContainText("Conexão de volta.");
    await expect(dono.getByText("Totem online")).toBeVisible();
    await expect(dono.locator(".mapa-vagas-card .live-dot")).toHaveText("AO VIVO");
    await expect(dono.locator(".aviso-conexao")).toHaveCount(0, { timeout: 8000 });
  });

  expect(dono.erros).toEqual([]);
});
