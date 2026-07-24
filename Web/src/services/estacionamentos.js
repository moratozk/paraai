// =========================================================================
// Serviços de estacionamento: o ParaAí é um provedor de software+hardware,
// cada cliente (dono de estacionamento) tem o seu documento em
// estacionamentos/{id}. O totem físico instalado no pátio é "pareado" com
// esse id via ESTACIONAMENTO_ID no Credenciais.h do firmware.
// =========================================================================

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// Id curto e legível (ex.: EST-7K2M4A) - fácil de digitar no Credenciais.h
function gerarIdEstacionamento() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sufixo = "";
  for (let i = 0; i < 6; i++) {
    sufixo += chars[Math.floor(Math.random() * chars.length)];
  }
  return `EST-${sufixo}`;
}

export async function criarEstacionamento({ uid, nome, cidade, numVagas, tarifaHora }) {
  let id = gerarIdEstacionamento();
  // colisão é improvável, mas custa uma leitura conferir
  if ((await getDoc(doc(db, "estacionamentos", id))).exists()) {
    id = gerarIdEstacionamento();
  }

  await setDoc(doc(db, "estacionamentos", id), {
    nome,
    cidade,
    numVagas: Number(numVagas) || 4,
    tarifaHora: Number(tarifaHora) || 5,
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
