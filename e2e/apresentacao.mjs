// Demonstração sem internet, o plano B da apresentação (docs/apresentacao.md):
// o site neste computador, ligado aos emuladores com as regras de verdade, com
// contas prontas, estadias dos últimos dias e o totem simulado neste terminal.
// Rode com "npm run apresentacao" em e2e/. Cada vez começa do zero, e nada
// daqui vai para o Firebase de produção.
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { formatarMoeda, normalizarPlaca } from "../web/src/utils/format.js";
import { TIPOS_VAGA } from "../web/src/utils/mapaVagas.js";
import {
  abrirEmuladores,
  criarConta,
  lerSemRegras,
  prepararAdministrador,
  prepararMotorista,
  prepararPatio,
  registrarEstadiasAnteriores,
  totemSimulado,
} from "./patio.js";

const PORTA = 5180;
const SENHA = "Banca2026";
const EST = "EST-BANCA";
const NOME_EST = "Pátio da Banca";
const TARIFA = 8.5;
const TOTEM = { uid: "totem-banca", nome: "Totem da entrada", email: "totem-banca@dispositivo.paraai.test" };
const ADMIN = { nome: "Administração ParaAí", email: "admin@paraai.test" };
const DONO = { nome: "Otávio Lima", email: "dono@paraai.test" };
// Marina e Antônio são as contas da apresentação; as outras dão movimento ao
// pátio. Antônio declarou direito a vaga 60+, e o totem o leva para a 9.
const MOTORISTAS = [
  { nome: "Marina Alves", email: "marina@paraai.test", telefone: "(19) 99123-4567", placa: "TCC2E26",
    marca: "Volkswagen", modelo: "Gol", cor: "prata", recarga: { valor: 50, forma: "pix" } },
  { nome: "Antônio Souza", email: "antonio@paraai.test", telefone: "(19) 98877-6655", vagaEspecial: "idoso",
    placa: "BRA2E19", marca: "Fiat", modelo: "Uno", cor: "branco", recarga: { valor: 30, forma: "cartao" } },
  { nome: "Beatriz Costa", email: "beatriz@paraai.test", telefone: "(19) 99765-4321", placa: "FTC1A23",
    marca: "Chevrolet", modelo: "Onix", cor: "vermelho", recarga: { valor: 80, forma: "pix" } },
  { nome: "Carlos Mendes", email: "carlos@paraai.test", telefone: "(19) 99654-3210", placa: "QRS4B56",
    marca: "Hyundai", modelo: "HB20", cor: "preto", recarga: { valor: 60, forma: "pix" } },
];
// Estadias encerradas: dias atrás, hora da entrada, minutos, placa e vaga. A
// GHI7J89 não tem conta nem saldo: a saída ficou pendente, e o totem recusa a
// próxima entrada dela até alguém regularizar.
const ESTADIAS = [
  [6, "08:10", 95, "TCC2E26", 3], [6, "13:40", 50, "FTC1A23", 4], [5, "09:05", 130, "QRS4B56", 5],
  [5, "18:20", 35, "FTC1A23", 3], [4, "07:55", 60, "BRA2E19", 9], [4, "12:10", 45, "QRS4B56", 6],
  [3, "10:30", 160, "FTC1A23", 7], [3, "17:45", 25, "GHI7J89", 8], [2, "08:40", 75, "QRS4B56", 3],
  [2, "14:15", 40, "TCC2E26", 4], [1, "09:20", 110, "FTC1A23", 5], [1, "16:05", 55, "BRA2E19", 9],
  [0, "07:30", 70, "QRS4B56", 6], [0, "09:10", 45, "FTC1A23", 4],
];

// Horas de Brasília (UTC-3, sem horário de verão desde 2019), qualquer que
// seja o fuso deste computador.
const BRASILIA = -3 * 3600;
function emSegundos(diasAtras, hora) {
  const [h, m] = hora.split(":").map(Number);
  const relogio = new Date((Math.floor(Date.now() / 1000) + BRASILIA) * 1000);
  relogio.setUTCDate(relogio.getUTCDate() - diasAtras);
  relogio.setUTCHours(h, m, 0, 0);
  return relogio.getTime() / 1000 - BRASILIA;
}

