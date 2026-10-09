// Pátio de demonstração e totem simulado, usados pelo teste do fluxo completo
// (fluxo.spec.js) e pela demonstração sem internet (apresentacao.mjs). Tudo
// roda nos emuladores, com o projeto "demo-paraai" e as regras de verdade
// (firebase/firestore.rules); nada daqui alcança o Firebase de produção.
//
// O totem simulado faz as mesmas leituras e gravações do firmware
// (firmware/totem/Atendimento.cpp): escolha da vaga, entrada, saída com a
// cobrança e o sinal de vida. As contas são as do site (web/src/utils), que os
// contratos (contratos/) conferem contra as do firmware.
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { calcularCobranca, tarifaValida, TOLERANCIA_SALDO } from "../web/src/utils/cobranca.js";
import { placaValida } from "../web/src/utils/format.js";
import { obterTipoVaga } from "../web/src/utils/mapaVagas.js";
import { corVeiculoValida, nomeVeiculoValido } from "../web/src/utils/veiculo.js";

export const PROJETO = "demo-paraai";
const MAX_VAGAS = 200;
const DIREITOS = ["pcd", "idoso", "gestante"];

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
export async function prepararMotorista(env, motorista) {
  const { email, senha, nome, telefone, vagaEspecial = "", placa, marca, modelo, cor, recarga } = motorista;
  const uid = await criarConta({ email, senha, nome });
  const db = env.authenticatedContext(uid, { email }).firestore();
  const politica = await readFile(new URL("../web/src/services/conta.js", import.meta.url), "utf8");
  await setDoc(doc(db, "users", uid), {
    name: nome, email, telefone, role: "motorista",
    ...(vagaEspecial && { vagaEspecial }),
    privacidadeAceitaEm: serverTimestamp(),
    versaoPrivacidade: /VERSAO_PRIVACIDADE = "([^"]+)"/.exec(politica)[1],
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

const resposta = (tipo, titulo, detalhe = "", ajuda = "", carro = "") => ({ tipo, titulo, detalhe, ajuda, carro });
const emReais = (valor) => valor.toFixed(2).replace(".", ",");
const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

// Vaga da entrada, na ordem de escolherVaga (firmware/totem/LogicaTotem.h): a
// reservada pelo dono da placa; senão, para quem declarou direito, a primeira
// livre do tipo dele; senão, a primeira comum livre e sem reserva valendo.
function escolherVaga(vagas, capacidade, reservada, agora, direito) {
  if (reservada >= 1 && reservada <= capacidade && !vagas[reservada].usada) return reservada;
  const livre = (n, tipo) => !vagas[n].usada && vagas[n].tipo === tipo && vagas[n].reservadaAte <= agora;
  if (direito !== "comum") for (let n = 1; n <= capacidade; n++) if (livre(n, direito)) return n;
  for (let n = 1; n <= capacidade; n++) if (livre(n, "comum")) return n;
  return 0;
}

const contarLivres = (vagas, capacidade, agora) =>
  vagas.slice(1, capacidade + 1).filter((vaga) => !vaga.usada && vaga.reservadaAte <= agora).length;

// Campos da vaga do totem. Os que ficam de fora (modelo e cor na saída, a
// leitura física que não existe) são apagados, como a máscara do firmware.
const dadosDaVaga = (placa, modelo = "", cor = "") => ({
  placa,
  ocupada: placa !== "",
  origemOcupacao: "registro",
  leituraValida: deleteField(),
  modelo: modelo || deleteField(),
  cor: cor || deleteField(),
});

export function totemSimulado(env, { uid, estacionamentoId }) {
  const db = env.authenticatedContext(uid).firestore();
  const numeroDaVaga = (id) => {
    const n = Number(id);
    return Number.isInteger(n) && n >= 1 && n <= MAX_VAGAS && id === String(n) ? n : 0;
  };

  // Capacidade e tarifa do painel, reservas e tipos da projeção pública e
  // placas da vaga do totem. null quando o pátio está fora do formato.
  async function lerPatio() {
    const patio = (await getDoc(doc(db, "estacionamentos", estacionamentoId))).data();
    const capacidade = patio?.numVagas;
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > MAX_VAGAS ||
        !tarifaValida(patio.tarifaHora)) return null;
    const vagas = Array.from({ length: MAX_VAGAS + 1 }, (_, n) =>
      ({ usada: false, tipo: obterTipoVaga(undefined, n).tipo, reservadaAte: 0 }));
    for (const publica of (await getDocs(collection(db, "catalogoEstacionamentos", estacionamentoId, "vagas"))).docs) {
      const n = numeroDaVaga(publica.id);
      if (!n) continue;
      const { reservadaAte, tipo } = publica.data();
      vagas[n].reservadaAte = Number.isInteger(reservadaAte) && reservadaAte > 0 ? reservadaAte : 0;
      vagas[n].tipo = obterTipoVaga(tipo, n).tipo;
    }
    for (const operacional of (await getDocs(collection(db, "estacionamentos", estacionamentoId, "vagas"))).docs) {
      const n = numeroDaVaga(operacional.id);
      const { placa } = operacional.data();
      // Placa que não é texto: na dúvida a vaga não é oferecida.
      if (n) vagas[n].usada = placa !== undefined && (typeof placa !== "string" || placa !== "");
    }
    return { capacidade, tarifa: patio.tarifaHora, vagas };
  }

  // Reserva do app feita pelo dono da placa, ativa, deste pátio e válida por
  // mais 30 s. Qualquer outra situação é ignorada.
  async function vagaReservada(dono, agora) {
    if (!dono) return 0;
    const reserva = (await getDoc(doc(db, "reservas", dono))).data();
    const valida = reserva?.status === "ativa" && reserva.estacionamentoId === estacionamentoId &&
      Number.isInteger(reserva.vaga) && reserva.vaga >= 1 && reserva.vaga <= MAX_VAGAS &&
      Number.isInteger(reserva.expiraEm) && reserva.expiraEm > agora + 30;
    return valida ? reserva.vaga : 0;
  }

  // Lê o veículo. Na entrada, placa inédita é cadastrada sem dono, como o
  // CONFIRMAR da tela do totem.
  async function lerVeiculo(placa, cadastrar) {
    const ref = doc(db, "veiculos", placa);
    const snap = await getDoc(ref);
    if (snap.exists() || !cadastrar) return { ref, veiculo: snap.exists() ? snap.data() : null, placaNova: false };
    await setDoc(ref, {
      ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: "",
      tarifaHoraEntrada: 0, cadastradoNoTotem: true,
    });
    return { ref, veiculo: (await getDoc(ref)).data(), placaNova: true };
  }

  // segundosAtras: só para o teste ter uma estadia com tempo sem esperar. As
  // regras aceitam até 5 minutos de diferença no relógio do totem.
  async function entrada(placa, { segundosAtras = 0 } = {}) {
    if (!placaValida(placa)) return resposta("alerta", "CONFIRA A PLACA", placa);
    const { ref, veiculo, placaNova } = await lerVeiculo(placa, true);
    if (!Number.isInteger(veiculo.vagaAtual) || veiculo.vagaAtual < 0 || veiculo.vagaAtual > MAX_VAGAS ||
        !Number.isFinite(veiculo.saldo)) return resposta("erro", "CADASTRO INVALIDO", placa, "Procure o responsavel");
    if (veiculo.ativo !== true) return resposta("alerta", "CADASTRO INATIVO", placa, "Procure o responsavel");
    if (veiculo.vagaAtual !== 0 || veiculo.estacionamentoId)
      return resposta("alerta", "JA ESTA ESTACIONADO", placa, "Use SAIDA ao terminar");
    if (!(veiculo.saldo > -TOLERANCIA_SALDO))
      return resposta("alerta", "SALDO PENDENTE", placa, "Regularize no app para entrar");
    const agora = agoraEmSegundos();
    const reservada = await vagaReservada(veiculo.ownerUid, agora);
    const direito = DIREITOS.includes(veiculo.vagaEspecial) ? veiculo.vagaEspecial : "comum";
    // Modelo e cor fora do formato: nenhum dos dois, e a tela fica com a placa.
    let { modelo = "", cor = "" } = veiculo;
    if ((modelo && !nomeVeiculoValido(modelo)) || (cor && !corVeiculoValida(cor))) modelo = cor = "";
    const carro = modelo ? `${modelo}${cor ? ` ${cor}` : ""}`.toUpperCase() : "";
    const patio = await lerPatio();
    if (!patio) return resposta("erro", "VERIFIQUE O PAINEL", "Nada foi registrado", "Procure o responsavel");
    const vaga = escolherVaga(patio.vagas, patio.capacidade, reservada, agora, direito);
    if (!vaga) return resposta("alerta", "SEM VAGAS LIVRES", "Estacionamento lotado", "Tente mais tarde");
    const usouReserva = vaga === reservada;
    const lote = writeBatch(db);
    lote.update(ref, {
      vagaAtual: vaga, horaEntrada: agora - segundosAtras, estacionamentoId, tarifaHoraEntrada: patio.tarifa,
    });
    lote.set(doc(db, "estacionamentos", estacionamentoId, "vagas", String(vaga)),
      dadosDaVaga(placa, modelo, cor), { merge: true });
    lote.set(doc(db, "catalogoEstacionamentos", estacionamentoId, "vagas", String(vaga)),
      { ocupada: true, reservadaAte: 0 }, { merge: true });
    if (usouReserva) lote.update(doc(db, "reservas", veiculo.ownerUid), { status: "utilizada" });
    await lote.commit();
    return {
      ...resposta("sucesso", "ENTRADA CONFIRMADA", placa,
        `${usouReserva ? "Vaga reservada" : "Vaga"} ${vaga} - R$ ${emReais(patio.tarifa)}/h`, carro),
      vaga, reservada: usouReserva, placaNova,
    };
  }

  // Saída: a conta de web/src/utils/cobranca.js (a mesma do firmware), o
  // débito, a vaga livre e o recibo, juntos. Sem catraca, a saída sempre é
  // registrada; o que o saldo não cobre fica pendente.
  async function saida(placa) {
    if (!placaValida(placa)) return resposta("alerta", "CONFIRA A PLACA", placa);
    const { ref, veiculo } = await lerVeiculo(placa, false);
    if (!veiculo) return resposta("alerta", "PLACA SEM CADASTRO", placa, "Confira os caracteres");
    if (veiculo.ativo !== true) return resposta("alerta", "CADASTRO INATIVO", placa, "Procure o responsavel");
    if (!veiculo.vagaAtual) return resposta("alerta", "SEM ENTRADA ABERTA", placa, "Nenhuma saida a registrar");
    if (veiculo.estacionamentoId !== estacionamentoId)
      return resposta("alerta", "USE O OUTRO TOTEM", placa, "A entrada foi em outro local");
    const agora = agoraEmSegundos();
    const conta = calcularCobranca({
      entrada: veiculo.horaEntrada, saida: agora, tarifa: veiculo.tarifaHoraEntrada, saldo: veiculo.saldo,
    });
    if (!conta) return resposta("erro", "ESTADIA INCONSISTENTE", "Confira horario e tarifa", "Procure o responsavel");
    const refVaga = doc(db, "estacionamentos", estacionamentoId, "vagas", String(veiculo.vagaAtual));
    const vaga = await getDoc(refVaga);
    if (!vaga.exists() || vaga.data().placa !== placa)
      return resposta("erro", "VAGA INCONSISTENTE", "Saida nao registrada", "Procure o responsavel");
    const recibo = {
      placa, vaga: veiculo.vagaAtual, entrada: veiculo.horaEntrada, saida: agora,
      duracaoMinutos: conta.duracaoMinutos, valorCobrado: conta.valor, valorPendente: conta.pendente,
      tarifaHora: veiculo.tarifaHoraEntrada, estacionamentoId,
    };
    const lote = writeBatch(db);
    lote.update(ref, {
      vagaAtual: 0, horaEntrada: 0, estacionamentoId: "", tarifaHoraEntrada: 0, saldo: conta.saldoFinal,
    });
    lote.set(refVaga, dadosDaVaga(""), { merge: true });
    lote.set(doc(db, "historico", `${placa}_${veiculo.horaEntrada}`), recibo);
    lote.set(doc(db, "catalogoEstacionamentos", estacionamentoId, "vagas", String(veiculo.vagaAtual)),
      { ocupada: false }, { merge: true });
    await lote.commit();
    const minutos = `${conta.duracaoMinutos} min`;
    const final = conta.pendente >= TOLERANCIA_SALDO
      ? resposta("alerta", "SAIDA COM PENDENCIA", `R$ ${emReais(conta.valor)} em ${minutos}`, `Regularize no app - ${placa}`)
      : resposta("sucesso", "SAIDA CONFIRMADA", `R$ ${emReais(conta.valor)}`, `${minutos} - ${placa}`);
    return { ...final, recibo, saldoFinal: conta.saldoFinal };
  }

  // Sinal de vida (heartbeat do firmware, a cada 60 s): é por ele que os
  // painéis mostram o totem online e a vitrine conta as vagas livres.
  async function sinal() {
    const patio = await lerPatio();
    if (!patio) return false;
    const agora = agoraEmSegundos();
    const disponibilidade = {
      ultimaAtualizacao: agora,
      vagasLivres: contarLivres(patio.vagas, patio.capacidade, agora),
      vagasEmOperacao: patio.capacidade,
    };
    await updateDoc(doc(db, "estacionamentos", estacionamentoId), {
      ...disponibilidade, tarifaAplicadaTotem: patio.tarifa, modoTotem: "atendimento",
      vagasSuportadasTotem: deleteField(),
    });
    await updateDoc(doc(db, "catalogoEstacionamentos", estacionamentoId), disponibilidade);
    return true;
  }

  // Mapa do pátio para a tela da demonstração.
  async function vagas() {
    const patio = await lerPatio();
    if (!patio) return [];
    const placas = new Map((await getDocs(collection(db, "estacionamentos", estacionamentoId, "vagas"))).docs
      .map((vaga) => [numeroDaVaga(vaga.id), vaga.data().placa || ""]));
    const agora = agoraEmSegundos();
    return patio.vagas.slice(1, patio.capacidade + 1).map((vaga, indice) => ({
      numero: indice + 1,
      tipo: vaga.tipo,
      placa: placas.get(indice + 1) || "",
      reservadaAte: vaga.reservadaAte > agora ? vaga.reservadaAte : 0,
    }));
  }

  return { entrada, saida, sinal, vagas };
}
