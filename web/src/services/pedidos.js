// =========================================================================
// Pedido para pôr um estacionamento na rede. Quem tem um pátio cria no
// cadastro uma conta "candidato" e manda o pedido; a administração aprova
// (o estacionamento nasce no nome da pessoa, que vira dona) ou recusa com o
// motivo, e a pessoa corrige e reenvia. As regras ficam em
// firebase/firestore.rules (pedidoDoCandidatoValido e vizinhas).
// =========================================================================

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";
import { cepCompleto, formatarCep } from "./cep";
import { dadosPublicos, idLivreDeEstacionamento } from "./estacionamentos";
import { lerValorEmReais, telefoneValido } from "../utils/format";

const COLECAO = "pedidosEstacionamento";
export const LIMITE_MENSAGEM = 500;
export const LIMITE_MOTIVO = 300;

// O que falta ou está errado no formulário; null quando dá para enviar.
// `endereco` é o que a busca do CEP achou ({ logradouro, bairro, cidade, uf }).
export function problemaNoPedido(dados) {
  const vagas = Number(dados.numVagas);
  const tarifa = lerValorEmReais(dados.tarifaHora);
  if (!String(dados.nome || "").trim()) return "Informe o seu nome.";
  if (!telefoneValido(dados.telefone)) {
    return "Informe um celular válido com DDD. Ex.: (41) 99999-8888";
  }
  if (!String(dados.nomeEstacionamento || "").trim()) return "Informe o nome do estacionamento.";
  if (!cepCompleto(dados.cep) || !dados.endereco?.cidade || !dados.endereco?.uf) {
    return "Informe um CEP válido para localizar o endereço.";
  }
  if (!String(dados.numero || "").trim()) return "Informe o número do endereço.";
  if (!Number.isInteger(vagas) || vagas < 1 || vagas > 200) {
    return "Informe um número de vagas entre 1 e 200.";
  }
  if (!Number.isFinite(tarifa) || tarifa < 0 || tarifa > 10000) {
    return "Informe o preço da hora em reais, como 8,50.";
  }
  if (String(dados.mensagem || "").length > LIMITE_MENSAGEM) {
    return `A mensagem pode ter até ${LIMITE_MENSAGEM} caracteres.`;
  }
  return null;
}

// Campos que a própria pessoa grava. O e-mail é o da conta: as regras
// conferem com o do login, para a resposta chegar a quem pediu.
function camposDoPedido(dados) {
  const mensagem = String(dados.mensagem || "").trim();
  return {
    status: "pendente",
    nome: String(dados.nome || "").trim(),
    email: auth.currentUser?.email || "",
    telefone: String(dados.telefone || ""),
    nomeEstacionamento: String(dados.nomeEstacionamento).trim(),
    cep: formatarCep(dados.cep),
    logradouro: dados.endereco.logradouro || "",
    numero: String(dados.numero).trim(),
    bairro: dados.endereco.bairro || "",
    cidade: dados.endereco.cidade,
    uf: dados.endereco.uf,
    numVagas: Number(dados.numVagas),
    tarifaHora: lerValorEmReais(dados.tarifaHora),
    ...(mensagem && { mensagem }),
    atualizadoEm: serverTimestamp(),
  };
}

export function enviarPedido(uid, dados) {
  return setDoc(doc(db, COLECAO, uid), {
    ...camposDoPedido(dados),
    criadoEm: serverTimestamp(),
  });
}

// Corrige um pedido que espera ou reenvia um recusado (volta a esperar,
// sem o motivo da recusa).
export function corrigirPedido(uid, dados) {
  const campos = camposDoPedido(dados);
  return updateDoc(doc(db, COLECAO, uid), {
    ...campos,
    ...(!campos.mensagem && { mensagem: deleteField() }),
    motivoRecusa: deleteField(),
    analisadoEm: deleteField(),
  });
}

export function desistirDoPedido(uid) {
  return deleteDoc(doc(db, COLECAO, uid));
}

export function observarPedido(uid, aoMudar, aoFalhar) {
  return onSnapshot(
    doc(db, COLECAO, uid),
    (snap) => aoMudar(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    aoFalhar
  );
}

// Painel da rede: os pedidos que esperam resposta, o mais antigo primeiro.
export function observarPedidosPendentes(aoMudar, aoFalhar) {
  return onSnapshot(
    query(collection(db, COLECAO), where("status", "==", "pendente")),
    (snap) => {
      const itens = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      itens.sort((a, b) => (a.criadoEm?.toMillis?.() || 0) - (b.criadoEm?.toMillis?.() || 0));
      aoMudar(itens);
    },
    aoFalhar
  );
}

export async function recusarPedido(uid, motivo) {
  const texto = String(motivo || "").trim();
  if (!texto) throw new Error("Diga o motivo para quem pediu poder corrigir.");
  if (texto.length > LIMITE_MOTIVO) {
    throw new Error(`O motivo pode ter até ${LIMITE_MOTIVO} caracteres.`);
  }
  await updateDoc(doc(db, COLECAO, uid), {
    status: "recusado",
    motivoRecusa: texto,
    analisadoEm: serverTimestamp(),
  });
}

// Aprovação num lote só (as regras recusam qualquer parte sozinha): o
// estacionamento novo no nome de quem pediu, já publicado para os
// motoristas, a conta virando dona dele e o pedido marcado como aprovado.
export async function aprovarPedido(adminUid, pedido) {
  const id = await idLivreDeEstacionamento();
  const estacionamento = {
    nome: pedido.nomeEstacionamento,
    numVagas: pedido.numVagas,
    tarifaHora: pedido.tarifaHora,
    cep: pedido.cep,
    logradouro: pedido.logradouro,
    numero: pedido.numero,
    bairro: pedido.bairro,
    cidade: pedido.cidade,
    uf: pedido.uf,
    ativo: true,
    ownerUid: pedido.id,
    criadoPorAdmin: adminUid,
    criadoEm: serverTimestamp(),
  };

  const lote = writeBatch(db);
  lote.set(doc(db, "estacionamentos", id), estacionamento);
  lote.set(doc(db, "catalogoEstacionamentos", id), dadosPublicos(estacionamento));
  lote.update(doc(db, "users", pedido.id), { role: "operador", estacionamentoId: id });
  lote.update(doc(db, COLECAO, pedido.id), {
    status: "aprovado",
    estacionamentoId: id,
    analisadoEm: serverTimestamp(),
  });
  await lote.commit();
  return id;
}
