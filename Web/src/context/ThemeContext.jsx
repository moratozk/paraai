import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

// Padrão consagrado de Context + hook no mesmo arquivo; o aviso do
// react-refresh só afeta o hot-reload em desenvolvimento, não a aplicação.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Padrão: escuro ("asfalto à noite" é o tema-assinatura da identidade)
    return localStorage.getItem("para-ai-theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("para-ai-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
