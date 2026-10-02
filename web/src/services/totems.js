import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, firebaseConfig } from "../firebase/firebaseConfig";

function bytesAleatorios(tamanho) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

function gerarSenhaTotem() {
  return `Pa!${bytesAleatorios(12)}9z`;
}

function gerarEmailTotem(estId) {
  const patio = estId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `totem-${patio}-${bytesAleatorios(4)}@dispositivo.paraai.app`;
}

export function observarTotems(estId, aoAtualizar, aoFalhar) {
  const consulta = query(
    collection(db, "totems"),
    where("estacionamentoId", "==", estId)
  );

  return onSnapshot(
    consulta,
    (snapshot) => {
      const itens = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      itens.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
      aoAtualizar(itens);
    },
    aoFalhar
  );
}

export async function criarCredencialTotem({ estId, nome = "Totem principal" }) {
  const email = gerarEmailTotem(estId);
  const senha = gerarSenhaTotem();
  const appTemporario = initializeApp(
    firebaseConfig,
    `provisionar-totem-${Date.now()}-${bytesAleatorios(2)}`
  );
  const authTemporario = getAuth(appTemporario);
  let conta;

  try {
    conta = await createUserWithEmailAndPassword(authTemporario, email, senha);
    await setDoc(doc(db, "totems", conta.user.uid), {
      estacionamentoId: estId,
      nome: String(nome).trim() || "Totem principal",
      email,
      ativo: true,
      criadoEm: serverTimestamp(),
    });

    return { uid: conta.user.uid, email, senha };
  } catch (erro) {
    if (conta?.user) {
      try {
        await deleteUser(conta.user);
      } catch (rollbackErro) {
        console.error("Não foi possível remover a conta incompleta do totem:", rollbackErro);
      }
    }
    throw erro;
  } finally {
    await deleteApp(appTemporario);
  }
}

export function definirTotemAtivo(totemUid, ativo) {
  return updateDoc(doc(db, "totems", totemUid), {
    ativo: Boolean(ativo),
    atualizadoEm: serverTimestamp(),
  });
}
