import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";

const AuthContext = createContext();

// Padrão consagrado de Context + hook no mesmo arquivo; o aviso do
// react-refresh só afeta o hot-reload em desenvolvimento, não a aplicação.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Sinaliza que o Firestore recusou acesso (regras não publicadas). Sem
  // isso o problema fica só no console e parece "bug do site".
  const [erroPermissao, setErroPermissao] = useState(false);
  // Evita tentar o auto-reparo do documento do usuário mais de 1x por uid
  const reparoTentado = useRef(new Set());
  // Suprime o auto-reparo enquanto um cadastro está em andamento: durante o
  // cadastro o documento AINDA não existe, e o reparo competiria com as
  // escritas do próprio cadastro (ver comentário no auto-reparo abaixo).
  const cadastroEmAndamento = useRef(false);

  // role: "motorista" (padrão) ou "operador" (dono de estacionamento)
  async function register(name, email, password, role = "motorista", telefone = "") {
    cadastroEmAndamento.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      try {
        await updateProfile(cred.user, { displayName: name });
      } catch (err) {
        console.error("Aviso: falha ao atualizar perfil:", err);
      }

      // Esta escrita é ESSENCIAL (define o papel da conta). Se ela falhar,
      // desfazemos também a conta do Authentication. Sem esse rollback o
      // e-mail fica ocupado, embora o cadastro não tenha sido concluído.
      try {
        await setDoc(doc(db, "users", cred.user.uid), {
          name,
          email,
          telefone,
          role,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        let cadastroRevertido = false;
        try {
          await deleteUser(cred.user);
          cadastroRevertido = true;
        } catch (rollbackErr) {
          console.error("Falha ao desfazer conta incompleta:", rollbackErr);
          await signOut(auth).catch(() => undefined);
        }

        const falha = new Error(err?.message || "Não foi possível salvar o perfil.");
        falha.code = err?.code;
        falha.cadastroRevertido = cadastroRevertido;
        falha.cause = err;
        throw falha;
      }

      return cred;
    } finally {
      cadastroEmAndamento.current = false;
    }
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  // O `url` abaixo é o destino após a redefinição. Para o link do e-mail abrir
  // em /redefinir-senha, configure essa página como manipulador da ação no
  // template de recuperação de senha do Firebase Authentication.
  function recuperarSenha(email) {
    auth.languageCode = "pt-BR";
    return sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    });
  }

  // Confere se o código de recuperação é válido; devolve o e-mail dono dele
  function validarCodigoSenha(codigo) {
    return verifyPasswordResetCode(auth, codigo);
  }

  // Efetiva a troca de senha usando o código do e-mail
  function redefinirSenhaComCodigo(codigo, novaSenha) {
    return confirmPasswordReset(auth, codigo, novaSenha);
  }

  // ---- Gestão da conta (todas exigem senha atual por segurança) ----

  // O Firebase exige "login recente" para operações sensíveis. Em vez de
  // deslogar o usuário, pedimos a senha atual e reautenticamos na hora.
  async function reautenticar(senhaAtual) {
    const u = auth.currentUser;
    if (!u?.email) throw new Error("Sessão inválida. Entre novamente.");
    const cred = EmailAuthProvider.credential(u.email, senhaAtual);
    await reauthenticateWithCredential(u, cred);
  }

  async function alterarPerfil({ nome, telefone }) {
    const u = auth.currentUser;
    if (!u) throw new Error("Sessão inválida. Entre novamente.");

    const dados = {};
    if (nome !== undefined) dados.name = nome;
    if (telefone !== undefined) dados.telefone = telefone;

    if (nome !== undefined && nome !== u.displayName) {
      await updateProfile(u, { displayName: nome });
    }
    await setDoc(doc(db, "users", u.uid), dados, { merge: true });

    // força o contexto a refletir já, sem esperar um novo snapshot
    setUser({ ...u });
    setUserData((atual) =>
      atual ? { ...atual, ...(nome !== undefined && { name: nome }), ...(telefone !== undefined && { telefone }) } : atual
    );
  }

  async function alterarSenha(senhaAtual, novaSenha) {
    await reautenticar(senhaAtual);
    await updatePassword(auth.currentUser, novaSenha);
  }

  // Envia confirmação para o NOVO endereço; a troca só se efetiva quando o
  // usuário clica no link. Isso evita alguém trocar para um e-mail inválido
  // (ou de terceiros) e perder o acesso à conta.
  async function alterarEmail(senhaAtual, novoEmail) {
    await reautenticar(senhaAtual);
    await verifyBeforeUpdateEmail(auth.currentUser, novoEmail);
  }

  useEffect(() => {
    let unsubDoc = null;

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!currentUser) {
        setUserData(null);
        setLoading(false);
        return;
      }

      // Listener em tempo real no documento do usuário: quando a placa é
      // cadastrada no Perfil, todas as páginas enxergam na hora.
      unsubDoc = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};

          // AUTO-REPARO: contas criadas enquanto as regras do Firestore
          // bloqueavam escrita ficaram sem documento. Se o documento não
          // existe, recria o básico a partir do Auth.
          //
          // NUNCA grava "role" aqui. Este callback dispara assim que a conta
          // é criada - antes de o cadastro terminar de gravar o documento -
          // então gravar role:"motorista" aqui competia com a escrita do
          // cadastro e podia sobrescrever um cadastro de OPERADOR (o papel
          // vencedor dependia de qual escrita chegasse por último). O papel
          // já tem fallback "motorista" na derivação abaixo, então o reparo
          // não precisa - e não pode - opinar sobre ele.
          if (
            !snap.exists() &&
            !cadastroEmAndamento.current &&
            !reparoTentado.current.has(currentUser.uid)
          ) {
            reparoTentado.current.add(currentUser.uid);
            setDoc(
              doc(db, "users", currentUser.uid),
              {
                name: currentUser.displayName || null,
                email: currentUser.email || null,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((err) => {
              console.error("Auto-reparo do perfil falhou:", err);
              if (`${err?.code || ""}`.includes("permission")) {
                setErroPermissao(true);
              }
            });
          }

          setUserData({
            ...data,
            name: currentUser.displayName || data.name || null,
            email: currentUser.email || data.email || null,
            photoURL: currentUser.photoURL || data.photoURL || null,
            // Papel derivado: quem tem estacionamento é operador, mesmo que
            // o campo role tenha se perdido num cadastro com erro.
            role: data.role || (data.estacionamentoId ? "operador" : "motorista"),
          });
          setLoading(false);
        },
        (err) => {
          console.error("Erro ao observar dados do usuário:", err);
          if (`${err?.code || ""}`.includes("permission")) {
            setErroPermissao(true);
          }
          setUserData(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const value = {
    user,
    userData,
    register,
    login,
    logout,
    recuperarSenha,
    validarCodigoSenha,
    redefinirSenhaComCodigo,
    alterarPerfil,
    alterarSenha,
    alterarEmail,
    erroPermissao,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
