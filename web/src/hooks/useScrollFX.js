import { useEffect, useRef, useState } from "react";

/**
 * Chama `aoRolar` no máximo uma vez por quadro enquanto a página rola ou muda
 * de tamanho. O callback escreve direto no estilo dos elementos: nada de
 * setState a cada quadro, então a página não re-renderiza ao rolar.
 */
export function useRolagem(aoRolar) {
  const ref = useRef(aoRolar);
  useEffect(() => {
    ref.current = aoRolar;
  });

  useEffect(() => {
    let quadro = null;
    const medir = () => {
      quadro = null;
      ref.current();
    };
    const agendar = () => {
      if (quadro === null) quadro = requestAnimationFrame(medir);
    };
    agendar();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      if (quadro !== null) cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, []);
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

/**
 * Qual das seções (por id) está no meio da tela agora. Alimenta o destaque
 * do link correspondente na barra de navegação. Só muda o estado quando a
 * seção muda, não a cada quadro.
 */
export function useSecaoAtiva(ids, ligado = true) {
  const [ativa, setAtiva] = useState(null);
  const chave = ids.join(",");

  useEffect(() => {
    if (!ligado || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) setAtiva(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    // A página chega depois da barra (carregamento sob demanda): se as seções
    // ainda não existem, espera elas aparecerem no documento.
    const observar = () => {
      const alvos = chave
        .split(",")
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      alvos.forEach((el) => obs.observe(el));
      return alvos.length > 0;
    };
    let espera = null;
    if (!observar()) {
      espera = new MutationObserver(() => {
        if (observar()) espera.disconnect();
      });
      espera.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      obs.disconnect();
      espera?.disconnect();
    };
  }, [chave, ligado]);

  return ligado ? ativa : null;
}
