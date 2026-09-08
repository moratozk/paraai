// =========================================================================
// Serviços de estacionamento: o ParaAí é um provedor de software+hardware,
// cada cliente (dono de estacionamento) tem o seu documento em
// estacionamentos/{id}. O totem físico instalado no pátio é "pareado" com
// esse id via ESTACIONAMENTO_ID no Credenciais.h do firmware.
// =========================================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
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

  if (estacionamento.modoDisponibilidade === "mapa") {
    dados.modoDisponibilidade = "mapa";
    const vagasLivresMapeadas = Number(estacionamento.vagasLivresMapeadas);
    if (Number.isFinite(vagasLivresMapeadas) && vagasLivresMapeadas >= 0) {
      dados.vagasLivresMapeadas = vagasLivresMapeadas;
    }
    if (estacionamento.ultimaAtualizacaoMapa) {
      dados.ultimaAtualizacaoMapa = estacionamento.ultimaAtualizacaoMapa;
    }
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

// Publica a disponibilidade calculada pelo mapa manual. Documentos de vaga
// ainda inexistentes representam vagas livres, como no painel do operador.
// Os campos ficam separados do heartbeat para um totem com menos sensores não
// sobrescrever a disponibilidade das 20 vagas mapeadas da demonstração.
export async function publicarMapaVagas(estId) {
  if (!estId) throw new Error("Estacionamento inválido.");

  const estacionamentoRef = doc(db, "estacionamentos", estId);
  const [estacionamentoSnap, vagasSnap] = await Promise.all([
    getDoc(estacionamentoRef),
    getDocs(collection(db, "estacionamentos", estId, "vagas")),
  ]);

  if (!estacionamentoSnap.exists()) {
    throw new Error("Estacionamento não encontrado.");
  }

  const estacionamento = estacionamentoSnap.data();
  const numVagas = Math.max(1, Number(estacionamento.numVagas) || 1);
  const vagasOcupadas = new Set();
  vagasSnap.forEach((vaga) => {
    const numero = Number(vaga.id);
    if (numero >= 1 && numero <= numVagas && vaga.data().ocupada === true) {
      vagasOcupadas.add(numero);
    }
  });

  const disponibilidade = {
    modoDisponibilidade: "mapa",
    vagasLivresMapeadas: Math.max(0, numVagas - vagasOcupadas.size),
    ultimaAtualizacaoMapa: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(estacionamentoRef, disponibilidade, { merge: true });
  batch.set(
    doc(db, "catalogoEstacionamentos", estId),
    {
      ...dadosPublicos({ ...estacionamento, ...disponibilidade }),
      ...disponibilidade,
      atualizadoEm: serverTimestamp(),
    },
    { merge: true }
  );
  for (let numero = 1; numero <= numVagas; numero += 1) {
    batch.set(
      doc(db, "catalogoEstacionamentos", estId, "vagas", String(numero)),
      { ocupada: vagasOcupadas.has(numero) },
      { merge: true }
    );
  }
  await batch.commit();

  return disponibilidade.vagasLivresMapeadas;
}

// Controle manual usado na apresentação e em contingência quando o pátio não
// está com os sensores ligados. A subcoleção já é observada por onSnapshot,
// portanto todos os painéis abertos refletem a mudança imediatamente.
export async function atualizarVagaManual({ estId, numero, ocupada, placa = "" }) {
  const numeroVaga = Number(numero);
  if (!estId || !Number.isInteger(numeroVaga) || numeroVaga < 1 || numeroVaga > 200) {
    throw new Error("Vaga inválida.");
  }

  await setDoc(doc(db, "estacionamentos", estId, "vagas", String(numeroVaga)), {
    ocupada: Boolean(ocupada),
    placa: ocupada ? String(placa || "").trim().toUpperCase() : "",
  });
  return publicarMapaVagas(estId);
}
