import { Fragment, useRef } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import PatioInterativo from "../components/home/PatioInterativo";
import Letreiro from "../components/home/Letreiro";
import MapaAoVivo from "../components/home/MapaAoVivo";
import Holofote from "../components/home/Holofote";
import { useRevelar, useRolagem } from "../hooks/useScrollFX";
import "./Home.css";

/* -------------------------------------------------------------------------
   Ícones (traço, cor do texto)
   ------------------------------------------------------------------------- */
const Icone = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const IconeSeta = () => (
  <Icone><path d="M5 12h14M13 6l6 6-6 6" /></Icone>
);
const IconeCheck = () => (
  <Icone><path d="M5 12.5l4.2 4.2L19 7" /></Icone>
);
const ICONES = {
  relogio: <Icone><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icone>,
  preco: <Icone><path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z" /><circle cx="8" cy="9" r="1.4" /></Icone>,
  vaga: <Icone><rect x="4" y="3.5" width="16" height="17" rx="3" /><path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3" /></Icone>,
  celular: <Icone><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></Icone>,
  carro: <Icone><path d="M4.2 15.5h15.6l-1.4-5.1a2.1 2.1 0 0 0-2-1.5H7.6a2.1 2.1 0 0 0-2 1.5l-1.4 5.1Z" /><path d="M3 15.5v2.2c0 .8.6 1.4 1.4 1.4h15.2c.8 0 1.4-.6 1.4-1.4v-2.2M6.1 19.1v1.4m11.8-1.4v1.4" /></Icone>,
  painel: <Icone><rect x="3.5" y="4" width="17" height="13" rx="2" /><path d="M8 20h8M7.5 13l3-3 2.5 2.5 3.5-4" /></Icone>,
  local: <Icone><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icone>,
};

/* -------------------------------------------------------------------------
   Conteúdo
   ------------------------------------------------------------------------- */
const CHECKS = [
  "Reserva grátis por 30 min",
  "Vagas PCD, 60+ e gestante",
  "Recibo no celular",
  "Tarifa travada na entrada",
];

const EM_CADA_VISITA = [
  "Placa conferida no totem",
  "Vaga indicada na hora",
  "Cobrança só do tempo usado",
  "Recibo salvo no app",
];

const PROMESSAS = [
  {
    icone: "relogio",
    titulo: "Sem fila",
    texto: "A placa é o seu ticket. Digitou no totem, a vaga aparece na hora.",
  },
  {
    icone: "preco",
    titulo: "Preço justo",
    texto: "A tarifa fica travada no momento da entrada e você paga só o tempo que usou.",
  },
  {
    icone: "vaga",
    titulo: "Vaga certa",
    texto: "Reserve a sua por 30 minutos, de graça. Vagas PCD, 60+ e gestante ficam para quem tem direito.",
  },
  {
    icone: "celular",
    titulo: "Tudo no celular",
    texto: "Saldo, recibos e o histórico de cada visita, em qualquer estacionamento da rede.",
  },
];

const PASSOS = [
  {
    titulo: "Chega e digita a placa",
    texto: "No totem da entrada, toque em ENTRADA e digite a placa. Em segundos ele confirma o acesso.",
  },
  {
    titulo: "Vai direto para a vaga",
    texto: "O totem mostra a vaga: a que você reservou no app ou a primeira livre do seu tipo.",
  },
  {
    titulo: "Sai sem passar no caixa",
    texto: "Na saída, toque em SAÍDA e digite a placa de novo. O tempo é descontado da carteira e o recibo vai para o app.",
  },
];

const LADOS = [
  {
    icone: "carro",
    titulo: "Para quem estaciona",
    itens: [
      "Uma carteira para todos os estacionamentos da rede",
      "Entra e sai digitando a placa",
      "Reserva e vagas especiais pelo app",
      "Recarga pelo app (simulada no protótipo)",
    ],
    acao: { texto: "Criar conta grátis", href: "/cadastro", classe: "btn-primary" },
  },
  {
    icone: "painel",
    titulo: "Para quem administra",
    itens: [
      "Quanto entrou hoje, na hora",
      "Quais vagas estão ocupadas agora",
      "Preço da hora ajustável quando quiser",
      "Histórico de tudo que entrou e saiu",
    ],
    acao: { texto: "Acesso administrativo", href: "/login?perfil=admin", classe: "btn-outline" },
  },
];

