import { useCallback, useEffect, useState } from "react";

// Tela cheia de um elemento para o projetor. Usa a API do navegador e, onde
// ela não existe (iPhone, por exemplo), expande o elemento sobre a página.
// Esc sai nos dois casos.
export function useTelaCheia(ref) {
  const [nativa, setNativa] = useState(false);
  const [alternativa, setAlternativa] = useState(false);

  useEffect(() => {
    function sincronizar() {
      setNativa(Boolean(ref.current) && document.fullscreenElement === ref.current);
    }
    document.addEventListener("fullscreenchange", sincronizar);
    return () => document.removeEventListener("fullscreenchange", sincronizar);
  }, [ref]);

  useEffect(() => {
    if (!alternativa) return undefined;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function fecharComEsc(event) {
      if (event.key === "Escape") setAlternativa(false);
    }
    document.addEventListener("keydown", fecharComEsc);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", fecharComEsc);
    };
  }, [alternativa]);

  const alternar = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (alternativa) {
      setAlternativa(false);
      return;
    }
    try {
      if (!ref.current?.requestFullscreen) throw new Error("FULLSCREEN_UNAVAILABLE");
      await ref.current.requestFullscreen();
    } catch {
      setAlternativa(true);
    }
  }, [alternativa, ref]);

  return { ativa: nativa || alternativa, alternativa, alternar };
}
