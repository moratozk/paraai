import { useCallback, useEffect, useRef, useState } from "react";
import {
  animarMola,
  limitarElastico,
  projetar,
  semMovimento,
} from "../../utils/mola";
import "./PatioInterativo.css";

/* -------------------------------------------------------------------------
   Geometria do pátio, em frações da largura (x) e da altura (y). O desenho
   segue o mapa do app: uma fileira em cima, o corredor e outra embaixo.
   ------------------------------------------------------------------------- */
const COLUNAS = 5;
const MARGEM = 0.04;
const VAGA_L = (1 - 2 * MARGEM) / COLUNAS;
const TOPO = { y0: 0.05, y1: 0.37 };
const BASE = { y0: 0.63, y1: 0.95 };
const CORREDOR_Y = 0.5;
const PROFUNDIDADE = CORREDOR_Y - (TOPO.y0 + TOPO.y1) / 2; // corredor → centro da vaga
const CARRO_C = 0.17; // comprimento do carro, em fração da largura (CSS usa o mesmo valor)
const CARRO_L = CARRO_C / 2;
const PLACA = "PAR2A26";
const VAGA_INDICADA = 3;

const VAGAS = [
  { n: 1, fileira: TOPO, col: 0, cor: "#4b5466" },
  { n: 2, fileira: TOPO, col: 1, cor: "#7a8294" },
  { n: 3, fileira: TOPO, col: 2 },
  { n: 4, fileira: TOPO, col: 3, cor: "#2f4d70" },
  { n: 5, fileira: TOPO, col: 4, pcd: true },
  { n: 6, fileira: BASE, col: 0, cor: "#5d4b70" },
  { n: 7, fileira: BASE, col: 1 },
  { n: 8, fileira: BASE, col: 2, cor: "#3e5d55" },
  { n: 9, fileira: BASE, col: 3 },
  { n: 10, fileira: BASE, col: 4, cor: "#70603e" },
].map((v) => ({
  ...v,
  cx: MARGEM + (v.col + 0.5) * VAGA_L,
  cy: (v.fileira.y0 + v.fileira.y1) / 2,
  livre: !v.cor,
}));
const LIVRES = VAGAS.filter((v) => v.livre).map((v) => v.n);
const vagaPorNumero = (n) => VAGAS.find((v) => v.n === n);
const dois = (n) => String(n).padStart(2, "0");

/* Carro visto de cima, de frente para a direita. A cor vem de --carro-cor. */
function Carro({ placa }) {
  return (
    <svg viewBox="0 0 100 50" aria-hidden="true" className="carro-svg">
      <rect x="2" y="4" width="96" height="42" rx="13" className="carro-lataria" />
      <path d="M71 7h14a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H71z" className="carro-capo" />
      <path d="M59 8.5 70 7v36l-11-1.5q-5-17 0-33z" className="carro-vidro" />
      <rect x="31" y="9" width="27" height="32" rx="5" className="carro-teto" />
      <path d="M21 10.5 30 9v32l-9-1.5q-4-14.5 0-29z" className="carro-vidro" />
      <rect x="91" y="8" width="6" height="7" rx="2.5" className="carro-farol" />
      <rect x="91" y="35" width="6" height="7" rx="2.5" className="carro-farol" />
      <rect x="2.5" y="9" width="4" height="7" rx="2" className="carro-lanterna" />
      <rect x="2.5" y="34" width="4" height="7" rx="2" className="carro-lanterna" />
      {placa && <rect x="40" y="21" width="12" height="8" rx="1.5" className="carro-teto-marca" />}
    </svg>
  );
}

/* Tinta do chão: linhas das vagas, números, faixa do corredor. Em SVG para
   ficar nítido em qualquer tamanho; a proporção do viewBox é a do pátio. */
