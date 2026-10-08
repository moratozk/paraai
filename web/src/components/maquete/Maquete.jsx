import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { escolherColunas, MEDIDAS, montarPatio } from "./geometria";
import { compararOcupacao, ocupacaoPorVaga } from "./movimentos";
import { corDaPlaca, criarMotor } from "./motor";
import { semMovimento } from "../../utils/mola";
import "./Maquete.css";

// Maquete virtual do pátio. Só lê: a ocupação vem das vagas gravadas pelo
// totem, e cada mudança entre duas leituras vira um carro andando. Nada aqui
// grava no Firebase nem inventa movimento.

// Carros andando ao mesmo tempo. Um totem atende um carro por vez, então seis
// sobram; acima disso o mais antigo chega de uma vez.
const LUGARES_EM_MOVIMENTO = 6;
// Abaixo de 10 px por metro os números das vagas ficariam menores que 12 px:
// o pátio rola para o lado em vez de encolher mais.
const PX_POR_METRO_MIN = 10;
const PROPORCOES = [0.85, 1.1, 1.4, 1.8, 2.2, 2.8, 3.5];
const { carroComprimento: CC, carroLargura: CL } = MEDIDAS;

const dois = (n) => String(n).padStart(2, "0");

// Fora da tela cheia a altura acompanha a largura, então a escolha é por faixa
// de largura. Na tela cheia vale a caixa disponível, arredondada para uma das
// proporções da lista (assim redimensionar não refaz o pátio a cada pixel).
function proporcaoPara({ largura, altura }, telaCheia) {
  if (!largura) return 2.2;
  if (!telaCheia || !altura) {
    if (largura >= 760) return 2.2;
    if (largura >= 520) return 1.4;
    // No celular o pátio cresce para baixo, mas um pátio pequeno ainda cabe
    // num corredor só, que é mais fácil de seguir.
    return 1.1;
  }
  const alvo = largura / altura;
  return PROPORCOES.reduce((melhor, p) =>
    Math.abs(Math.log(p / alvo)) < Math.abs(Math.log(melhor / alvo)) ? p : melhor
  );
}

/* ------------------------------ desenho fixo ------------------------------ */

// O mesmo carro visto de cima da Home, de frente para a direita.
function SimboloCarro({ id }) {
  return (
    <symbol id={id} viewBox="0 0 100 50" overflow="visible">
      <rect x="2" y="4" width="96" height="42" rx="13" className="maquete-carro-lataria" />
      <path d="M71 7h14a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H71z" className="maquete-carro-capo" />
      <path d="M59 8.5 70 7v36l-11-1.5q-5-17 0-33z" className="maquete-carro-vidro" />
      <rect x="31" y="9" width="27" height="32" rx="5" className="maquete-carro-teto" />
      <path d="M21 10.5 30 9v32l-9-1.5q-4-14.5 0-29z" className="maquete-carro-vidro" />
      <rect x="91" y="8" width="6" height="7" rx="2.5" className="maquete-carro-farol" />
      <rect x="91" y="35" width="6" height="7" rx="2.5" className="maquete-carro-farol" />
      <rect x="2.5" y="9" width="4" height="7" rx="2" className="maquete-carro-lanterna" />
      <rect x="2.5" y="34" width="4" height="7" rx="2" className="maquete-carro-lanterna" />
    </symbol>
  );
}

function Seta({ x, y, angulo = 0 }) {
  return (
    <path
      className="maquete-seta"
      d="M-0.55 -0.7 L0.35 0 L-0.55 0.7"
      transform={`translate(${x} ${y}) rotate(${angulo})`}
    />
  );
}

