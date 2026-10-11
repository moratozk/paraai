import { useEffect } from "react";

const TITULO_PADRAO = "ParaAí — Tecnologia para estacionamentos";

// Nome da página na aba do navegador, no histórico e no que o leitor de tela
// anuncia ao trocar de página ("Meus acessos · ParaAí"). Sem nome, ou ao sair
// da página, volta o título do site.
export function useTituloDaPagina(nome) {
  useEffect(() => {
    document.title = nome ? `${nome} · ParaAí` : TITULO_PADRAO;
    return () => {
      document.title = TITULO_PADRAO;
    };
  }, [nome]);
}
