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
  serverTimestamp,
  writeBatch,
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

function dadosPublicos(estacionamento) {
  const tarifa = Number(estacionamento.tarifaHora);
  const dados = {
    nome: String(estacionamento.nome || "").trim(),
    numVagas: Number(estacionamento.numVagas) || 4,
    tarifaHora: Number.isFinite(tarifa) && tarifa >= 0 ? tarifa : TARIFA_PADRAO,
    cep: estacionamento.cep || "",
    logradouro: estacionamento.logradouro || "",
    numero: estacionamento.numero || "",
    bairro: estacionamento.bairro || "",
    cidade: estacionamento.cidade || "",
    uf: estacionamento.uf || "",
  };

  for (const campo of ["ultimaAtualizacao", "vagasLivres", "vagasEmOperacao"]) {
    const valor = Number(estacionamento[campo]);
    if (Number.isFinite(valor) && valor >= 0) dados[campo] = valor;
  }

  return dados;
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
  const perfil = await getDoc(doc(db, "users", uid));
  if (!perfil.exists() || perfil.data().role !== "operador") {
    throw new Error(
      "Apenas contas criadas como dono de estacionamento podem cadastrar um estacionamento."
    );
  }

  let id = gerarIdEstacionamento();
  // colisão é improvável, mas custa uma leitura conferir
  if ((await getDoc(doc(db, "estacionamentos", id))).exists()) {
    id = gerarIdEstacionamento();
  }

  const estacionamento = {
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
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "estacionamentos", id), estacionamento);
  batch.set(doc(db, "catalogoEstacionamentos", id), dadosPublicos(estacionamento));
  batch.set(
    doc(db, "users", uid),
    { estacionamentoId: id, role: "operador" },
    { merge: true }
  );
  await batch.commit();

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

  const atual = await getDoc(doc(db, "estacionamentos", estId));
  if (!atual.exists()) throw new Error("Estacionamento não encontrado.");

  const batch = writeBatch(db);
  batch.update(doc(db, "estacionamentos", estId), dados);
  batch.set(
    doc(db, "catalogoEstacionamentos", estId),
    {
      ...dadosPublicos({ ...atual.data(), ...campos }),
      atualizadoEm: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

// Também funciona como migração: ao abrir o painel, estacionamentos antigos
// ganham sua vitrine pública sem copiar ownerUid, códigos ou credenciais.
export function sincronizarCatalogo(estacionamento) {
  if (!estacionamento?.id) return Promise.resolve();
  return setDoc(
    doc(db, "catalogoEstacionamentos", estacionamento.id),
    { ...dadosPublicos(estacionamento), atualizadoEm: serverTimestamp() },
    { merge: true }
  );
}
