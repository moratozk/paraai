import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import { useRevealOnScroll } from "../hooks/useRevealOnScroll";
import "./Home.css";

const MARQUEE_ITENS = [
  "Monitoramento em tempo real",
  "Cobrança automática",
  "Totem de autoatendimento",
  "Carteira única na rede",
  "Sem cancela manual",
  "Painel de faturamento",
];

const RECURSOS = [
  {
    icone: "📡",
    titulo: "Sensores em cada vaga",
    texto:
      "Ultrassônicos ligados a um ESP32 detectam ocupação e sincronizam com a nuvem em segundos, vaga a vaga.",
    cor: "amber",
  },
  {
    icone: "🎫",
    titulo: "Acesso pela placa",
    texto:
      "O motorista digita a placa no totem. O sistema reconhece entrada ou saída, indica a vaga e libera o acesso.",
    cor: "cyan",
  },
  {
    icone: "💸",
    titulo: "Cobrança automática",
    texto:
      "O tempo é cronometrado e o valor debitado da carteira na saída. Sem caixa, sem fila, sem papel.",
    cor: "amber",
  },
  {
    icone: "📊",
    titulo: "Faturamento ao vivo",
    texto:
      "Receita por dia, ticket médio, permanência média e horário de pico — atualizados em tempo real.",
    cor: "cyan",
  },
  {
    icone: "🛰️",
    titulo: "Gestão remota",
    texto:
      "Acompanhe o pátio de qualquer lugar. O painel mostra até se o totem está online naquele instante.",
    cor: "amber",
  },
  {
    icone: "🔐",
    titulo: "Dados protegidos",
    texto:
      "Cada conta enxerga apenas o que é dela, com regras de segurança aplicadas no próprio banco de dados.",
    cor: "cyan",
  },
];

const FAQ = [
  {
    p: "Preciso comprar equipamento?",
    r: "Não. O ParaAí é um serviço: a tecnologia fica instalada no seu pátio e você paga pelo uso da plataforma. Instalação, manutenção e atualizações são por nossa conta.",
  },
  {
    p: "Funciona com quantas vagas?",
    r: "A plataforma é dimensionada para o seu pátio — você informa o número de vagas no cadastro e a operação se ajusta a ele.",
  },
  {
    p: "E se a internet cair?",
    r: "O totem continua operando e avisa claramente a situação em vez de travar. Assim que a conexão volta, ele se reconecta sozinho e sincroniza os dados.",
  },
  {
    p: "Como o motorista paga?",
    r: "Pela carteira ParaAí: ele mantém saldo na conta e o valor do tempo estacionado é debitado automaticamente na saída.",
  },
  {
    p: "Consigo acompanhar de fora do estacionamento?",
    r: "Sim. O painel é web: faturamento, ocupação vaga a vaga e histórico de acessos ficam disponíveis de qualquer lugar, em tempo real.",
  },
];

function useCountUp(alvo, duracao = 1600) {
  const [valor, setValor] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? alvo : 0
  );
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf;
    const inicio = performance.now();
    const tick = (agora) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      setValor(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [alvo, duracao]);
  return valor;
}

