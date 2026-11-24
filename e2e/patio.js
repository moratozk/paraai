// Pátio de demonstração e totem simulado, usados pelo teste do fluxo completo
// (fluxo.spec.js) e pela demonstração sem internet (apresentacao.mjs). Tudo
// roda nos emuladores, com o projeto "demo-paraai" e as regras de verdade
// (firebase/firestore.rules); nada daqui alcança o Firebase de produção.
//
// O totem simulado faz as mesmas leituras e gravações do firmware
// (firmware/totem/Atendimento.cpp): escolha da vaga, entrada, saída com a
// cobrança e o sinal de vida. É o atendimento do totem reserva do site
// (web/src/utils/totemAtendimento.js), com as contas de web/src/utils, que os
// contratos (contratos/) conferem contra as do firmware.
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as firestore from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { calcularCobranca } from "../web/src/utils/cobranca.js";
import { criarAtendimentoTotem, vincularTotemPorCodigo } from "../web/src/utils/totemAtendimento.js";

export const PROJETO = "demo-paraai";

function emulador(variavel) {
  const endereco = process.env[variavel];
  if (!endereco) throw new Error("Rode pelos emuladores: npm test ou npm run apresentacao, em e2e/.");
  return endereco;
}
const auth = () => `http://${emulador("FIREBASE_AUTH_EMULATOR_HOST")}`;

// Emuladores vazios, com as regras do repositório carregadas.
export async function abrirEmuladores() {
  const [host, porta] = emulador("FIRESTORE_EMULATOR_HOST").split(":");
  const env = await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: {
      host,
      port: Number(porta),
      rules: await readFile(new URL("../firebase/firestore.rules", import.meta.url), "utf8"),
    },
  });
  await env.clearFirestore();
  await fetch(`${auth()}/emulator/v1/projects/${PROJETO}/accounts`, { method: "DELETE" });
  return env;
}

