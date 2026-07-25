// =========================================================================
// Serviços de estacionamento: o ParaAí é um provedor de software+hardware,
// cada cliente (dono de estacionamento) tem o seu documento em
// estacionamentos/{id}. O totem físico instalado no pátio é "pareado" com
// esse id via ESTACIONAMENTO_ID no Credenciais.h do firmware.
// =========================================================================

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// Tarifa padrão usada até o dono definir a dele no painel.
export const TARIFA_PADRAO = 5;

// Id curto e legível (ex.: EST-7K2M4A) - fácil de digitar no Credenciais.h
function gerarIdEstacionamento() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sufixo = "";
  for (let i = 0; i < 6; i++) {
    sufixo += chars[Math.floor(Math.random() * chars.length)];
  }
  return `EST-${sufixo}`;
}

export async function criarEstacionamento({
  uid,
  nome,
  numVagas,
  // A tarifa não é pedida no cadastro: entra com o padrão e o dono ajusta
  // no painel quando quiser (ver atualizarConfiguracao).
  tarifaHora = TARIFA_PADRAO,
  cep = "",
  logradouro = "",
  numero = "",
  bairro = "",
  cidade = "",
  uf = "",
}) {
  let id = gerarIdEstacionamento();
  // colisão é improvável, mas custa uma leitura conferir
  if ((await getDoc(doc(db, "estacionamentos", id))).exists()) {
    id = gerarIdEstacionamento();
  }

  await setDoc(doc(db, "estacionamentos", id), {
    nome,
    numVagas: Number(numVagas) || 4,
    tarifaHora: Number(tarifaHora) || 5,
    // endereço (preenchido via CEP no cadastro)
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    uf,
    ownerUid: uid,
    criadoEm: serverTimestamp(),
  });

  await setDoc(
    doc(db, "users", uid),
    { estacionamentoId: id, role: "operador" },
    { merge: true }
  );

  return id;
}

// Ajustes que o dono faz depois, direto no painel (tarifa, nº de vagas,
// nome). Só grava os campos informados.
export async function atualizarConfiguracao(estId, campos) {
  const dados = { atualizadoEm: serverTimestamp() };

  if (campos.tarifaHora !== undefined) {
    const t = Number(campos.tarifaHora);
    if (!Number.isFinite(t) || t < 0) {
      throw new Error("Tarifa inválida.");
    }
    dados.tarifaHora = t;
  }

  if (campos.numVagas !== undefined) {
    const v = Number(campos.numVagas);
    if (!Number.isInteger(v) || v < 1 || v > 200) {
      throw new Error("Número de vagas deve ser de 1 a 200.");
    }
    dados.numVagas = v;
  }

  if (campos.nome !== undefined) {
    if (!String(campos.nome).trim()) {
      throw new Error("O nome não pode ficar vazio.");
    }
    dados.nome = String(campos.nome).trim();
  }

  await updateDoc(doc(db, "estacionamentos", estId), dados);
}
