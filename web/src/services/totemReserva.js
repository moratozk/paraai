// Totem reserva: um notebook, tablet ou celular faz o papel do totem quando a
// placa falha. Ele se instala como um totem novo, pelo código de 8 letras do
// Perfil, com uma conta própria (nunca a de uma pessoa) guardada só neste
// navegador, num app do Firebase à parte. Assim, a conta de quem estiver
// usando o site no mesmo aparelho continua a mesma, e as regras tratam o
// aparelho exatamente como tratam a placa.
import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import * as firestore from "firebase/firestore";
import { firebaseConfig, ligarAuthAoEmulador, ligarFirestoreAoEmulador } from "../firebase/firebaseConfig";
import { criarAtendimentoTotem, vincularTotemPorCodigo } from "../utils/totemAtendimento";

const NOME_APP = "totem-reserva";
let instancia = null;

function abrir() {
  if (instancia) return instancia;
  const app = getApps().find((item) => item.name === NOME_APP) || initializeApp(firebaseConfig, NOME_APP);
  instancia = {
    auth: ligarAuthAoEmulador(initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })),
    db: ligarFirestoreAoEmulador(firestore.getFirestore(app)),
  };
  return instancia;
}

function aleatorio(tamanho) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

async function lerCadastro(uid) {
  const { db } = abrir();
  const totem = (await firestore.getDoc(firestore.doc(db, "totems", uid))).data();
  if (!totem?.ativo || !totem.estacionamentoId) return null;
  let nomeEstacionamento = "";
  try {
    const catalogo = await firestore.getDoc(firestore.doc(db, "catalogoEstacionamentos", totem.estacionamentoId));
    nomeEstacionamento = catalogo.data()?.nome || "";
  } catch {
    // Sem o nome, a tela mostra só o do totem.
  }
  return { uid, estacionamentoId: totem.estacionamentoId, nome: totem.nome || "Totem reserva", nomeEstacionamento };
}

// Chama aoMudar com null (aparelho sem totem instalado), com o cadastro do
// totem ou com { erro } quando não deu para ler.
export function observarTotemReserva(aoMudar) {
  const { auth } = abrir();
  return onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) return aoMudar(null);
    try {
      aoMudar(await lerCadastro(usuario.uid));
    } catch (erro) {
      aoMudar({ erro });
    }
  });
}

// Mesmos passos do firmware: cria a conta do aparelho e grava o próprio
// cadastro com o código. Se o código for recusado, a conta criada sai.
export async function instalarTotemReserva(codigo) {
  const { auth, db } = abrir();
  const email = `totem-reserva-${aleatorio(4)}@dispositivo.paraai.app`;
  const conta = await createUserWithEmailAndPassword(auth, email, `Pa!${aleatorio(12)}9z`);
  try {
    await vincularTotemPorCodigo(firestore, db, { uid: conta.user.uid, email, codigo });
  } catch (erro) {
    await deleteUser(conta.user).catch(() => signOut(auth));
    throw erro;
  }
  return lerCadastro(conta.user.uid);
}

// Tira o totem reserva deste navegador. O cadastro continua na lista de
// totens do Perfil, onde o dono pode desativá-lo.
export function desinstalarTotemReserva() {
  return signOut(abrir().auth);
}

export function atendimentoDoTotemReserva(estacionamentoId) {
  return criarAtendimentoTotem(firestore, abrir().db, estacionamentoId);
}
