import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

// Padrão consagrado de Context + hook no mesmo arquivo; o aviso do
// react-refresh só afeta o hot-reload em desenvolvimento, não a aplicação.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}

// Em janela anônima ou com dados bloqueados o armazenamento pode falhar; o
// tema então vale só nesta visita.
function temaSalvo() {
  try {
    return localStorage.getItem("para-ai-theme");
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }) {
  // Padrão: escuro ("asfalto à noite" é o tema-assinatura da identidade)
  const [theme, setTheme] = useState(() => temaSalvo() || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("para-ai-theme", theme);
    } catch {
      // Sem armazenamento: segue funcionando, só não lembra na próxima visita.
    }
  }, [theme]);

  // Trocar o tema de uma vez é um salto de brilho na tela inteira. Com View
  // Transitions o navegador faz um crossfade curto; quem pediu menos
  // movimento (ou navegador sem suporte) recebe a troca direta.
  function toggleTheme() {
    const novo = theme === "light" ? "dark" : "light";
    const aplicar = () => {
      document.documentElement.setAttribute("data-theme", novo);
      setTheme(novo);
    };
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !semMovimento) document.startViewTransition(aplicar);
    else aplicar();
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
