import { createContext, useCallback, useContext, useRef, useState } from "react";
import "./Toast.css";

const ToastContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext);
}

const DURACAO_MS = 4200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const proximoId = useRef(1);

  const remover = useCallback((id) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (texto, tipo = "info") => {
      const id = proximoId.current++;
      setToasts((atuais) => [...atuais, { id, texto, tipo }]);
      setTimeout(() => remover(id), DURACAO_MS);
      return id;
    },
    [remover]
  );

  const toast = {
    sucesso: (texto) => mostrar(texto, "sucesso"),
    erro: (texto) => mostrar(texto, "erro"),
    info: (texto) => mostrar(texto, "info"),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.tipo === "sucesso" ? "✓" : t.tipo === "erro" ? "!" : "i"}
            </span>
            <span className="toast-texto">{t.texto}</span>
            <button
              className="toast-fechar"
              onClick={() => remover(t.id)}
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
