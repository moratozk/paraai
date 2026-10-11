import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { recarregarQuandoSairVersaoNova, registrarServiceWorker } from "./pwa";
// Fontes da marca servidas pelo próprio site (ver index.css).
import "@fontsource/anton/400.css";
import "@fontsource-variable/archivo/wght.css";
import "@fontsource-variable/archivo/wght-italic.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";

recarregarQuandoSairVersaoNova();
registrarServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
