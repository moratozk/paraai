// =========================================================================
// Serviços de estacionamento: o ParaAí é um provedor de software+hardware,
// cada cliente (dono de estacionamento) tem o seu documento em
// estacionamentos/{id}. O totem físico instalado no pátio é "pareado" com
// esse id via ESTACIONAMENTO_ID no Credenciais.h do firmware.
// =========================================================================

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { obterTipoVaga, tipoVagaValido } from "../utils/mapaVagas";

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

  if (typeof estacionamento.ativo === "boolean") {
    dados.ativo = estacionamento.ativo;
  }

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

export async function criarEstacionamentoAdmin({
  uid,
  nome,
  numVagas,
  tarifaHora = TARIFA_PADRAO,
  cep = "",
  logradouro = "",
  numero = "",
  bairro = "",
  cidade = "",
  uf = "",
}) {
  const perfil = await getDoc(doc(db, "users", uid));
  if (!perfil.exists() || perfil.data().role !== "admin") {
    throw new Error("Apenas administradores podem cadastrar estacionamentos.");
  }

  const vagas = Number(numVagas);
  const hora = Number(tarifaHora);
  if (!String(nome || "").trim()) throw new Error("Informe o nome.");
  if (!Number.isInteger(vagas) || vagas < 1 || vagas > 200) {
    throw new Error("Número de vagas deve ser de 1 a 200.");
  }
  if (!Number.isFinite(hora) || hora < 0) throw new Error("Tarifa por hora inválida.");

  let id = gerarIdEstacionamento();
  while ((await getDoc(doc(db, "estacionamentos", id))).exists()) {
    id = gerarIdEstacionamento();
  }

  const estacionamento = {
    nome: String(nome).trim(),
    numVagas: vagas,
    tarifaHora: hora,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    uf,
    ativo: true,
    ownerUid: uid,
    criadoPorAdmin: uid,
    criadoEm: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "estacionamentos", id), estacionamento);
  batch.set(doc(db, "catalogoEstacionamentos", id), dadosPublicos(estacionamento));
  await batch.commit();
  return id;
}

export async function atualizarEstacionamentoAdmin(estId, campos) {
  if (!estId) throw new Error("Estacionamento inválido.");
  const atualSnap = await getDoc(doc(db, "estacionamentos", estId));
  if (!atualSnap.exists()) throw new Error("Estacionamento não encontrado.");

  const dados = { atualizadoEm: serverTimestamp() };
  const texto = ["nome", "cep", "logradouro", "numero", "bairro", "cidade", "uf"];
  for (const campo of texto) {
    if (campos[campo] !== undefined) dados[campo] = String(campos[campo]).trim();
  }
  if (campos.nome !== undefined && !dados.nome) throw new Error("Informe o nome.");
  if (campos.numVagas !== undefined) {
    const vagas = Number(campos.numVagas);
    if (!Number.isInteger(vagas) || vagas < 1 || vagas > 200) {
      throw new Error("Número de vagas deve ser de 1 a 200.");
    }
    dados.numVagas = vagas;
  }
  if (campos.tarifaHora !== undefined) {
    const tarifa = Number(campos.tarifaHora);
    if (!Number.isFinite(tarifa) || tarifa < 0) throw new Error("Tarifa por hora inválida.");
    dados.tarifaHora = tarifa;
  }
  // Tarifa por minuto da versão anterior: removida, o totem cobra por hora.
  dados.tarifaMinuto = deleteField();
  if (campos.ativo !== undefined) dados.ativo = Boolean(campos.ativo);

  const combinado = { ...atualSnap.data(), ...campos };
  const dadosCatalogo = {
    ...dadosPublicos(combinado),
    atualizadoEm: serverTimestamp(),
  };
  dadosCatalogo.tarifaMinuto = deleteField();

  const batch = writeBatch(db);
  batch.update(doc(db, "estacionamentos", estId), dados);
  batch.set(doc(db, "catalogoEstacionamentos", estId), dadosCatalogo, {
    merge: true,
  });
  await batch.commit();
}

// Publica o mapa do app a partir das vagas do totem. Grava também o tipo de
// cada vaga (inclusive os padrões da demonstração), porque o totem só deixa
// vagas especiais para quem as reservou e lê o tipo deste documento. A
// reserva (reservadaAte) é do app e não é tocada aqui.
export async function publicarMapaVagas(estId) {
  if (!estId) throw new Error("Estacionamento inválido.");

  const estacionamentoRef = doc(db, "estacionamentos", estId);
  const [estacionamentoSnap, vagasSnap, publicasSnap] = await Promise.all([
    getDoc(estacionamentoRef),
    getDocs(collection(db, "estacionamentos", estId, "vagas")),
    getDocs(collection(db, "catalogoEstacionamentos", estId, "vagas")),
  ]);

  if (!estacionamentoSnap.exists()) {
    throw new Error("Estacionamento não encontrado.");
  }

  const estacionamento = estacionamentoSnap.data();
  const numVagas = Math.max(1, Number(estacionamento.numVagas) || 1);
  const vagasOcupadas = new Set();
  vagasSnap.forEach((vaga) => {
    const numero = Number(vaga.id);
    if (numero >= 1 && numero <= numVagas && String(vaga.data().placa || "") !== "") {
      vagasOcupadas.add(numero);
    }
  });
  const tiposPublicados = {};
  publicasSnap.forEach((vaga) => {
    tiposPublicados[vaga.id] = vaga.data().tipo;
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
      {
        ocupada: vagasOcupadas.has(numero),
        tipo: obterTipoVaga(tiposPublicados[String(numero)], numero).tipo,
      },
      { merge: true }
    );
  }
  await batch.commit();

  return disponibilidade.vagasLivresMapeadas;
}

// Classificação editável pelo administrador. O tipo fica no documento
// operacional e na projeção pública, sem alterar ocupação, placa ou reserva.
export async function atualizarTipoVagaAdmin({ estId, numero, tipo }) {
  const numeroVaga = Number(numero);
  if (!estId || !Number.isInteger(numeroVaga) || numeroVaga < 1 || numeroVaga > 200) {
    throw new Error("Vaga inválida.");
  }
  if (!tipoVagaValido(tipo)) throw new Error("Tipo de vaga inválido.");

  const vagaPublicaRef = doc(
    db,
    "catalogoEstacionamentos",
    estId,
    "vagas",
    String(numeroVaga)
  );
  const vagaPublica = await getDoc(vagaPublicaRef);
  if (vagaPublica.exists()) {
    await updateDoc(vagaPublicaRef, { tipo });
  } else {
    // Primeira classificação de uma vaga ainda fora do mapa público.
    const vagaOperacional = await getDoc(
      doc(db, "estacionamentos", estId, "vagas", String(numeroVaga))
    );
    const ocupada = vagaOperacional.exists() && String(vagaOperacional.data().placa || "") !== "";
    await setDoc(vagaPublicaRef, { ocupada, tipo });
  }
  return tipo;
}