// Tinta do chão: faixas de circulação, setas, linhas das vagas e placas.
function Pintura({ patio }) {
  const m = MEDIDAS;
  const { corredores, baias, x0, xFim, largura, faixaEntradaX: xe, faixaSaidaX: xs } = patio;
  const primeiro = corredores[0];
  const ultimo = corredores[baias - 1];

  let faixa;
  if (baias === 1) {
    faixa = `M0.6 ${primeiro.y}H${largura - 0.6}`;
  } else {
    faixa = `M0.6 ${primeiro.y}H${xe}V${ultimo.y}`;
    for (const c of corredores) faixa += `M${xe} ${c.y}H${xs}`;
    faixa += `M${xs} ${primeiro.y}V${ultimo.y}H${largura - 0.6}`;
  }

  // Divisórias e fundo de cada fileira.
  const colunasPorFileira = new Map();
  for (const v of patio.vagas) {
    const chave = `${v.baia}:${v.fileira}`;
    colunasPorFileira.set(chave, Math.max(colunasPorFileira.get(chave) || 0, v.coluna + 1));
  }
  let linhas = "";
  for (const [chave, colunas] of colunasPorFileira) {
    const [baia, fileira] = chave.split(":");
    const c = corredores[Number(baia)];
    const yBorda = fileira === "cima" ? c.topo : c.base;
    const yFundo = fileira === "cima" ? c.topo - m.vagaProfundidade : c.base + m.vagaProfundidade;
    for (let i = 0; i <= colunas; i += 1) linhas += `M${x0 + i * m.vagaLargura} ${yFundo}V${yBorda}`;
    linhas += `M${x0} ${yFundo}H${x0 + colunas * m.vagaLargura}`;
  }

  const quarto = (xFim - x0) / 4;
  const setas = [
    <Seta key="entrada" x={1.6} y={primeiro.y} />,
    <Seta key="saida" x={largura - 1.6} y={ultimo.y} />,
  ];
  for (const c of corredores) {
    setas.push(<Seta key={`a${c.indice}`} x={x0 + quarto} y={c.y} />);
    setas.push(<Seta key={`b${c.indice}`} x={xFim - quarto} y={c.y} />);
  }
  if (baias > 1) {
    setas.push(<Seta key="desce-e" x={xe} y={(primeiro.y + ultimo.y) / 2} angulo={90} />);
    setas.push(<Seta key="desce-s" x={xs} y={(primeiro.y + ultimo.y) / 2} angulo={90} />);
  }

  return (
    <g aria-hidden="true">
      <path className="maquete-faixa" d={faixa} />
      {setas}
      <path className="maquete-tinta" d={linhas} />
      {/* Abaixo do eixo, onde o carro não passa por cima das letras. */}
      <text className="maquete-sinal" x={0.6} y={primeiro.y + 2.1}>ENTRADA</text>
      <text className="maquete-sinal maquete-sinal-fim" x={largura - 0.6} y={ultimo.y + 2.1}>
        SAÍDA
      </text>
    </g>
  );
}

function Canteiros({ patio, idPlantas }) {
  const { ilha } = patio.totem;
  return (
    <g aria-hidden="true">
      {patio.canteiros.map((c, i) => (
        <g key={i}>
          <rect className="maquete-canteiro" x={c.x} y={c.y} width={c.largura} height={c.altura} rx="0.6" />
          <rect
            x={c.x + 0.3}
            y={c.y + 0.3}
            width={c.largura - 0.6}
            height={c.altura - 0.6}
            rx="0.4"
            fill={`url(#${idPlantas})`}
          />
        </g>
      ))}
      <rect className="maquete-ilha" x={ilha.x} y={ilha.y} width={ilha.largura} height={ilha.altura} rx="0.45" />
    </g>
  );
}

function SeloTipo({ vaga, especial }) {
  return (
    <g className="maquete-selo" transform={`translate(${vaga.cx} ${vaga.cy})`} aria-hidden="true">
      <rect x="-1.05" y="-0.95" width="2.1" height="1.9" rx="0.35" />
      {especial.tipo === "pcd" ? (
        // Símbolo internacional de acesso, simplificado (o mesmo da Home).
        <g transform="scale(0.0188) translate(-8 16.5)">
          <circle cx="6" cy="-46" r="9" />
          <path d="M2 -32v28h26l10 22M-14 -18a24 24 0 1 0 34 30" />
        </g>
      ) : (
        <text>{especial.icone}</text>
      )}
    </g>
  );
}

