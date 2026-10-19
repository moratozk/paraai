import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, firebaseConfig, ligarAuthAoEmulador } from "../firebase/firebaseConfig";
import { gerarCodigoInstalacao } from "../utils/codigoInstalacao";

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
  // Sessão só na memória: a conta do totem não fica guardada no navegador
  // de quem a criou depois que o app temporário é apagado.
  const authTemporario = ligarAuthAoEmulador(
    initializeAuth(appTemporario, { persistence: inMemoryPersistence })
  );
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

// Instalação por código: o totem novo cria a própria conta e, com o código
// digitado na tela dele, grava o próprio cadastro e apaga o código (ver
// firebase/firestore.rules). A senha do totem não passa pelo site.
export function observarCodigosInstalacao(estId, aoAtualizar, aoFalhar) {
  const consulta = query(
    collection(db, "codigosInstalacao"),
    where("estacionamentoId", "==", estId)
  );

  return onSnapshot(
    consulta,
    { includeMetadataChanges: true },
    (snapshot) => {
      aoAtualizar(
        snapshot.docs.map((item) => {
          // Logo depois de gravar, a hora do servidor ainda não voltou: estimativa.
          const dados = item.data({ serverTimestamps: "estimate" });
          return {
            ...dados,
            codigo: item.id,
            criadoEmMs: dados.criadoEm?.toMillis?.() || Date.now(),
            // Ainda a caminho do servidor (sem internet, por exemplo): no
            // totem, seria recusado.
            pendente: item.metadata.hasPendingWrites,
          };
        })
      );
    },
    aoFalhar
  );
}

// Um código por vez: os anteriores do pátio saem antes (um que já saiu, por
// uso ou vencimento, não impede o novo). As regras não deixam regravar um
// código que já existe; se o sorteio repetir um, sorteia outro.
export async function criarCodigoInstalacao({ estId, nome, nomeEstacionamento, anteriores = [] }) {
  await Promise.all(anteriores.map((codigo) => cancelarCodigoInstalacao(codigo).catch(() => {})));
  for (let tentativa = 1; ; tentativa++) {
    const codigo = gerarCodigoInstalacao();
    try {
      await setDoc(doc(db, "codigosInstalacao", codigo), {
        estacionamentoId: estId,
        nome: String(nome).trim().slice(0, 40) || "Totem principal",
        nomeEstacionamento: String(nomeEstacionamento || "").trim().slice(0, 60) || "Estacionamento",
        criadoEm: serverTimestamp(),
      });
      return codigo;
    } catch (erro) {
      if (erro?.code !== "permission-denied" || tentativa >= 3) throw erro;
    }
  }
}

export function cancelarCodigoInstalacao(codigo) {
  return deleteDoc(doc(db, "codigosInstalacao", codigo));
}
