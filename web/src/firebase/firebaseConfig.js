import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// O mesmo que getAuth(app), menos o suporte a entrar com Google por janela ou
// redirecionamento, que o site não usa. Sem ele, o celular não baixa o
// script de apis.google.com e a página escondida do login a cada visita.
// A sessão continua guardada no mesmo lugar (IndexedDB, como antes).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
export const db = getFirestore(app);

// Teste do fluxo completo e demonstração sem internet (e2e/): com estas duas
// variáveis o site usa os emuladores locais. Só vale para projeto de
// demonstração ("demo-..."), que o Firebase nunca liga a dados reais. O site
// publicado não tem nenhuma delas.
const emuladorAuth = import.meta.env.VITE_EMULADOR_AUTH;
const emuladorFirestore = import.meta.env.VITE_EMULADOR_FIRESTORE;
const usaEmuladores = Boolean(
  firebaseConfig.projectId?.startsWith("demo-") && emuladorAuth && emuladorFirestore
);

// Também para o login de um app à parte, como o que cria o acesso do totem.
export function ligarAuthAoEmulador(instancia) {
  if (usaEmuladores) connectAuthEmulator(instancia, `http://${emuladorAuth}`, { disableWarnings: true });
  return instancia;
}

// O mesmo para o banco de um app à parte, como o do totem reserva.
export function ligarFirestoreAoEmulador(instancia) {
  if (usaEmuladores) {
    const [host, porta] = emuladorFirestore.split(":");
    connectFirestoreEmulator(instancia, host, Number(porta));
  }
  return instancia;
}

ligarAuthAoEmulador(auth);
ligarFirestoreAoEmulador(db);

export default app;
