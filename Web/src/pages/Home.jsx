import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "./Home.css";

const MARQUEE_ITENS = [
  "Monitoramento em tempo real",
  "Cobrança automática",
  "Totem de autoatendimento",
  "Carteira única na rede",
  "Sem cancela manual",
  "Painel de faturamento",
];

// Contador animado (ease-out) para os números do hero
function useCountUp(alvo, duracao = 1400) {
  const [valor, setValor] = useState(0);
  useEffect(() => {
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
  const pctMonitorado = useCountUp(100);

  return (
    <div className="home">
      {/* ---------------- HERO ---------------- */}
      <section className="hero">
        <div className="container">
          <span className="stencil-badge">
            Software + hardware para estacionamentos
          </span>
          <h1 className="hero-title">
            Seu estacionamento
            <br />
            no <span className="hero-title-accent">piloto automático.</span>
          </h1>
          <p className="hero-sub">
            O ParaAí entrega o kit completo — totem de autoatendimento,
            sensores de vaga e painel de gestão — para o seu pátio operar
            sozinho: sem cancela manual, sem caixa, sem papel.
          </p>
          <div className="hero-actions">
            <Link to="/cadastro?perfil=operador" className="btn btn-primary">
              Quero na minha operação
            </Link>
            <Link to="/cadastro" className="btn btn-outline">
              Sou motorista
            </Link>
          </div>
        </div>

        {/* estrada animada */}
        <div className="road" aria-hidden="true">
          <div className="lane-anim" />
          <span className="drive-car">🚗</span>
        </div>
      </section>

      {/* ---------------- MARQUEE ---------------- */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE_ITENS, ...MARQUEE_ITENS].map((item, i) => (
            <span className="marquee-item" key={i}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------- NÚMEROS ---------------- */}
      <section className="metrics">
        <div className="container metrics-grid">
          <div className="metric">
            <span className="metric-value">{pctMonitorado}%</span>
            <span className="metric-label">das vagas monitoradas ao vivo</span>
          </div>
          <div className="metric">
            <span className="metric-value">0</span>
            <span className="metric-label">cancelas manuais na operação</span>
          </div>
          <div className="metric">
            <span className="metric-value">24/7</span>
            <span className="metric-label">acompanhamento remoto do pátio</span>
          </div>
        </div>
      </section>

      {/* ---------------- DOIS LADOS ---------------- */}
      <section className="sides" id="para-quem">
        <div className="container">
          <h2 className="section-title">Um sistema, dois lados</h2>
          <div className="sides-grid">
            <div className="card side-card">
              <span className="side-tag">Para o seu estacionamento</span>
              <ul className="side-list">
                <li>Faturamento em tempo real, dia a dia</li>
                <li>Relatório de acessos e movimentações</li>
                <li>Ocupação vaga a vaga, ao vivo</li>
                <li>Cobrança automática por minuto</li>
              </ul>
              <Link to="/cadastro?perfil=operador" className="btn btn-primary">
                Cadastrar meu estacionamento
              </Link>
            </div>

            <div className="card side-card">
              <span className="side-tag">Para quem estaciona</span>
              <ul className="side-list">
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

      {/* ---------------- COMO FUNCIONA ---------------- */}
      <section className="steps" id="como-funciona">
        <div className="container">
          <h2 className="section-title">Como funciona</h2>
          <div className="steps-grid">
            <div className="step">
              <span className="step-num">01</span>
              <h3>Instalamos o kit</h3>
              <p>
                Totem touch, sensores ultrassônicos em cada vaga e catraca
                automática, tudo já integrado à nuvem.
              </p>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <h3>O motorista digita a placa</h3>
              <p>
                O totem valida o cadastro, indica a vaga livre e libera a
                catraca. Na saída, cobra pelo tempo e emite o registro.
              </p>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <h3>Você acompanha tudo</h3>
              <p>
                Faturamento, acessos e ocupação em tempo real no painel — de
                qualquer lugar, sem estar no pátio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- O KIT ---------------- */}
      <section className="kit" id="kit">
        <div className="container kit-inner">
          <div>
            <h2 className="section-title left">O que vai no kit</h2>
            <p className="kit-sub">
              Hardware instalado no seu pátio + software na nuvem, funcionando
              como um só produto.
            </p>
          </div>
          <ul className="kit-list">
            <li>Totem touch de autoatendimento</li>
            <li>Sensor ultrassônico por vaga</li>
            <li>Catraca automática</li>
            <li>Painel web de gestão e faturamento</li>
          </ul>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="cta">
        <div className="hazard-stripe" />
        <div className="cta-band">
          <div className="container cta-inner">
            <h2 className="cta-title">Bora automatizar seu pátio?</h2>
            <Link to="/cadastro?perfil=operador" className="btn cta-btn">
              Começar agora
            </Link>
          </div>
        </div>
        <div className="hazard-stripe" />
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Logo size={30} />
            <p>Tecnologia de estacionamento: software + hardware.</p>
          </div>
          <nav className="footer-links">
            <a href="#como-funciona">Como funciona</a>
            <a href="#kit">O kit</a>
            <Link to="/login">Entrar</Link>
            <Link to="/cadastro">Criar conta</Link>
          </nav>
        </div>
        <div className="container footer-base">
          <span>ParaAí © 2026 — Projeto acadêmico (TCC)</span>
        </div>
      </footer>
    </div>
  );
}