async function contaNoAuth(acao, corpo) {
  const resposta = await fetch(`${auth()}/identitytoolkit.googleapis.com/v1/accounts:${acao}?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...corpo, returnSecureToken: true }),
  });
  const dados = await resposta.json();
  if (!dados.localId) throw new Error(`Conta ${corpo.email}: ${JSON.stringify(dados)}`);
  return dados.localId;
}

export const criarConta = ({ email, senha, nome }) =>
  contaNoAuth("signUp", { email, password: senha, displayName: nome });
export const uidDaConta = (email, senha) => contaNoAuth("signInWithPassword", { email, password: senha });

export async function lerSemRegras(env, caminho) {
  let dados = null;
  await env.withSecurityRulesDisabled(async (contexto) => {
    const snap = await getDoc(doc(contexto.firestore(), caminho));
    dados = snap.exists() ? snap.data() : null;
  });
  return dados;
}

// Administrador da rede. Esse papel só nasce pelo console do Firebase, nunca
// pelo site: aqui, direto no banco.
export async function prepararAdministrador(env, { email, senha, nome }) {
  const uid = await criarConta({ email, senha, nome });
  await env.withSecurityRulesDisabled((contexto) =>
    setDoc(doc(contexto.firestore(), "users", uid), { name: nome, email, role: "admin", createdAt: Timestamp.now() }));
  return uid;
}

// Estacionamento com o mapa de vagas, o dono (conta de operador) e um totem
// pareado. tipos[0] é a vaga 1.
export async function prepararPatio(env, { id, nome, tarifa, tipos, endereco, dono, totem }) {
  await env.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    const agora = Timestamp.now();
    const publico = {
      nome, numVagas: tipos.length, tarifaHora: tarifa, ativo: true, ...endereco,
      modoDisponibilidade: "mapa", vagasLivresMapeadas: tipos.length,
    };
    const lote = writeBatch(db);
    lote.set(doc(db, "users", dono.uid), {
      name: dono.nome, email: dono.email, role: "operador", estacionamentoId: id, createdAt: agora,
    });
    lote.set(doc(db, "estacionamentos", id), { ...publico, ownerUid: dono.uid, criadoEm: agora });
    lote.set(doc(db, "catalogoEstacionamentos", id), {
      ...publico, ultimaAtualizacaoMapa: agora, atualizadoEm: agora,
    });
    tipos.forEach((tipo, indice) => {
      const vaga = String(indice + 1);
      lote.set(doc(db, "estacionamentos", id, "vagas", vaga),
        { ocupada: false, placa: "", origemOcupacao: "registro" });
      lote.set(doc(db, "catalogoEstacionamentos", id, "vagas", vaga),
        { ocupada: false, tipo, reservadaAte: 0 });
    });
    lote.set(doc(db, "totems", totem.uid), {
      estacionamentoId: id, nome: totem.nome, email: totem.email, ativo: true, criadoEm: agora,
    });
    await lote.commit();
  });
}

// Motorista pronto para a demonstração, gravado pela própria conta e pelas
// regras, como o site faz: perfil com o aceite da política, placa, modelo e
// cor e uma recarga simulada.
// Versão da política de privacidade que o cadastro do site grava no aceite.
async function versaoDaPolitica() {
  const conta = await readFile(new URL("../web/src/services/conta.js", import.meta.url), "utf8");
  return /VERSAO_PRIVACIDADE = "([^"]+)"/.exec(conta)[1];
}

export async function prepararMotorista(env, motorista) {
  const { email, senha, nome, telefone, vagaEspecial = "", placa, marca, modelo, cor, recarga } = motorista;
  const uid = await criarConta({ email, senha, nome });
  const db = env.authenticatedContext(uid, { email }).firestore();
  await setDoc(doc(db, "users", uid), {
    name: nome, email, telefone, role: "motorista",
    ...(vagaEspecial && { vagaEspecial }),
    privacidadeAceitaEm: serverTimestamp(),
    versaoPrivacidade: await versaoDaPolitica(),
    createdAt: serverTimestamp(),
  });
  const veiculo = doc(db, "veiculos", placa);
  const cadastro = writeBatch(db);
  cadastro.set(veiculo, {
    ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: "", tarifaHoraEntrada: 0,
    ownerUid: uid, ...(vagaEspecial && { vagaEspecial }), atualizadoEm: serverTimestamp(),
  });
  cadastro.set(doc(db, "users", uid), { placa }, { merge: true });
  await cadastro.commit();
  const descricao = Object.fromEntries(Object.entries({ marca, modelo, cor }).filter(([, valor]) => valor));
  if (Object.keys(descricao).length) await updateDoc(veiculo, { ...descricao, atualizadoEm: serverTimestamp() });
  if (recarga) {
    const registro = doc(collection(veiculo, "recargas"));
    const credito = writeBatch(db);
    credito.set(registro, { valor: recarga.valor, forma: recarga.forma, uid, criadaEm: serverTimestamp() });
    credito.update(veiculo, {
      saldo: increment(recarga.valor), ultimaRecarga: registro.id, atualizadoEm: serverTimestamp(),
    });
    await credito.commit();
  }
  return uid;
}

// Quem pediu para pôr um estacionamento na rede e espera a administração: a
// conta nasce como "candidato" e o pedido fica pendente, gravados como no
// cadastro do site e conferidos pelas regras.
export async function prepararPedido(env, { email, senha, nome, telefone, estacionamento }) {
  const uid = await criarConta({ email, senha, nome });
  const db = env.authenticatedContext(uid, { email }).firestore();
  await setDoc(doc(db, "users", uid), {
    name: nome, email, telefone, role: "candidato",
    privacidadeAceitaEm: serverTimestamp(),
    versaoPrivacidade: await versaoDaPolitica(),
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "pedidosEstacionamento", uid), {
    status: "pendente", nome, email, telefone, ...estacionamento,
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  });
  return uid;
}

// Estadias já encerradas, para os painéis não começarem vazios. Cada recibo é
// o que o totem gravaria na saída (mesma conta), e o saldo da placa desce
// junto, como no débito de verdade.
export async function registrarEstadiasAnteriores(env, { estacionamentoId, tarifa, estadias }) {
  const emOrdem = [...estadias].sort((a, b) => a.entrada - b.entrada);
  await env.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    for (const { placa, vaga, entrada, minutos } of emOrdem) {
      const veiculo = (await getDoc(doc(db, "veiculos", placa))).data();
      const saldo = veiculo?.saldo ?? 0;
      const conta = calcularCobranca({ entrada, saida: entrada + minutos * 60, tarifa, saldo });
      const lote = writeBatch(db);
      lote.set(doc(db, "historico", `${placa}_${entrada}`), {
        placa, vaga, entrada, saida: entrada + minutos * 60, duracaoMinutos: conta.duracaoMinutos,
        valorCobrado: conta.valor, valorPendente: conta.pendente, tarifaHora: tarifa, estacionamentoId,
      });
      lote.set(doc(db, "veiculos", placa), veiculo ? { saldo: conta.saldoFinal } : {
        ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: conta.saldoFinal, estacionamentoId: "",
        tarifaHoraEntrada: 0, cadastradoNoTotem: true,
      }, { merge: true });
      await lote.commit();
    }
  });
}

// ---- Totem simulado ------------------------------------------------------
// O atendimento é o mesmo do totem reserva do site
// (web/src/utils/totemAtendimento.js), aqui com a conta do totem no emulador.

// Totem novo instalado pelo código do site, como o firmware faz (vincularConta
// em firmware/totem/Atendimento.cpp): cria a própria conta, lê o código e
// grava o próprio cadastro com ele, e o código sai no mesmo lote.
export async function instalarTotemPorCodigo(env, { email, senha, codigo }) {
  const uid = await contaNoAuth("signUp", { email, password: senha });
  const db = env.authenticatedContext(uid, { email }).firestore();
  const { estacionamentoId, nomeEstacionamento } = await vincularTotemPorCodigo(firestore, db, { uid, email, codigo });
  return { uid, estacionamentoId, nomeEstacionamento };
}

export function totemSimulado(env, { uid, estacionamentoId }) {
  return criarAtendimentoTotem(firestore, env.authenticatedContext(uid).firestore(), estacionamentoId);
}