export default function Home() {
  useRevealOnScroll();
  const vagasMonitoradas = useCountUp(100);
  const [faqAberto, setFaqAberto] = useState(0);

  return (
    <div className="home">
      {/* ================= HERO ================= */}
      <section className="hero">
        <div className="hero-brilho" aria-hidden="true" />
        <div className="container hero-conteudo">
          <span className="chip chip-accent hero-chip">
            <span className="ponto-vivo" /> Plataforma para estacionamentos
          </span>

          <h1 className="hero-title">
            Seu pátio no
            <br />
            <span className="hero-destaque">piloto automático</span>
          </h1>

          <p className="hero-sub">
            Sensores em cada vaga, totem de autoatendimento e cobrança
            automática — tudo conectado a um painel que mostra seu faturamento
            em tempo real.
          </p>

          <div className="hero-actions">
            <Link to="/cadastro?perfil=operador" className="btn btn-primary btn-lg">
              Quero na minha operação
            </Link>
            <Link to="/cadastro" className="btn btn-outline btn-lg">
              Sou motorista
            </Link>
          </div>

          <div className="hero-selos">
            <span>✓ Sem cancela manual</span>
            <span>✓ Sem caixa</span>
            <span>✓ Sem papel</span>
          </div>
        </div>

        <div className="road" aria-hidden="true">
          <div className="lane-anim" />
          <span className="drive-car">🚗</span>
        </div>
      </section>

      {/* ================= MARQUEE ================= */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE_ITENS, ...MARQUEE_ITENS].map((item, i) => (
            <span className="marquee-item" key={i}>{item}</span>
          ))}
        </div>
      </div>

      {/* ================= NÚMEROS ================= */}
      <section className="metrics">
        <div className="container metrics-grid">
          <div className="metric" data-reveal>
            <span className="metric-value">{vagasMonitoradas}%</span>
            <span className="metric-label">das vagas monitoradas ao vivo</span>
          </div>
          <div className="metric" data-reveal style={{ transitionDelay: "90ms" }}>
            <span className="metric-value">0</span>
            <span className="metric-label">cancelas manuais na operação</span>
          </div>
          <div className="metric" data-reveal style={{ transitionDelay: "180ms" }}>
            <span className="metric-value">24/7</span>
            <span className="metric-label">acompanhamento remoto do pátio</span>
          </div>
        </div>
      </section>

      {/* ================= RECURSOS ================= */}
      <section className="recursos" id="recursos">
        <div className="container">
          <div className="secao-cabecalho" data-reveal>
            <span className="chip">O que você recebe</span>
            <h2 className="section-title">Tecnologia ponta a ponta</h2>
            <p className="section-sub">
              Do sensor na vaga ao relatório de faturamento — um sistema só,
              funcionando sozinho.
            </p>
          </div>

          <div className="recursos-grid">
            {RECURSOS.map((r, i) => (
              <article
                className={`card recurso ${r.cor}`}
                key={r.titulo}
                data-reveal
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <span className="recurso-icone">{r.icone}</span>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= DOIS LADOS ================= */}
      <section className="sides" id="para-quem">
        <div className="container">
          <div className="secao-cabecalho" data-reveal>
            <span className="chip">Para quem é</span>
            <h2 className="section-title">Um sistema, dois lados</h2>
          </div>

          <div className="sides-grid">
            <div className="card side-card card-glow" data-reveal>
              <span className="side-tag">Para o seu estacionamento</span>
              <ul className="side-list">
                <li>Faturamento em tempo real, dia a dia</li>
                <li>Relatório de acessos e movimentações</li>
                <li>Ocupação vaga a vaga, ao vivo</li>
                <li>Exportação dos dados em CSV</li>
              </ul>
              <Link to="/cadastro?perfil=operador" className="btn btn-primary">
                Cadastrar meu estacionamento
              </Link>
            </div>

            <div className="card side-card" data-reveal style={{ transitionDelay: "110ms" }}>
              <span className="side-tag cyan">Para quem estaciona</span>
              <ul className="side-list cyan">
                <li>Carteira única: um saldo para toda a rede</li>
                <li>Entra e sai só digitando a placa</li>
                <li>Recibo e histórico de cada uso</li>
                <li>Recarga em segundos, sem filas</li>
              </ul>
              <Link to="/cadastro" className="btn btn-outline">
                Criar conta de motorista
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= COMO FUNCIONA ================= */}
      <section className="steps" id="como-funciona">
        <div className="container">
          <div className="secao-cabecalho" data-reveal>
            <span className="chip">Passo a passo</span>
            <h2 className="section-title">Como funciona</h2>
          </div>

          <div className="steps-grid">
            {[
              {
                n: "01",
                t: "Instalamos a tecnologia",
                d: "Totem touch, sensores em cada vaga e controle de acesso automático, integrados à nuvem.",
              },
              {
                n: "02",
                t: "O motorista digita a placa",
                d: "O totem valida o cadastro, indica a vaga livre e libera o acesso na hora.",
              },
              {
                n: "03",
                t: "Você acompanha tudo",
                d: "Faturamento, acessos e ocupação em tempo real — de qualquer lugar.",
              },
            ].map((s, i) => (
              <div className="step" key={s.n} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="step-num">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="faq" id="duvidas">
        <div className="container faq-inner">
          <div className="secao-cabecalho" data-reveal>
            <span className="chip">Dúvidas</span>
            <h2 className="section-title">Perguntas frequentes</h2>
          </div>

          <div className="faq-lista" data-reveal>
            {FAQ.map((item, i) => {
              const aberto = faqAberto === i;
              return (
                <div className={`faq-item ${aberto ? "aberto" : ""}`} key={i}>
                  <button
                    className="faq-pergunta"
                    onClick={() => setFaqAberto(aberto ? -1 : i)}
                    aria-expanded={aberto}
                  >
                    <span>{item.p}</span>
                    <span className="faq-sinal" aria-hidden="true">
                      {aberto ? "−" : "+"}
                    </span>
                  </button>
                  <div className="faq-resposta">
                    <p>{item.r}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="cta">
        <div className="container">
          <div className="cta-caixa" data-reveal>
            <div className="cta-brilho" aria-hidden="true" />
            <h2 className="cta-title">Bora automatizar seu pátio?</h2>
            <p className="cta-sub">
              Cadastre seu estacionamento e veja o painel funcionando em minutos.
            </p>
            <div className="cta-acoes">
              <Link to="/cadastro?perfil=operador" className="btn btn-primary btn-lg">
                Começar agora
              </Link>
              <Link to="/login" className="btn btn-ghost btn-lg">
                Já tenho conta
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Logo size={32} />
            <p>Tecnologia de estacionamento como serviço.</p>
          </div>
          <nav className="footer-links">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#para-quem">Para quem</a>
            <a href="#duvidas">Dúvidas</a>
            <Link to="/login">Entrar</Link>
            <Link to="/cadastro">Criar conta</Link>
          </nav>
        </div>
        <div className="container footer-base">
          <span>ParaAí © 2026 — Projeto acadêmico (TCC)</span>
          <span className="footer-tech">ESP32 · React · Firebase</span>
        </div>
      </footer>
    </div>
  );
}
