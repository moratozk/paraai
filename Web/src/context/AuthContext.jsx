import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
  // Evita tentar o auto-reparo do documento do usuário mais de 1x por uid
  const reparoTentado = useRef(new Set());

  // role: "motorista" (padrão) ou "operador" (dono de estacionamento)
  async function register(name, email, password, role = "motorista") {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    try {
      await updateProfile(cred.user, { displayName: name });
    } catch (err) {
      console.error("Aviso: falha ao atualizar perfil:", err);
    }

    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email,
        role,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Aviso: falha ao criar documento do usuário:", err);
    }

    return cred;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
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
          // bloqueavam escrita ficaram sem documento (e sem papel). Se o
          // documento não existe, recria a partir do Auth — assim a conta
          // volta a funcionar sozinha no próximo acesso.
          if (!snap.exists() && !reparoTentado.current.has(currentUser.uid)) {
            reparoTentado.current.add(currentUser.uid);
            setDoc(
              doc(db, "users", currentUser.uid),
              {
                name: currentUser.displayName || null,
                email: currentUser.email || null,
                role: "motorista",
                createdAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((err) =>
              console.error("Auto-reparo do perfil falhou:", err)
            );
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
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
