import { useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { LogoMark } from "../components/Logo";
import Imagem from "../components/Imagem";
import { useAuth } from "../context/AuthContext";
import {
  useProgressoScroll,
  useRevelar,
  entre,
  faixa,
} from "../hooks/useScrollFX";
import "./Home.css";

/* -------------------------------------------------------------------------
   Conteúdo
   ------------------------------------------------------------------------- */
const CAPITULOS = [
  {
    n: "01",
    foto: "photo-1449965408869-eaa3f722e40d",
    alt: "Rampa de acesso de um estacionamento coberto",
    titulo: "Chega e para",
    texto:
      "Você digita a placa na tela da entrada. A cancela abre em segundos e o sistema já sabe qual vaga é sua.",
    marca: "entrada",
  },
  {
    n: "02",
    foto: "photo-1573348722427-f1d6819fdf98",
    alt: "Vagas demarcadas em piso de concreto",
    titulo: "A vaga já te espera",
    texto:
      "O sistema sabe quais vagas estão ocupadas e quais estão livres, o tempo todo. Você não precisa dar voltas procurando.",
    marca: "ocupação",
  },
  {
    n: "03",
    foto: "photo-1506521781263-d8422e82f27a",
    alt: "Vista aérea de um estacionamento com carros",
    titulo: "Sai e pronto",
    texto:
      "Na saída, o valor do tempo que você ficou é descontado automaticamente. Nada de procurar moeda ou guardar papel.",
    marca: "cobrança",
  },
];

const NUMEROS = [
  { valor: "4s", rotulo: "da placa até a cancela abrir" },
  { valor: "0", rotulo: "filas no caixa" },
  { valor: "0", rotulo: "tickets para guardar" },
  { valor: "24h", rotulo: "funcionando todo dia" },
];

const PARA_QUEM = [
  {
    titulo: "Para quem estaciona",
    itens: [
      "Uma carteira só para todos os estacionamentos",
      "Entra digitando a placa",
      "Recibos guardados no celular",
      "Recarrega por PIX ou cartão",
    ],
    acao: { texto: "Criar conta grátis", href: "/cadastro" },
    foto: "photo-1502877338535-766e1452684a",
    alt: "Carro em movimento numa via urbana",
  },
  {
    titulo: "Para quem administra",
    itens: [
      "Quanto entrou hoje, na hora",
      "Quais vagas estão ocupadas agora",
      "Mude o preço quando quiser",
      "Histórico de tudo que entrou e saiu",
    ],
    acao: { texto: "Cadastrar estacionamento", href: "/cadastro" },
    foto: "photo-1486406146926-c627a92ad1ab",
    alt: "Fachada de edifício com linhas geométricas",
  },
];

/* -------------------------------------------------------------------------
   Capítulo: a foto acompanha a rolagem num ritmo próprio
   ------------------------------------------------------------------------- */
function Capitulo({ dados, indice }) {
  const ref = useRef(null);
  const p = useProgressoScroll(ref);

  // A foto se move mais devagar que o texto. Essa diferença de ritmo é o
  // que dá a sensação de profundidade.
  const deslocamento = entre(p, -14, 14);
  const escala = faixa(p, [0, 0.5, 1], [1.18, 1.02, 1.18]);
  const opacidade = faixa(p, [0, 0.22, 0.78, 1], [0, 1, 1, 0]);

  const impar = indice % 2 === 1;

  return (
    <section
      ref={ref}
      className={`capitulo ${impar ? "capitulo-invertido" : ""}`}
      aria-labelledby={`cap-${dados.n}`}
    >
      <div className="capitulo-media">
        <div
          className="capitulo-foto-wrap"
          style={{ transform: `translate3d(0, ${deslocamento}%, 0) scale(${escala})` }}
        >
          <Imagem src={dados.foto} alt={dados.alt} className="capitulo-foto" />
        </div>
        <span className="capitulo-numero" aria-hidden="true">
          {dados.n}
        </span>
      </div>

      <div className="capitulo-texto" style={{ opacity: opacidade }}>
        <span className="rotulo">{dados.marca}</span>
        <h2 id={`cap-${dados.n}`}>{dados.titulo}</h2>
        <p>{dados.texto}</p>
      </div>
    </section>
  );
}

/* Bloco que surge ao entrar na tela */
function Surge({ children, atraso = 0, className = "", as: Tag = "div" }) {
  const [ref, visivel] = useRevelar();
  return (
    <Tag
      ref={ref}
      className={`surge ${visivel ? "surge-visivel" : ""} ${className}`}
      style={{ transitionDelay: `${atraso}ms` }}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------
   Página
   ------------------------------------------------------------------------- */
export default function Home() {
  const { user } = useAuth();
  const heroRef = useRef(null);
  const heroP = useProgressoScroll(heroRef);

  // A landing explica o produto para quem ainda não tem conta. Depois do
  // login, a entrada útil passa a ser o painel adequado ao papel da pessoa.
  if (user) return <Navigate to="/dashboard" replace />;

  // O hero começa no topo da tela, então só interessa a segunda metade da
  // faixa de progresso — daí o remapeamento.
  const saida = faixa(heroP, [0.5, 1], [0, 1]);

  return (
    <main className="home">

      {/* ---------------------------- HERO ---------------------------- */}
      <header ref={heroRef} className="hero">
        <div
          className="hero-foto-wrap"
          style={{
            transform: `translate3d(0, ${entre(saida, 0, 26)}%, 0) scale(${entre(saida, 1, 1.2)})`,
          }}
        >
          <Imagem
            src="photo-1590674899484-d5640e854abe"
            alt="Interior de um estacionamento coberto com vagas demarcadas"
            className="hero-foto"
            eager
            largura={2000}
          />
        </div>
        <div className="hero-veu" aria-hidden="true" />

        <div
          className="hero-conteudo container"
          style={{
            transform: `translate3d(0, ${entre(saida, 0, -38)}%, 0)`,
            opacity: faixa(saida, [0, 0.75], [1, 0]),
          }}
        >
          <h1 className="hero-titulo revelar" style={{ animationDelay: "0.15s" }}>
            Para<span className="hero-marca">Aí</span>
          </h1>

          <p className="hero-lema revelar" style={{ animationDelay: "0.3s" }}>
            O seu estacionamento inteligente
          </p>

          <p className="hero-sub revelar" style={{ animationDelay: "0.44s" }}>
            Digite a placa, estacione e vá embora. O pagamento sai da sua
            carteira digital sozinho — sem ticket, sem fila, sem troco.
          </p>

          <div className="hero-acoes revelar" style={{ animationDelay: "0.58s" }}>
            <Link to="/cadastro" className="btn btn-primary btn-lg">
              Começar agora
            </Link>
            <a href="#como" className="btn btn-outline btn-lg">
              Ver como funciona
            </a>
          </div>
        </div>

        
      </header>

      {/* -------------------------- CAPÍTULOS -------------------------- */}
      <div id="como" className="capitulos">
        <Surge className="container capitulos-intro">
          <span className="rotulo">como funciona</span>
          <h2 className="titulo-secao">
            Três momentos.
            <br />
            <span className="accent">Nenhuma fricção.</span>
          </h2>
        </Surge>

        {CAPITULOS.map((cap, i) => (
          <Capitulo key={cap.n} dados={cap} indice={i} />
        ))}
      </div>

      {/* --------------------------- NÚMEROS --------------------------- */}
      <section className="numeros" aria-label="Números do sistema">
        <div className="zebra" aria-hidden="true" />
        <div className="container numeros-grade">
          {NUMEROS.map((n, i) => (
            <Surge key={n.rotulo} className="numero" atraso={i * 80}>
              <span className="numero-valor">{n.valor}</span>
              <span className="numero-rotulo">{n.rotulo}</span>
            </Surge>
          ))}
        </div>
        <div className="zebra" aria-hidden="true" />
      </section>

      {/* --------------------------- PÚBLICO --------------------------- */}
      <section className="publico">
        <div className="container">
          <Surge>
            <span className="rotulo">dois lados</span>
            <h2 className="titulo-secao">
              Serve pra quem para
              <br />
              <span className="accent">e pra quem cobra</span>
            </h2>
          </Surge>

          <div className="publico-grade">
            {PARA_QUEM.map((bloco, i) => (
              <Surge
                key={bloco.titulo}
                as="article"
                className="publico-card"
                atraso={i * 120}
              >
                <div className="publico-foto">
                  <Imagem src={bloco.foto} alt={bloco.alt} largura={900} />
                </div>
                <div className="publico-corpo">
                  <h3>{bloco.titulo}</h3>
                  <ul>
                    {bloco.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Link to={bloco.acao.href} className="btn btn-outline btn-block">
                    {bloco.acao.texto}
                  </Link>
                </div>
              </Surge>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------ CHAMADA FINAL ------------------------ */}
      <section className="chamada">
        <Imagem
          src="photo-1517672651691-24622a91b550"
          alt=""
          className="chamada-foto"
          largura={1800}
        />
        <div className="chamada-veu" aria-hidden="true" />
        <Surge className="container chamada-conteudo">
          <h2 className="chamada-titulo">
            Seu estacionamento
            <br />
            sem ninguém na guarita
          </h2>
          <p>
            Crie a conta, cadastre seu estacionamento e comece a usar hoje.
          </p>
          <div className="chamada-acoes">
            <Link to="/cadastro" className="btn btn-primary btn-lg">
              Criar conta
            </Link>
            <Link to="/login" className="btn btn-outline btn-lg">
              Já tenho conta
            </Link>
          </div>
        </Surge>
      </section>

      {/* ---------------------------- RODAPÉ ---------------------------- */}
      <footer className="rodape">
        <div className="container rodape-inner">
          <div className="rodape-marca">
            <LogoMark size={34} />
            <div>
              <strong>ParaAí</strong>
              <span className="mono">estacionamento inteligente</span>
            </div>
          </div>
          <nav className="rodape-links" aria-label="Links do rodapé">
            <a href="#como">Como funciona</a>
            <Link to="/login">Entrar</Link>
            <Link to="/cadastro">Criar conta</Link>
          </nav>
        </div>
        <div className="container rodape-base">
          <span className="mono">estacionamento inteligente</span>
          <span className="mono">projeto acadêmico · 2026</span>
        </div>
      </footer>
    </main>
  );
}
