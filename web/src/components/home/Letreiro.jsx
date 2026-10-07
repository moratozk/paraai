import { useRef } from "react";
import { useRolagem } from "../../hooks/useScrollFX";
import { semMovimento } from "../../utils/mola";
import "./Letreiro.css";

const ITENS = [
  "Sem ticket",
  "Sem fila no caixa",
  "Sem troco",
  "Reserva grátis",
  "Vagas especiais",
  "Recibo no celular",
  "Tarifa travada na entrada",
  "24 horas",
];

function Seta() {
  return (
    <svg viewBox="0 0 24 24" className="letreiro-seta" aria-hidden="true">
      <path d="M4 5l7 7-7 7M12 5l7 7-7 7" />
    </svg>
  );
}

/* Faixa de sinalização que anda com a rolagem: parada quando a página para,
   volta quando a pessoa rola para cima. Movimento só em resposta ao gesto —
   não fica girando sozinha na tela. */
export default function Letreiro() {
  const trilhoRef = useRef(null);

  useRolagem(() => {
    const trilho = trilhoRef.current;
    if (!trilho || semMovimento()) return;
    const grupo = trilho.firstElementChild;
    const largura = grupo ? grupo.offsetWidth : 0;
    if (!largura) return;
    const x = (window.scrollY * 0.45) % largura;
    trilho.style.transform = `translate3d(${-x}px, 0, 0)`;
  });

  return (
    <section className="letreiro" aria-label="O que muda com o ParaAí">
      <div ref={trilhoRef} className="letreiro-trilho">
        {[0, 1, 2].map((copia) => (
          <ul key={copia} className="letreiro-grupo" aria-hidden={copia > 0 || undefined}>
            {ITENS.map((item) => (
              <li key={item}>
                {item}
                <Seta />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