// ---- Site -----------------------------------------------------------------

let site;

function iniciarSite() {
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestore = process.env.FIRESTORE_EMULATOR_HOST;
  site = spawn(`npm run dev -- --host 127.0.0.1 --port ${PORTA} --strictPort`, {
    cwd: fileURLToPath(new URL("../web/", import.meta.url)),
    // Os mesmos valores de demonstração do teste (playwright.config.js): valem
    // mais que um web/.env com o projeto real.
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
      VITE_FIREBASE_PROJECT_ID: "demo-paraai",
      VITE_FIREBASE_APP_ID: "demo-app",
      VITE_EMULADOR_AUTH: auth,
      VITE_EMULADOR_FIRESTORE: firestore,
    },
    shell: true,
    stdio: ["ignore", "ignore", "pipe"],
    // Fora do Windows, num grupo próprio, para encerrar o Vite junto.
    detached: process.platform !== "win32",
  });
  let erros = "";
  site.stderr.on("data", (parte) => (erros += parte));
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 60_000;
    const conferir = async () => {
      if (site.exitCode !== null) return reject(new Error(`O site não abriu:\n${erros}`));
      try {
        if ((await fetch(`http://127.0.0.1:${PORTA}/`)).ok) return resolve();
      } catch {
        // Ainda subindo.
      }
      if (Date.now() > limite) return reject(new Error("O site não respondeu em 60 s."));
      setTimeout(conferir, 500);
    };
    conferir();
  });
}

function encerrarSite() {
  if (!site || site.exitCode !== null) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(site.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-site.pid, "SIGTERM");
  } catch {
    // Já tinha saído.
  }
}
process.on("exit", encerrarSite);

// ---- Terminal -------------------------------------------------------------

const rotuloDoTipo = (tipo) => (TIPOS_VAGA[tipo] || TIPOS_VAGA.comum).rotulo;
const hora = (segundos) => new Date(segundos * 1000)
  .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function mostrarTela(resposta) {
  const linhas = [resposta.titulo, [resposta.detalhe, resposta.carro].filter(Boolean).join(" · "), resposta.ajuda];
  console.log("");
  for (const linha of linhas.filter(Boolean)) console.log(`   ${linha}`);
  if (resposta.placaNova) console.log("   (placa nova: cadastrada no totem, sem dono)");
  console.log("");
}

async function mostrarVagas(totem) {
  console.log("");
  for (const vaga of await totem.vagas()) {
    const situacao = vaga.placa || (vaga.reservadaAte ? `reservada até ${hora(vaga.reservadaAte)}` : "livre");
    console.log(`   ${String(vaga.numero).padStart(2, "0")}  ${rotuloDoTipo(vaga.tipo).padEnd(8)} ${situacao}`);
  }
  console.log("");
}

async function mostrarContas(env) {
  const saldo = async (placa) => formatarMoeda((await lerSemRegras(env, `veiculos/${placa}`)).saldo);
  const [marina, antonio] = MOTORISTAS;
  console.log(`
Site: http://127.0.0.1:${PORTA}  (abra no navegador deste computador)

Contas, todas com a senha ${SENHA}:
  Administração   ${ADMIN.email.padEnd(21)} painel da rede, vagas ao vivo e maquete
  Dono do pátio   ${DONO.email.padEnd(21)} mapa do ${NOME_EST} e movimentações
  Motorista       ${marina.email.padEnd(21)} ${marina.placa}, ${marina.modelo} ${marina.cor}, saldo ${await saldo(marina.placa)}
  Motorista 60+   ${antonio.email.padEnd(21)} ${antonio.placa}, ${antonio.modelo} ${antonio.cor}, saldo ${await saldo(antonio.placa)}
  No cadastro ao vivo, use qualquer e-mail (por exemplo banca@paraai.test).

Totem do ${NOME_EST}, simulado aqui com as gravações do firmware:
  entrada PLACA   registra a entrada (usa a vaga reservada no app, se houver)
  saida PLACA     registra a saída e a cobrança
  vagas           mostra o pátio
  contas          mostra esta lista
  sair            encerra a demonstração
  A GHI7J89 ficou com uma estadia pendente: a entrada dela é recusada.
`);
}