function Pintura() {
  const W = 1200;
  const H = 1000;
  const xs = Array.from({ length: COLUNAS + 1 }, (_, i) => (MARGEM + i * VAGA_L) * W);
  return (
    <svg className="patio-pintura" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {xs.map((x) => (
        <g key={x}>
          <line x1={x} y1={TOPO.y0 * H} x2={x} y2={TOPO.y1 * H} />
          <line x1={x} y1={BASE.y0 * H} x2={x} y2={BASE.y1 * H} />
        </g>
      ))}
      <line x1={xs[0]} y1={TOPO.y0 * H} x2={xs[COLUNAS]} y2={TOPO.y0 * H} />
      <line x1={xs[0]} y1={BASE.y1 * H} x2={xs[COLUNAS]} y2={BASE.y1 * H} />
      <line className="patio-faixa" x1={40} y1={CORREDOR_Y * H} x2={W - 40} y2={CORREDOR_Y * H} />
      {VAGAS.map((v) => (
        <text
          key={v.n}
          className="patio-numero"
          x={v.cx * W}
          y={(v.fileira === TOPO ? v.fileira.y1 - 0.014 : v.fileira.y0 + 0.048) * H}
        >
          {dois(v.n)}
        </text>
      ))}
      {VAGAS.filter((v) => v.pcd).map((v) => (
        <g key={`pcd-${v.n}`} className="patio-pcd">
          <rect x={v.cx * W - 52} y={v.cy * H - 70} width="104" height="104" rx="14" />
          {/* símbolo internacional de acesso, simplificado */}
          <circle cx={v.cx * W + 6} cy={v.cy * H - 46} r="9" />
          <path d={`M${v.cx * W + 2} ${v.cy * H - 32}v28h26l10 22M${v.cx * W - 14} ${v.cy * H - 18}a24 24 0 1 0 34 30`} />
        </g>
      ))}
      {/* Abaixo da faixa, onde o carro não passa por cima das letras. */}
      <text className="patio-sinal" x={64} y={CORREDOR_Y * H + 104}>ENTRADA</text>
      <text className="patio-sinal patio-sinal-fim" x={W - 64} y={CORREDOR_Y * H + 104}>SAÍDA</text>
    </svg>
  );
}

