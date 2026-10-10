import { useEffect, useRef, useState } from "react";
import "./RolagemLateral.css";

// Faixa que rola para o lado, como o pátio no celular. A borda esmaece do
// lado em que ainda há vagas e um aviso embaixo diz para deslizar: sem isso,
// a vaga cortada na beirada parecia defeito do mapa, e não o começo do resto.
export default function RolagemLateral({ className = "", aviso, children, ...resto }) {
  const ref = useRef(null);
  const [aEsquerda, setAEsquerda] = useState(false);
  const [aDireita, setADireita] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => {
      const fim = el.scrollWidth - el.clientWidth;
      setAEsquerda(el.scrollLeft > 2);
      setADireita(fim - el.scrollLeft > 2);
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => el.removeEventListener("scroll", medir);
    }
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    if (el.firstElementChild) observador.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, []);

  const classes = [
    "rolagem-lateral",
    aEsquerda ? "mais-a-esquerda" : "",
    aDireita ? "mais-a-direita" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="rolagem-lateral-janela">
        <div ref={ref} className={className} {...resto}>
          {children}
        </div>
      </div>
      {aviso && (aEsquerda || aDireita) && (
        <p className="rolagem-lateral-aviso">
          <span aria-hidden="true">← →</span>
          {aviso}
        </p>
      )}
    </div>
  );
}
