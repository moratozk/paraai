import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
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

export const auth = getAuth(app);
export const db = getFirestore(app);

// Teste do fluxo completo (e2e/): com estas duas variáveis o site usa os
// emuladores locais. Só vale para projeto de demonstração ("demo-..."), que o
// Firebase nunca liga a dados reais. O site publicado não tem nenhuma delas.
const emuladorAuth = import.meta.env.VITE_EMULADOR_AUTH;
const emuladorFirestore = import.meta.env.VITE_EMULADOR_FIRESTORE;
if (firebaseConfig.projectId?.startsWith("demo-") && emuladorAuth && emuladorFirestore) {
  connectAuthEmulator(auth, `http://${emuladorAuth}`, { disableWarnings: true });
  const [host, porta] = emuladorFirestore.split(":");
  connectFirestoreEmulator(db, host, Number(porta));
}

export default app;