/* -------------------------------------------------------------------------
   Peças
   ------------------------------------------------------------------------- */

/* Bloco que surge ao entrar na tela (uma vez). */
function Surge({ children, atraso = 0, className = "", as: Tag = "div", ...resto }) {
  const [ref, visivel] = useRevelar();
  return (
    <Tag
      ref={ref}
      className={`surge ${visivel ? "surge-visivel" : ""} ${className}`}
      style={{ transitionDelay: `${atraso}ms` }}
      {...resto}
    >
      {children}
    </Tag>
  );
}

/* Linha de título que sobe palavra por palavra, cada uma saindo de trás de
   uma máscara. A ordem (--i) continua entre as linhas. */
function Linha({ texto, inicio = 0, destaque = false }) {
  return (
    <span className={`linha ${destaque ? "accent" : ""}`}>
      {texto.split(" ").map((palavra, i) => (
        // O espaço fica fora da máscara: dentro de um inline-block ele some.
        <Fragment key={palavra + i}>
          {i > 0 && " "}
          <span className="palavra">
            <span style={{ "--i": inicio + i }}>{palavra}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/* Passo a passo: a linha da esquerda enche conforme a rolagem e cada passo
   acende quando passa do meio da tela. Escreve no estilo, sem re-renderizar. */
function ComoFunciona() {
  const listaRef = useRef(null);

  useRolagem(() => {
    const lista = listaRef.current;
    if (!lista) return;
    const meio = window.innerHeight * 0.55;
    const r = lista.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (meio - r.top) / r.height));
    lista.style.setProperty("--progresso", p.toFixed(4));
    for (const passo of lista.children) {
      passo.toggleAttribute("data-ativo", passo.getBoundingClientRect().top + 24 < meio);
    }
  });

  return (
    <section id="como" className="secao como" aria-labelledby="como-titulo">
      <div className="container como-grade">
        <Surge className="como-fixo">
          <span className="sobrelinha">Como funciona</span>
          <h2 id="como-titulo" className="titulo-secao">
            Três momentos.
            <br />
            <span className="accent">Nenhuma fricção.</span>
          </h2>
          <p className="secao-lead">
            Do totem da entrada ao recibo no celular, sem papel e sem caixa.
          </p>
          <Link to="/cadastro" className="btn btn-primary">
            Criar conta grátis <IconeSeta />
          </Link>
        </Surge>

        <ol ref={listaRef} className="como-passos">
          {PASSOS.map((passo, i) => (
            <li key={passo.titulo} className="como-passo">
              <span className="como-no" aria-hidden="true" />
              <span className="como-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <h3>{passo.titulo}</h3>
              <p>{passo.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Página
   ------------------------------------------------------------------------- */
export default function Home() {
  return (
    <main className="home">
      {/* ---------------------------- HERO ---------------------------- */}
      <header id="topo" className="hero">
        <div className="hero-fundo" aria-hidden="true" />
        <div className="container hero-grade">
          <div className="hero-texto">
            <span className="sobrelinha hero-entra" style={{ "--d": 0 }}>
              Rede ParaAí · estacionamento inteligente
            </span>
            <h1 className="hero-titulo">
              <Linha texto="Digite a placa." inicio={1} />
              <Linha texto="Estacione." inicio={4} />
              <Linha texto="Vá embora." inicio={5} destaque />
            </h1>
            <p className="hero-sub hero-entra" style={{ "--d": 7 }}>
              Sem ticket, sem fila no caixa e sem troco. O totem confere a placa e
              indica a vaga; na saída, desconta da sua carteira só o tempo que você
              ficou.
            </p>
            <div className="hero-acoes hero-entra" style={{ "--d": 8 }}>
              <Link to="/cadastro" className="btn btn-primary btn-lg btn-seta">
                Criar conta grátis <IconeSeta />
              </Link>
              <a href="#como" className="btn btn-outline btn-lg">
                Como funciona
              </a>
            </div>
            <ul className="hero-checks hero-entra" style={{ "--d": 9 }}>
              {CHECKS.map((c) => (
                <li key={c}>
                  <IconeCheck />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-patio hero-entra" style={{ "--d": 5 }}>
            <PatioInterativo />
          </div>
        </div>

        <a href="#porque" className="hero-rolar" aria-label="Rolar para o conteúdo">
          <span>role</span>
          <i aria-hidden="true" />
        </a>
      </header>

      <Letreiro />

      {/* --------------------------- POR QUE --------------------------- */}
      <section id="porque" className="secao porque" aria-labelledby="porque-titulo">
        <div className="container porque-grade">
          <Surge className="porque-visual">
            <div className="porque-cartao ilha-escura">
              {/* A logo oficial (o arquivo), só como marca d'água. */}
              <img src="/logo.png" alt="" className="porque-logo" draggable="false" />
              <span className="chip-local">
                {ICONES.local}
                Rede ParaAí
              </span>
              <p className="porque-frase">
                Estacionar devia ser <span className="accent">a parte fácil.</span>
              </p>
              <span className="porque-faixas" aria-hidden="true" />
            </div>
            <div className="porque-lista">
              <span className="rotulo">Em cada visita</span>
              <ul>
                {EM_CADA_VISITA.map((item) => (
                  <li key={item}>
                    <IconeCheck />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Surge>

          <Surge className="porque-texto" atraso={120}>
            <span className="sobrelinha">Por que ParaAí</span>
            <h2 id="porque-titulo" className="titulo-secao">
              Menos papel.
              <br />
              <span className="accent">Mais tempo.</span>
            </h2>
            <p className="secao-lead">
              Estacionar ainda é pegar ticket, procurar o caixa, esperar troco e torcer
              para não perder o papel. O ParaAí troca tudo isso pela placa do carro.
            </p>
            <p>
              Do outro lado do portão, quem administra acompanha entradas, saídas e o
              caixa do dia em tempo real, sem ninguém na guarita.
            </p>
            <dl className="porque-numeros">
              <div>
                <dt>reserva grátis</dt>
                <dd>30 min</dd>
              </div>
              <div>
                <dt>tickets de papel</dt>
                <dd>0</dd>
              </div>
              <div>
                <dt>todos os dias</dt>
                <dd>24 h</dd>
              </div>
            </dl>
          </Surge>
        </div>
      </section>

      {/* -------------------------- PROMESSAS -------------------------- */}
      <section id="vantagens" className="secao promessas ilha-escura" aria-labelledby="promessas-titulo">
        <div className="container">
          <Surge className="secao-cabeca">
            <span className="sobrelinha">Nossas promessas</span>
            <h2 id="promessas-titulo" className="titulo-secao">
              Quatro coisas que
              <br />
              <span className="accent">não negociamos.</span>
            </h2>
          </Surge>
          <div className="promessas-grade">
            {PROMESSAS.map((p, i) => (
              <Surge key={p.titulo} atraso={i * 90} className="promessa-surge">
                <Holofote as="article" className="promessa">
                  <span className="promessa-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <span className="promessa-icone">{ICONES[p.icone]}</span>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </Holofote>
              </Surge>
            ))}
          </div>
        </div>
      </section>

      <ComoFunciona />

      {/* --------------------------- AO VIVO --------------------------- */}
      <section id="ao-vivo" className="secao aovivo-secao ilha-escura" aria-labelledby="aovivo-titulo">
        <div className="container aovivo-grade">
          <Surge className="aovivo-texto">
            <span className="sobrelinha">No app, ao vivo</span>
            <h2 id="aovivo-titulo" className="titulo-secao">
              Veja a vaga
              <br />
              <span className="accent">antes de sair.</span>
            </h2>
            <p className="secao-lead">
              O mapa de cada estacionamento mostra o que está livre, ocupado ou
              reservado, e as vagas especiais. Gostou de uma? Reserve por 30 minutos,
              sem custo.
            </p>
            <p className="aovivo-nota">
              Ao lado, uma simulação. No app, o mapa mostra o estacionamento de verdade.
            </p>
          </Surge>
          <Surge atraso={120}>
            <MapaAoVivo />
          </Surge>
        </div>
      </section>

      {/* -------------------------- PARA QUEM -------------------------- */}
      <section id="para-quem" className="secao paraquem" aria-labelledby="paraquem-titulo">
        <div className="container">
          <Surge className="secao-cabeca">
            <span className="sobrelinha">Dois lados</span>
            <h2 id="paraquem-titulo" className="titulo-secao">
              Serve pra quem para
              <br />
              <span className="accent">e pra quem cobra.</span>
            </h2>
          </Surge>
          <div className="paraquem-grade">
            {LADOS.map((lado, i) => (
              <Surge key={lado.titulo} atraso={i * 120} className="lado-surge">
                <Holofote as="article" className={`lado ${i === 1 ? "lado-escuro ilha-escura" : ""}`}>
                  <span className="lado-icone">{ICONES[lado.icone]}</span>
                  <h3>{lado.titulo}</h3>
                  <ul>
                    {lado.itens.map((item) => (
                      <li key={item}>
                        <IconeCheck />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link to={lado.acao.href} className={`btn ${lado.acao.classe} btn-block`}>
                    {lado.acao.texto}
                  </Link>
                </Holofote>
              </Surge>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------ CHAMADA FINAL ------------------------ */}
      <section className="secao chamada" aria-labelledby="chamada-titulo">
        <div className="container">
          <Surge className="chamada-painel ilha-escura">
            <span className="chamada-faixas" aria-hidden="true" />
            <h2 id="chamada-titulo" className="titulo-secao">
              Sua vaga
              <br />
              <span className="accent">está esperando.</span>
            </h2>
            <p>
              Crie a conta, cadastre a placa e pronto: a próxima entrada já é sem papel.
            </p>
            <div className="chamada-acoes">
              <Link to="/cadastro" className="btn btn-primary btn-lg btn-seta">
                Criar conta grátis <IconeSeta />
              </Link>
              <Link to="/login" className="btn btn-outline btn-lg">
                Já tenho conta
              </Link>
            </div>
          </Surge>
        </div>
      </section>

      {/* ---------------------------- RODAPÉ ---------------------------- */}
      <footer className="rodape ilha-escura">
        <div className="container rodape-grade">
          <div className="rodape-marca">
            <Logo size={38} />
            <p>A placa é o seu ticket.</p>
          </div>
          <nav className="rodape-coluna" aria-label="Produto">
            <h2>Produto</h2>
            <a href="#vantagens">Vantagens</a>
            <a href="#como">Como funciona</a>
            <a href="#ao-vivo">Mapa ao vivo</a>
            <a href="#para-quem">Para estacionamentos</a>
          </nav>
          <nav className="rodape-coluna" aria-label="Conta">
            <h2>Conta</h2>
            <Link to="/cadastro">Criar conta</Link>
            <Link to="/login">Entrar</Link>
            <Link to="/recuperar-senha">Esqueci a senha</Link>
          </nav>
          <div className="rodape-coluna">
            <h2>Projeto</h2>
            <p>Trabalho de conclusão de curso. Pagamentos e recargas são simulados.</p>
            <Link to="/login?perfil=admin">Acesso administrativo</Link>
          </div>
        </div>
        <p className="rodape-gigante" aria-hidden="true">
          PARA<span>AÍ</span>
        </p>
        <div className="container rodape-base">
          <span>© 2026 ParaAí</span>
          <span>estacionamento inteligente</span>
        </div>
      </footer>
    </main>
  );
}
