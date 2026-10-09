// Teste do fluxo completo no navegador (ver fluxo.spec.js). Rode com
// "npm test": o "firebase emulators:exec" abre os emuladores e passa os
// endereços deles nestas variáveis, e o site sobe apontando para eles.
import { defineConfig, devices } from "@playwright/test";

const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestore = process.env.FIRESTORE_EMULATOR_HOST;
if (!auth || !firestore) {
  throw new Error("Rode com npm test: este teste só usa os emuladores locais.");
}

const PORTA = 5180;

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORTA} --strictPort`,
    cwd: "../web",
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: false,
    timeout: 60_000,
    // Valores de demonstração: valem mais que um web/.env com o projeto real,
    // e o site só liga os emuladores para projeto "demo-...".
    env: {
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
      VITE_FIREBASE_PROJECT_ID: "demo-paraai",
      VITE_FIREBASE_APP_ID: "demo-app",
      VITE_EMULADOR_AUTH: auth,
      VITE_EMULADOR_FIRESTORE: firestore,
    },
  },
});