async function preparar() {
  console.log("Preparando a demonstração...");
  const env = await abrirEmuladores();
  await prepararAdministrador(env, { ...ADMIN, senha: SENHA });
  const donoUid = await criarConta({ ...DONO, senha: SENHA });
  await prepararPatio(env, {
    id: EST,
    nome: NOME_EST,
    tarifa: TARIFA,
    // Doze vagas com os tipos da tabela padrão: 1 e 2 PCD, 9 e 11 60+, 10 gestante.
    tipos: ["pcd", "pcd", "comum", "comum", "comum", "comum", "comum", "comum", "idoso", "gestante", "idoso", "comum"],
    endereco: {
      cep: "13469-111", logradouro: "Rua Emílio de Menezes", numero: "s/n",
      bairro: "Vila Amorim", cidade: "Americana", uf: "SP",
    },
    dono: { uid: donoUid, ...DONO },
    totem: TOTEM,
  });
  for (const motorista of MOTORISTAS) await prepararMotorista(env, { ...motorista, senha: SENHA });
  // Só o que já terminou: estadias de hoje com saída até meia hora atrás.
  const limite = Math.floor(Date.now() / 1000) - 30 * 60;
  await registrarEstadiasAnteriores(env, {
    estacionamentoId: EST,
    tarifa: TARIFA,
    estadias: ESTADIAS.map(([dias, inicio, minutos, placa, vaga]) => ({
      placa, vaga, minutos, entrada: emSegundos(dias, inicio),
    })).filter((estadia) => estadia.entrada + estadia.minutos * 60 <= limite),
  });
  return env;
}

async function main() {
  const env = await preparar();
  const totem = totemSimulado(env, { uid: TOTEM.uid, estacionamentoId: EST });
  await totem.sinal();
  // Sinal de vida a cada minuto, como o firmware: o totem aparece online.
  const sinal = setInterval(() => totem.sinal().catch((erro) => console.error(`Sinal do totem: ${erro.message}`)), 60_000);
  await iniciarSite();
  await mostrarContas(env);

  const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: "totem> " });
  let ocupado = Promise.resolve();
  let encerrando = false;
  const encerrar = async () => {
    if (encerrando) return;
    encerrando = true;
    clearInterval(sinal);
    encerrarSite();
    await env.cleanup();
    console.log("\nDemonstração encerrada.");
    process.exit(0);
  };
  terminal.on("SIGINT", () => terminal.close());
  terminal.on("close", () => ocupado.finally(encerrar));
  terminal.on("line", (linha) => {
    ocupado = ocupado.then(async () => {
      const [comando = "", ...resto] = linha.trim().toLowerCase().split(/\s+/);
      const placa = normalizarPlaca(resto.join(""));
      try {
        if (["entrada", "e"].includes(comando)) mostrarTela(await totem.entrada(placa));
        else if (["saida", "saída", "s"].includes(comando)) mostrarTela(await totem.saida(placa));
        else if (["vagas", "v"].includes(comando)) await mostrarVagas(totem);
        else if (["contas", "ajuda", "?"].includes(comando)) await mostrarContas(env);
        else if (["sair", "fim"].includes(comando)) return terminal.close();
        else if (comando) console.log("   Comandos: entrada PLACA, saida PLACA, vagas, contas, sair.");
      } catch (erro) {
        // Como no totem: nada foi registrado quando a gravação é recusada.
        console.log(`\n   OPERACAO RECUSADA\n   Nada foi registrado (${erro.code || erro.message})\n`);
      }
      terminal.prompt();
    });
  });
  terminal.prompt();
}

main().catch((erro) => {
  console.error(erro);
  encerrarSite();
  process.exit(1);
});
