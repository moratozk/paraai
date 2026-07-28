import { useEffect, useRef, useState } from "react";

/** O visitante pediu para reduzir animações no sistema operacional? */
function prefereSemMovimento() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Progresso de um elemento na viewport, de 0 a 1.
 *
 *   0   → o topo do elemento acabou de entrar pela base da tela
 *   0.5 → o elemento está centralizado
 *   1   → a base do elemento acabou de sair pelo topo
 *
 * É a base dos efeitos de parallax: com esse número dá para interpolar
 * qualquer coisa (deslocamento, escala, opacidade) conforme a rolagem.
 *
 * A leitura acontece dentro de requestAnimationFrame para não forçar
 * reflow a cada evento de scroll.
 */
export function useProgressoScroll(ref) {
  // Quem pediu menos movimento já nasce no meio da faixa: sem parallax, e sem
  // precisar de um setState dentro do efeito para corrigir depois.
  const [progresso, setProgresso] = useState(() =>
    prefereSemMovimento() ? 0.5 : 0
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || prefereSemMovimento()) return;

    let frame = null;

    const medir = () => {
      frame = null;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const percurso = r.height + vh; // distância total percorrida
      const andado = vh - r.top;
      setProgresso(Math.min(1, Math.max(0, andado / percurso)));
    };

    const aoRolar = () => {
      if (frame === null) frame = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, [ref]);

  return progresso;
}

/**
 * Progresso de leitura da página inteira (0 a 1). Usado na barra do topo.
 */
export function useProgressoPagina() {
  const [progresso, setProgresso] = useState(0);

  useEffect(() => {
    let frame = null;

    const medir = () => {
      frame = null;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgresso(total > 0 ? Math.min(1, window.scrollY / total) : 0);
    };

    const aoRolar = () => {
      if (frame === null) frame = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, []);

  return progresso;
}

/**
 * Marca o elemento como visível na primeira vez que ele entra na tela.
 * Serve para disparar as animações de entrada uma única vez.
 */
export function useRevelar({ margem = "-80px", umaVez = true } = {}) {
  const ref = useRef(null);
  // Sem IntersectionObserver o conteúdo aparece direto, em vez de ficar
  // invisível para sempre.
  const [visivel, setVisivel] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          if (umaVez) obs.disconnect();
        } else if (!umaVez) {
          setVisivel(false);
        }
      },
      { rootMargin: margem, threshold: 0.05 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [margem, umaVez]);

  return [ref, visivel];
}

/** Interpola entre dois valores conforme o progresso (0 a 1). */
export function entre(progresso, de, ate) {
  return de + (ate - de) * progresso;
}

/**
 * Mapeia o progresso passando por pontos intermediários.
 * faixa(0.5, [0, 0.5, 1], [0, 1, 0]) === 1
 */
export function faixa(progresso, entradas, saidas) {
  for (let i = 0; i < entradas.length - 1; i++) {
    const a = entradas[i];
    const b = entradas[i + 1];
    if (progresso <= b || i === entradas.length - 2) {
      const t = b === a ? 0 : (progresso - a) / (b - a);
      return entre(Math.min(1, Math.max(0, t)), saidas[i], saidas[i + 1]);
    }
  }
  return saidas[saidas.length - 1];
}