function Totem({ patio, online, totemRef }) {
  const { x, y, ilha } = patio.totem;
  return (
    <g
      ref={totemRef}
      className={`maquete-totem ${online ? "online" : "offline"}`}
      data-atendendo="nao"
      transform={`translate(${x} ${y})`}
    >
      <title>{online ? "Totem da entrada" : "Totem da entrada (sem sinal recente)"}</title>
      <circle className="maquete-totem-halo" r="1.7" />
      <rect className="maquete-totem-corpo" x="-0.7" y="-0.55" width="1.4" height="1.1" rx="0.2" />
      <rect className="maquete-totem-tela" x="-0.5" y="0.05" width="1" height="0.35" rx="0.08" />
      <circle className="maquete-totem-luz" cx="0.42" cy="-0.28" r="0.13" />
      <text className="maquete-totem-rotulo" x="0" y={ilha.y + 0.85 - y}>
        TOTEM
      </text>
    </g>
  );
}

/* ------------------------------- componente ------------------------------- */

export default function Maquete({ vagas, online = false, telaCheia = false, aoMovimentar }) {
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const idCarro = `${idBase}-carro`;
  const idSombra = `${idBase}-sombra`;
  const idFarol = `${idBase}-farol`;
  const idPlantas = `${idBase}-plantas`;

  const areaRef = useRef(null);
  const avisoRef = useRef(null);
  const totemRef = useRef(null);
  const lugaresRef = useRef([]);
  const estacionadosRef = useRef(new Map());
  const vagasRef = useRef(new Map());
  const anteriorRef = useRef(null);
  const motorRef = useRef(null);
  const aoMovimentarRef = useRef(aoMovimentar);

  const [caixa, setCaixa] = useState({ largura: 0, altura: 0 });
  // O pátio só é refeito quando muda o número de colunas, não a cada pixel.
  const colunas = escolherColunas(
    vagas.length,
    proporcaoPara(caixa, telaCheia),
    caixa.largura ? caixa.largura / PX_POR_METRO_MIN : Infinity
  );
  const patio = useMemo(() => montarPatio(vagas.length, colunas), [vagas.length, colunas]);

  useEffect(() => {
    aoMovimentarRef.current = aoMovimentar;
  }, [aoMovimentar]);

  // A caixa disponível decide o formato do pátio. O ResizeObserver avisa uma
  // vez ao começar a observar e de novo a cada mudança.
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(([registro]) => {
      const { width, height } = registro.contentRect;
      setCaixa((atual) =>
        Math.abs(atual.largura - width) < 1 && Math.abs(atual.altura - height) < 1
          ? atual
          : { largura: width, altura: height }
      );
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // O motor anima direto no SVG; nasce e morre com o componente.
  useLayoutEffect(() => {
    const motor = criarMotor({
      lugares: lugaresRef,
      estacionados: estacionadosRef,
      vagas: vagasRef,
      aviso: avisoRef,
      totem: totemRef,
    });
    motorRef.current = motor;
    return () => {
      motor.destruir();
      motorRef.current = null;
    };
  }, []);

  // Com o pátio em outro formato, os trajetos em andamento não servem mais:
  // os carros chegam de uma vez e a maquete segue dali.
  useLayoutEffect(() => {
    motorRef.current?.reiniciar();
  }, [patio]);

  // Cada mudança de ocupação entre duas leituras vira um movimento. Roda antes
  // da pintura da tela: o carro que vai entrar some da vaga antes de aparecer,
  // e o que vai sair já está no lugar quando a vaga fica vazia.
  useLayoutEffect(() => {
    const atual = ocupacaoPorVaga(vagas);
    const antes = anteriorRef.current;
    anteriorRef.current = atual;
    if (!antes) return;
    const eventos = compararOcupacao(antes, atual);
    if (!eventos.length) return;
    const quando = Date.now();
    for (const evento of eventos) aoMovimentarRef.current?.({ ...evento, quando });
    motorRef.current?.processar(eventos, patio, { animar: !semMovimento() });
  }, [vagas, patio]);

  const ocupadas = vagas.filter((v) => v.ocupada).length;
  const reservadas = vagas.filter((v) => v.reservada).length;
  const resumo = `${vagas.length} vagas: ${ocupadas} ocupadas, ${reservadas} reservadas e ${
    vagas.length - ocupadas - reservadas
  } livres.`;

  return (
    <div className={`maquete ${telaCheia ? "tela-cheia" : ""}`}>
      {/* Fora do pátio: nunca cobre a vaga para onde o carro está indo. A
          lista de movimentos da página é que é lida pelo leitor de tela. */}
      <p ref={avisoRef} className="maquete-aviso" data-estado="ocioso" aria-hidden="true">
        <span className="maquete-aviso-ponto" />
        <span>Aguardando o próximo registro do totem</span>
      </p>

      <div ref={areaRef} className="maquete-area">
        <div
          className="maquete-superficie"
          style={{
            "--proporcao": `${patio.largura} / ${patio.altura}`,
            "--largura-min": `${Math.ceil(patio.largura * PX_POR_METRO_MIN)}px`,
          }}
        >
          <svg
            className="maquete-svg"
            viewBox={`0 0 ${patio.largura} ${patio.altura}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Maquete do pátio visto de cima. ${resumo}`}
          >
            <defs>
              <SimboloCarro id={idCarro} />
              <filter id={idSombra} x="-20%" y="-30%" width="140%" height="160%">
                <feDropShadow dx="0" dy="0.3" stdDeviation="0.28" floodColor="#000" floodOpacity="0.55" />
              </filter>
              <radialGradient id={idFarol} cx="0" cy="0.5" r="1">
                <stop offset="0" stopColor="#ffeeaa" stopOpacity="0.42" />
                <stop offset="1" stopColor="#ffeeaa" stopOpacity="0" />
              </radialGradient>
              {/* Arbustos do canteiro: copas de tamanhos diferentes, fora de grade. */}
              <pattern
                id={idPlantas}
                width="2.2"
                height="2"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(14)"
              >
                <circle className="maquete-planta" cx="0.55" cy="0.6" r="0.42" />
                <circle className="maquete-planta clara" cx="1.5" cy="1.35" r="0.36" />
                <circle className="maquete-planta" cx="1.8" cy="0.35" r="0.22" />
              </pattern>
            </defs>

            <Canteiros patio={patio} idPlantas={idPlantas} />
            <Pintura patio={patio} />

            {patio.vagas.map((geo) => {
              const vaga = vagas[geo.numero - 1] || {};
              const especial = vaga.especial || null;
              const estado = vaga.ocupada ? "ocupada" : vaga.reservada ? "reservada no aplicativo" : "livre";
              return (
                <g
                  key={geo.numero}
                  ref={(el) => {
                    if (el) vagasRef.current.set(geo.numero, el);
                    else vagasRef.current.delete(geo.numero);
                  }}
                  className={["maquete-vaga", especial?.tipo, vaga.reservada && "reservada"]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <title>{`Vaga ${dois(geo.numero)}${especial ? ` · ${especial.rotulo}` : ""} · ${estado}`}</title>
                  <rect
                    className="maquete-vaga-brilho"
                    x={geo.x + 0.15}
                    y={geo.y + 0.15}
                    width={geo.largura - 0.3}
                    height={geo.profundidade - 0.3}
                    rx="0.35"
                  />
                  {especial && (
                    <rect
                      className="maquete-vaga-tipo"
                      x={geo.x + 0.2}
                      y={geo.y + 0.2}
                      width={geo.largura - 0.4}
                      height={geo.profundidade - 0.4}
                      rx="0.3"
                    />
                  )}
                  {vaga.reservada && (
                    <rect
                      className="maquete-vaga-reserva"
                      x={geo.x + 0.32}
                      y={geo.y + 0.32}
                      width={geo.largura - 0.64}
                      height={geo.profundidade - 0.64}
                      rx="0.3"
                    />
                  )}
                  {especial && !vaga.ocupada && <SeloTipo vaga={geo} especial={especial} />}
                  <text
                    className="maquete-numero"
                    x={geo.cx}
                    y={geo.fileira === "cima" ? geo.y + geo.profundidade + 1.0 : geo.y - 1.0}
                  >
                    {dois(geo.numero)}
                  </text>
                </g>
              );
            })}

            <g filter={`url(#${idSombra})`}>
              {patio.vagas.map((geo) => {
                const vaga = vagas[geo.numero - 1];
                if (!vaga?.ocupada) return null;
                return (
                  <g
                    key={geo.numero}
                    ref={(el) => {
                      if (el) estacionadosRef.current.set(geo.numero, el);
                      else estacionadosRef.current.delete(geo.numero);
                    }}
                    className="maquete-estacionado"
                    transform={`translate(${geo.cx} ${geo.cy}) rotate(${geo.angulo})`}
                  >
                    <title>{`Vaga ${dois(geo.numero)}${vaga.placa ? ` · ${vaga.placa}` : ""}`}</title>
                    <use
                      href={`#${idCarro}`}
                      x={-CC / 2}
                      y={-CL / 2}
                      width={CC}
                      height={CL}
                      style={{ "--carro-cor": corDaPlaca(vaga.placa) }}
                    />
                  </g>
                );
              })}
            </g>

            <Totem patio={patio} online={online} totemRef={totemRef} />

            {Array.from({ length: LUGARES_EM_MOVIMENTO }, (_, i) => (
              <g
                key={i}
                className="maquete-ator"
                data-ativo="nao"
                ref={(el) => {
                  lugaresRef.current[i] = el
                    ? {
                        raiz: el,
                        corpo: el.querySelector(".maquete-ator-corpo"),
                        carro: el.querySelector("use"),
                        placa: el.querySelector(".maquete-ator-placa text"),
                      }
                    : null;
                }}
              >
                <g className="maquete-ator-corpo">
                  <rect
                    className="maquete-ator-halo"
                    x={-CC / 2 - 0.45}
                    y={-CL / 2 - 0.45}
                    width={CC + 0.9}
                    height={CL + 0.9}
                    rx="1"
                  />
                  <ellipse
                    className="maquete-ator-farol"
                    cx={CC / 2 + 1.25}
                    cy="0"
                    rx="1.5"
                    ry="1.05"
                    fill={`url(#${idFarol})`}
                  />
                  <use
                    href={`#${idCarro}`}
                    x={-CC / 2}
                    y={-CL / 2}
                    width={CC}
                    height={CL}
                    filter={`url(#${idSombra})`}
                  />
                </g>
                <g className="maquete-ator-placa" transform="translate(0 -2.45)">
                  <rect x="-3" y="-0.85" width="6" height="1.7" rx="0.3" />
                  <rect className="maquete-ator-placa-faixa" x="-3" y="-0.85" width="6" height="0.34" rx="0.15" />
                  <text y="0.14" />
                </g>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <ul className="maquete-legenda" aria-label="Legenda">
        <li><i className="livre" />Livre</li>
        <li><i className="ocupada" />Ocupada</li>
        <li><i className="reservada" />Reservada no app</li>
        <li><i className="pcd" />PCD</li>
        <li><i className="idoso" />60+</li>
        <li><i className="gestante" />Gestante</li>
      </ul>
    </div>
  );
}
