import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { recarregarQuandoSairVersaoNova, registrarServiceWorker } from "./pwa";
import "./index.css";

recarregarQuandoSairVersaoNova();
registrarServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