export default function PatioInterativo() {
  const figuraRef = useRef(null);
  const superficieRef = useRef(null);
  const carroRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const dim = useRef({ w: 0, h: 0 });
  const molas = useRef([]);
  const arraste = useRef(null);
  const tocou = useRef(false);
  const lugar = useRef({ tipo: "corredor", x: 0.12 }); // onde o carro descansa

  const [estado, setEstado] = useState("parado"); // parado | arrastando | indo | estacionado
  const [vaga, setVaga] = useState(null);
  const [entrada, setEntrada] = useState("");
  const [aviso, setAviso] = useState("");
  const [recusa, setRecusa] = useState(null); // vaga especial recusada (destaque)
  const [selecao, setSelecao] = useState(VAGA_INDICADA);
  const [brilho, setBrilho] = useState(0);

  /* Escreve a posição direto no estilo: nada de re-renderizar a cada quadro.
     O ângulo nasce da altura — o carro "vira" ao subir ou descer da faixa. */
  const aplicar = useCallback(() => {
    const el = carroRef.current;
    const { w, h } = dim.current;
    if (!el || !w) return;
    const { x, y } = pos.current;
    const giro = Math.max(-1, Math.min(1, (y - CORREDOR_Y * h) / (PROFUNDIDADE * h))) * 90;
    el.style.transform = `translate3d(${x - (CARRO_C * w) / 2}px, ${y - (CARRO_L * w) / 2}px, 0) rotate(${giro}deg)`;
  }, []);

  const pararMolas = useCallback(() => {
    molas.current.forEach((m) => m.parar());
    molas.current = [];
  }, []);

  const pontoDe = useCallback((l) => {
    const { w, h } = dim.current;
    if (l.tipo === "vaga") {
      const v = vagaPorNumero(l.n);
      return { x: v.cx * w, y: v.cy * h };
    }
    return { x: l.x * w, y: CORREDOR_Y * h };
  }, []);

  /* Duas molas independentes, uma por eixo (como recomenda a Apple): cada
     eixo carrega a própria velocidade do gesto. */
  const irPara = useCallback(
    (l, { vx = 0, vy = 0, resposta = 0.42, amortecimento = 1, atrasoY = 0 } = {}) => {
      pararMolas();
      lugar.current = l;
      const alvo = pontoDe(l);
      if (semMovimento()) {
        pos.current = alvo;
        aplicar();
        setEstado(l.tipo === "vaga" ? "estacionado" : "parado");
        return;
      }
      setEstado("indo");
      let chegou = 0;
      const terminar = () => {
        chegou += 1;
        if (chegou < 2) return;
        setEstado(l.tipo === "vaga" ? "estacionado" : "parado");
        if (l.tipo === "vaga") setBrilho((b) => b + 1);
      };
      const mx = animarMola({
        de: pos.current.x,
        para: alvo.x,
        velocidade: vx,
        resposta,
        amortecimento,
        aoAtualizar: (x) => {
          pos.current = { ...pos.current, x };
          aplicar();
        },
        aoTerminar: terminar,
      });
      molas.current.push(mx);
      const iniciarY = () => {
        const my = animarMola({
          de: pos.current.y,
          para: alvo.y,
          velocidade: vy,
          resposta: resposta * 0.85,
          amortecimento,
          aoAtualizar: (y) => {
            pos.current = { ...pos.current, y };
            aplicar();
          },
          aoTerminar: terminar,
        });
        molas.current.push(my);
      };
      if (atrasoY > 0) {
        const t = setTimeout(iniciarY, atrasoY);
        molas.current.push({ parar: () => clearTimeout(t) });
      } else {
        iniciarY();
      }
    },
    [aplicar, pararMolas, pontoDe]
  );

  const estacionar = useCallback(
    (n, opcoes = {}) => {
      const v = vagaPorNumero(n);
      if (v.pcd) {
        setRecusa(n);
        setAviso(`A vaga ${dois(n)} é PCD: só para quem declarou o direito no perfil.`);
        irPara({ tipo: "corredor", x: v.cx }, { ...opcoes, amortecimento: 0.8 });
        return;
      }
      setAviso("");
      setRecusa(null);
      setVaga(n);
      setEntrada(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
      irPara({ tipo: "vaga", n }, opcoes);
    },
    [irPara]
  );

  const sair = useCallback(() => {
    const v = vagaPorNumero(vaga ?? VAGA_INDICADA);
    setVaga(null);
    setAviso("");
    setRecusa(null);
    irPara({ tipo: "corredor", x: v.cx }, { resposta: 0.5 });
  }, [irPara, vaga]);

  /* Medidas: o pátio é fluido, então reposiciona o carro no lugar em que ele
     descansa sempre que o tamanho muda. */
  useEffect(() => {
    const el = superficieRef.current;
    if (!el) return undefined;
    const medir = () => {
      const r = el.getBoundingClientRect();
      dim.current = { w: r.width, h: r.height };
      if (!arraste.current) {
        pos.current = pontoDe(lugar.current);
        aplicar();
      }
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [aplicar, pontoDe]);

  /* Demonstração: na primeira vez que o pátio aparece, o carro sai da entrada
     e para em frente à vaga indicada — um convite, não o gesto pronto. */
  useEffect(() => {
    const el = figuraRef.current;
    if (!el || semMovimento() || typeof IntersectionObserver === "undefined") return undefined;
    let timer = null;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        timer = setTimeout(() => {
          if (tocou.current) return;
          irPara({ tipo: "corredor", x: vagaPorNumero(VAGA_INDICADA).cx }, { resposta: 0.9 });
        }, 900);
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimeout(timer);
    };
  }, [irPara]);

  useEffect(() => pararMolas, [pararMolas]);

  /* ---------------- gesto ---------------- */
  function aoPressionar(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pararMolas(); // interrompe no meio: o gesto parte de onde o carro está agora
    tocou.current = true;
    const r = superficieRef.current.getBoundingClientRect();
    arraste.current = {
      id: e.pointerId,
      r,
      dx: e.clientX - r.left - pos.current.x, // respeita o ponto em que a pessoa pegou
      dy: e.clientY - r.top - pos.current.y,
      inicio: { x: e.clientX, y: e.clientY },
      historico: [{ ...pos.current, t: e.timeStamp }],
      moveu: false,
    };
    e.currentTarget.classList.add("segurando");
  }

  function aoMover(e) {
    const a = arraste.current;
    if (!a || a.id !== e.pointerId) return;
    if (!a.moveu) {
      if (Math.hypot(e.clientX - a.inicio.x, e.clientY - a.inicio.y) < 6) return;
      a.moveu = true;
      setEstado("arrastando");
      setAviso("");
      setRecusa(null);
      setVaga(null);
    }
    const { w, h } = dim.current;
    const x = limitarElastico(e.clientX - a.r.left - a.dx, w * 0.08, w * 0.92, w);
    const y = limitarElastico(e.clientY - a.r.top - a.dy, h * 0.14, h * 0.86, h);
    pos.current = { x, y };
    aplicar();
    a.historico.push({ x, y, t: e.timeStamp });
    while (a.historico.length > 2 && e.timeStamp - a.historico[0].t > 100) {
      a.historico.shift();
    }
  }

  function aoSoltar(e) {
    const a = arraste.current;
    if (!a || a.id !== e.pointerId) return;
    arraste.current = null;
    e.currentTarget.classList.remove("segurando");
    if (!a.moveu) {
      // toque sem arrastar: estaciona na vaga escolhida ou sai dela. O eixo Y
      // começa um pouco depois: anda pelo corredor e então entra na vaga.
      if (estado === "estacionado") sair();
      else estacionar(selecao, { atrasoY: 160 });
      return;
    }
    // Velocidade de soltura pelas últimas amostras (~100 ms). Com poucas
    // amostras não há como saber se houve arremesso: conta como parado.
    let vx = 0;
    let vy = 0;
    const amostras = a.historico;
    if (amostras.length >= 3) {
      const p = amostras[0];
      const u = amostras[amostras.length - 1];
      const dt = Math.max(16, u.t - p.t);
      vx = ((u.x - p.x) / dt) * 1000;
      vy = ((u.y - p.y) / dt) * 1000;
      const v = Math.hypot(vx, vy);
      if (v > 4000) {
        vx *= 4000 / v;
        vy *= 4000 / v;
      }
    }
    const velocidade = Math.hypot(vx, vy);
    const { w, h } = dim.current;
    const { x, y } = pos.current;

    // Para onde o gesto ia (não onde o dedo soltou), com alcance limitado:
    // o pátio é pequeno, e um arremesso não deve atravessar o desenho todo.
    let dx = projetar(vx);
    let dy = projetar(vy);
    const alcance = VAGA_L * w * 1.5;
    const d = Math.hypot(dx, dy);
    if (d > alcance) {
      dx *= alcance / d;
      dy *= alcance / d;
    }
    const px = x + dx;
    const py = y + dy;

    // Soltou em cima de uma vaga livre, sem arremessar: a intenção é ela.
    let escolha = VAGAS.find(
      (v) =>
        v.livre &&
        velocidade < 1500 &&
        Math.abs(x - v.cx * w) < (VAGA_L * w) / 2 &&
        Math.abs(y - v.cy * h) < ((v.fileira.y1 - v.fileira.y0) * h) / 2
    );
    if (!escolha) {
      let melhor = null;
      for (const v of VAGAS) {
        if (!v.livre) continue;
        const dist = Math.hypot(px - v.cx * w, py - v.cy * h);
        if (!melhor || dist < melhor.dist) melhor = { v, dist };
      }
      if (melhor && melhor.dist < VAGA_L * w * 0.75) escolha = melhor.v;
    }

    const opcoes = { vx, vy, amortecimento: velocidade > 450 ? 0.8 : 1 };
    if (escolha) {
      setSelecao(escolha.n);
      estacionar(escolha.n, opcoes);
    } else {
      irPara({ tipo: "corredor", x: Math.max(0.12, Math.min(0.88, px / w)) }, opcoes);
    }
  }

  function aoTeclar(e) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = LIVRES.indexOf(selecao);
      const prox = LIVRES[(i + (e.key === "ArrowRight" ? 1 : LIVRES.length - 1)) % LIVRES.length];
      setSelecao(prox);
      setAviso(`Vaga ${dois(prox)} selecionada. Enter estaciona.`);
    }
  }

  function aoClicarTeclado(e) {
    // Enter/Espaço chegam como clique com detail 0; o ponteiro já foi tratado.
    if (e.detail !== 0) return;
    tocou.current = true;
    if (estado === "estacionado") sair();
    else estacionar(selecao, { atrasoY: 160 });
  }

  const dica =
    recusa !== null
      ? aviso
      : estado === "estacionado"
      ? "Estacionado. Na saída, é só digitar a placa de novo."
      : estado === "arrastando"
        ? "Solte perto de uma vaga livre"
        : `Arraste o carro até a vaga ${dois(VAGA_INDICADA)}`;

  return (
    <figure
      ref={figuraRef}
      className="patio"
      data-estado={estado}
      aria-label="Demonstração: estacione o carro arrastando até uma vaga livre"
    >
      <div ref={superficieRef} className="patio-superficie">
        <Pintura />

        {VAGAS.map((v) => (
          <span
            key={v.n}
            className={[
              "patio-vaga",
              v.fileira === TOPO ? "topo" : "base",
              v.livre && v.n === VAGA_INDICADA && estado !== "estacionado" ? "indicada" : "",
              v.n === selecao && estado !== "estacionado" ? "selecionada" : "",
              v.n === vaga && estado === "estacionado" ? "ocupada-por-voce" : "",
              v.n === recusa ? "recusou" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${(v.cx - VAGA_L / 2) * 100}%`,
              top: `${v.fileira.y0 * 100}%`,
              width: `${VAGA_L * 100}%`,
              height: `${(v.fileira.y1 - v.fileira.y0) * 100}%`,
            }}
            aria-hidden="true"
          />
        ))}

        {VAGAS.filter((v) => !v.livre).map((v) => (
          <span
            key={`carro-${v.n}`}
            className="patio-estacionado"
            style={{
              left: `${v.cx * 100}%`,
              top: `${v.cy * 100}%`,
              "--carro-cor": v.cor,
              "--giro": v.fileira === TOPO ? "-90deg" : "90deg",
            }}
            aria-hidden="true"
          >
            <Carro />
          </span>
        ))}

        <button
          ref={carroRef}
          type="button"
          className="patio-carro"
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onKeyDown={aoTeclar}
          onClick={aoClicarTeclado}
          aria-label={
            estado === "estacionado"
              ? `Carro ${PLACA} estacionado na vaga ${dois(vaga)}. Enter para sair.`
              : `Carro ${PLACA}. Setas escolhem a vaga, Enter estaciona.`
          }
        >
          <Carro placa />
        </button>

        <span key={brilho} className={brilho ? "patio-brilho" : ""} aria-hidden="true" />
      </div>

      {/* Fora da superfície (que corta o que vaza): a dica fica presa na borda
         de cima, sem cobrir vaga nenhuma. */}
      <span className={`patio-dica ${recusa !== null ? "patio-dica-alerta" : ""}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 14.4a1.6 1.6 0 0 1 2.4-2.1L9 14" />
        </svg>
        {dica}
      </span>

      <figcaption className="patio-ticket">
        <span className="placa-mercosul" aria-label={`Placa ${PLACA}`}>
          {PLACA}
        </span>
        <span className="patio-ticket-texto">
          {estado === "estacionado" ? (
            <>
              <strong>Vaga {dois(vaga)}</strong>
              <span>entrada {entrada} · cobra só o tempo usado</span>
            </>
          ) : (
            <>
              <strong>Vaga indicada: {dois(VAGA_INDICADA)}</strong>
              <span>a primeira livre do seu tipo</span>
            </>
          )}
        </span>
      </figcaption>

      <p className="sr-only" aria-live="polite">
        {aviso ||
          (estado === "estacionado" ? `Carro estacionado na vaga ${dois(vaga)}.` : "")}
      </p>
    </figure>
  );
}
