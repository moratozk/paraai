// =========================================================================
// Reserva de vaga pelo app. A reserva é gratuita e segura a vaga por 30
// minutos; a cobrança começa só quando o totem registra a entrada da placa.
// Ao chegar, o totem usa a vaga reservada. Sem reserva, ele escolhe a vaga.
// As regras do Firestore conferem a vaga, o veículo e a validade.
// =========================================================================

import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export const DURACAO_RESERVA_S = 30 * 60;

function agoraEmSegundos() {
  return Math.floor(Date.now() / 1000);
}

export function reservaAtiva(reserva, agora = agoraEmSegundos()) {
  return Boolean(reserva && reserva.status === "ativa" && Number(reserva.expiraEm) > agora);
}

export async function reservarVaga({ uid, placa, estacionamentoId, vaga }) {
  const numero = Number(vaga);
  if (!uid || !placa || !estacionamentoId || !Number.isInteger(numero)) {
    throw new Error("Escolha uma vaga e confira a placa cadastrada.");
  }
  const criadaEm = agoraEmSegundos();
  const expiraEm = criadaEm + DURACAO_RESERVA_S;
  const batch = writeBatch(db);
  batch.set(doc(db, "reservas", uid), {
    ownerUid: uid,
    placa,
    estacionamentoId,
    vaga: numero,
    criadaEm,
    expiraEm,
    status: "ativa",
  });
  batch.update(doc(db, "catalogoEstacionamentos", estacionamentoId, "vagas", String(numero)), {
    reservadaAte: expiraEm,
  });
  try {
    await batch.commit();
  } catch (err) {
    console.error("Falha ao reservar vaga:", err);
    throw new Error(
      "Não foi possível reservar. A vaga pode ter acabado de ser ocupada ou reservada; atualize o mapa e tente outra.",
      { cause: err }
    );
  }
  return { vaga: numero, expiraEm };
}

// Libera a vaga só se ela ainda carrega esta reserva: depois que uma reserva
// vence, outra pessoa pode ter reservado a mesma vaga.
export async function cancelarReserva({ uid, reserva }) {
  if (!uid || !reserva) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "reservas", uid), { status: "cancelada" });
  const vagaRef = doc(
    db,
    "catalogoEstacionamentos",
    reserva.estacionamentoId,
    "vagas",
    String(reserva.vaga)
  );
  const vaga = await getDoc(vagaRef);
  if (vaga.exists() && Number(vaga.data().reservadaAte) === Number(reserva.expiraEm)) {
    batch.update(vagaRef, { reservadaAte: 0 });
  }
  try {
    await batch.commit();
  } catch (err) {
    console.error("Falha ao cancelar reserva:", err);
    throw new Error("Não foi possível cancelar a reserva agora. Tente novamente.", {
      cause: err,
    });
  }
}
