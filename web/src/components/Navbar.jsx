import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useRolagem, useSecaoAtiva } from "../hooks/useScrollFX";
import { instalarApp, useInstalacaoApp } from "../pwa";
import Logo from "./Logo";
import "./Navbar.css";

/* Ícones do seletor de tema. Em SVG porque emoji varia de desenho e de
   métrica entre sistemas, e sai desalinhado dentro do botão. */
function IconeSol() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

function IconeLua() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13.2A8.2 8.2 0 1 1 10.8 4a6.4 6.4 0 0 0 9.2 9.2z" />
    </svg>
  );
}

// Ícones das linhas do menu do celular, no mesmo traço dos do tema.
const TRACOS_DO_ICONE = {
  painel: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  local: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  historico: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  instalar: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 20h14" />,
  sair: <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5M15.5 16.5 20 12l-4.5-4.5M20 12H9" />,
  seta: <path d="m9.5 6 6 6-6 6" />,
};

function Icone({ nome, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {TRACOS_DO_ICONE[nome]}
    </svg>
  );
}

// Seções da Home, na ordem em que aparecem na página.
const SECOES_HOME = [
  { id: "vantagens", label: "Vantagens" },
  { id: "como", label: "Como funciona" },
  { id: "ao-vivo", label: "Mapa ao vivo" },
  { id: "para-quem", label: "Para estacionamentos" },
];
const IDS_HOME = ["topo", ...SECOES_HOME.map((s) => s.id)];

export default function Navbar() {
  const { user, userData, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // O menu carrega junto a rota em que foi aberto: ao navegar, a rota muda e
  // o menu é considerado fechado sem precisar de setState num efeito.
  const [menuEm, setMenuEm] = useState(null);
  const menuAberto = menuEm === location.pathname;
  const setMenuAberto = (abrir) => setMenuEm(abrir ? location.pathname : null);

  // menu do avatar (dropdown)
  const [contaAberta, setContaAberta] = useState(false);
  const contaRef = useRef(null);

  // "Instalar o app" só aparece quando o navegador instala (ou no iPhone).
  const instalacao = useInstalacaoApp();

  // A barra só fica transparente no topo da home, onde há a foto do hero atrás.
  // Em qualquer outra página ela é sólida desde o início — senão o topo vira
  // uma faixa de cor diferente colada no conteúdo.
  const naHome = location.pathname === "/";
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 24);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);
  const barraSolida = !naHome || rolou;

  // Na Home: o link da seção que está no meio da tela fica marcado, e uma
  // linha âmbar no topo mostra quanto da página já foi lida.
  const homePublica = naHome && !user;
  const secaoAtiva = useSecaoAtiva(IDS_HOME, homePublica);
  const progressoRef = useRef(null);
  useRolagem(() => {
    const barra = progressoRef.current;
    if (!barra) return;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    barra.style.transform = `scaleX(${total > 0 ? Math.min(1, window.scrollY / total) : 0})`;
  });

  // Menu do celular aberto: a página por trás não rola e o ESC fecha.
  useEffect(() => {
    if (!menuAberto) return undefined;
    const raiz = document.documentElement;
    raiz.classList.add("menu-mobile-aberto");
    function aoTeclar(e) {
      if (e.key === "Escape") setMenuEm(null);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      raiz.classList.remove("menu-mobile-aberto");
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [menuAberto]);

  // fecha ao clicar fora ou apertar ESC
  useEffect(() => {
    if (!contaAberta) return undefined;
    function aoClicar(e) {
      if (contaRef.current && !contaRef.current.contains(e.target)) {
        setContaAberta(false);
      }
    }
    function aoTeclar(e) {
      if (e.key === "Escape") setContaAberta(false);
    }
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [contaAberta]);

  async function handleLogout() {
    setContaAberta(false);
    await logout();
    toast.info("Você saiu da sua conta.");
    navigate("/login");
  }

  function irPara(rota) {
    setContaAberta(false);
    navigate(rota);
  }

  async function handleInstalar() {
    setContaAberta(false);
    setMenuAberto(false);
    if (instalacao === "ios") {
      toast.info("Para instalar, toque em Compartilhar e depois em “Adicionar à Tela de Início”.");
      return;
    }
    if ((await instalarApp()) === "accepted") {
      toast.sucesso("Pronto: o ParaAí foi instalado neste aparelho.");
    }
  }

  const operador = userData?.role === "operador";
  const admin = userData?.role === "admin";
  const nome = userData?.name || user?.displayName || "Usuário";
  const inicial = nome[0].toUpperCase();
  const papel = admin ? "Administrador" : operador ? "Estacionamento" : "Motorista";
  const foto = userData?.photoURL || user?.photoURL;
  // Foto da conta ou a inicial do nome: no botão da conta, no botão do menu
  // do celular e no topo dos dois menus.
  const avatar = foto ? (
    <img src={foto} alt="" className="avatar" />
  ) : (
    <span className="avatar avatar-placeholder">{inicial}</span>
  );

  // Links de navegação principais (Perfil/Config saíram para o menu do avatar)
  const links = user
    ? admin
      ? [{ to: "/dashboard", label: "Administração", icone: "painel" }]
      : operador
      ? [
          { to: "/dashboard", label: "Painel", icone: "painel" },
          { to: "/historico", label: "Movimentações", icone: "historico" },
        ]
      : [
          { to: "/dashboard", label: "Painel", icone: "painel" },
          { to: "/estacionamentos", label: "Estacionamentos", icone: "local" },
          { to: "/historico", label: "Meus acessos", icone: "historico" },
        ]
    : [];
  // As telas de um estacionamento da rede (vagas ao vivo, maquete) contam
  // como Administração.
  const rotaAtiva = (to) =>
    location.pathname === to ||
    (admin && to === "/dashboard" && location.pathname.startsWith("/admin/"));

  // Linha do menu do celular. Tocar na tela em que já se está também fecha
  // o menu (a rota não muda, então ele não fecharia sozinho).
  const linhaDoMenu = ({ to, label, icone }) => (
    <Link
      key={to}
      to={to}
      className={`menu-mobile-linha ${rotaAtiva(to) ? "ativo" : ""}`}
      aria-current={rotaAtiva(to) ? "page" : undefined}
      onClick={() => setMenuAberto(false)}
    >
      <Icone nome={icone} />
      <span>{label}</span>
      <Icone nome="seta" className="menu-mobile-seta" />
    </Link>
  );

  return (
    <header
      className={`navbar ${barraSolida ? "navbar-rolou" : ""} ${homePublica ? "navbar-home" : ""}`}
    >
      {homePublica && <span ref={progressoRef} className="navbar-progresso" aria-hidden="true" />}
      <div className="container navbar-inner">
        <Link to="/" className="navbar-logo" aria-label="ParaAí — início">
          <Logo size={34} />
        </Link>

        <nav className="navbar-links">
          {user ? (
            links.map((l) => (
              <Link key={l.to} to={l.to} className={rotaAtiva(l.to) ? "ativo" : ""}>
                {l.label}
              </Link>
            ))
          ) : homePublica ? (
            SECOES_HOME.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={secaoAtiva === s.id ? "ativo" : ""}
                aria-current={secaoAtiva === s.id ? "location" : undefined}
              >
                {s.label}
              </a>
            ))
          ) : (
            <a href="/#como">Como funciona</a>
          )}
        </nav>

        <div className="navbar-actions">
          {/* O tema fica sempre à vista, fora do menu da conta e do hamburger:
              é um ajuste que a pessoa procura na hora, não algo escondido. */}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro"}
            aria-label={theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro"}
          >
            {theme === "light" ? <IconeLua /> : <IconeSol />}
          </button>

          {user ? (
            <div className="conta-wrap" ref={contaRef}>
              <button
                type="button"
                className={`conta-botao ${contaAberta ? "aberto" : ""}`}
                onClick={() => setContaAberta((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={contaAberta}
                aria-label="Menu da conta"
              >
                {avatar}
                <span className="user-bloco">
                  <span className="user-name">{nome}</span>
                  <span className="user-papel">{papel}</span>
                </span>
                <span className={`conta-seta ${contaAberta ? "girada" : ""}`}>
                  ▾
                </span>
              </button>

              {contaAberta && (
                <div className="conta-menu" role="menu">
                  <div className="conta-menu-topo">
                    {avatar}
                    <div className="conta-menu-info">
                      <strong>{nome}</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>

                  <div className="conta-menu-lista">
                    <button role="menuitem" onClick={() => irPara("/perfil")}>
                      <span aria-hidden="true">👤</span> Meu perfil
                    </button>
                    <button role="menuitem" onClick={() => irPara("/configuracoes")}>
                      <span aria-hidden="true">⚙️</span> Configurações
                    </button>
                    {instalacao && (
                      <button role="menuitem" onClick={handleInstalar}>
                        <span aria-hidden="true">📲</span> Instalar o app
                      </button>
                    )}
                  </div>

                  <div className="conta-menu-rodape">
                    <button role="menuitem" className="sair" onClick={handleLogout}>
                      <span aria-hidden="true">⏻</span> Sair da conta
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">
                Entrar
              </Link>
              <Link to="/cadastro" className="btn btn-primary btn-sm">
                Criar conta
              </Link>
            </>
          )}
        </div>

        {/* No celular o menu da conta e o de navegação são um só: logado, o
            botão leva a inicial (ou a foto) junto dos três traços. */}
        <button
          type="button"
          className={`menu-hamburguer ${menuAberto ? "aberto" : ""} ${user ? "com-conta" : ""}`}
          onClick={() => setMenuAberto(!menuAberto)}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
          aria-controls="menu-mobile"
        >
          {user && avatar}
          <span className="menu-tracos" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>

      {/* ---- menu mobile ---- */}
      {/* Véu sobre a página: escurece o que ficou atrás e fecha ao tocar. */}
      <div
        className={`menu-mobile-veu ${menuAberto ? "aberto" : ""}`}
        aria-hidden="true"
        onClick={() => setMenuAberto(false)}
      />
      <div id="menu-mobile" className={`menu-mobile ${menuAberto ? "aberto" : ""}`}>
        <div className="container menu-mobile-inner">
          {user ? (
            <>
              <div className="menu-mobile-user">
                {avatar}
                <div>
                  <strong>{nome}</strong>
                  <span className="user-papel">{papel}</span>
                  <span className="menu-mobile-email">{user.email}</span>
                </div>
              </div>
              <nav className="menu-mobile-grupo" aria-label="Navegação">
                {links.map(linhaDoMenu)}
              </nav>
              <div className="menu-mobile-grupo">
                {linhaDoMenu({ to: "/perfil", label: "Meu perfil", icone: "perfil" })}
                {linhaDoMenu({ to: "/configuracoes", label: "Configurações", icone: "ajustes" })}
                {instalacao && (
                  <button type="button" className="menu-mobile-linha" onClick={handleInstalar}>
                    <Icone nome="instalar" />
                    <span>Instalar o app</span>
                  </button>
                )}
              </div>
              <button type="button" className="menu-mobile-linha menu-mobile-sair" onClick={handleLogout}>
                <Icone nome="sair" />
                <span>Sair da conta</span>
              </button>
            </>
          ) : (
            <>
              <nav className="menu-mobile-grupo" aria-label="Seções da página inicial">
                {SECOES_HOME.map((s) => (
                  <a
                    key={s.id}
                    href={`/#${s.id}`}
                    className="menu-mobile-linha"
                    onClick={() => setMenuAberto(false)}
                  >
                    <span>{s.label}</span>
                    <Icone nome="seta" className="menu-mobile-seta" />
                  </a>
                ))}
                {instalacao && (
                  <button type="button" className="menu-mobile-linha" onClick={handleInstalar}>
                    <span>Instalar o app</span>
                  </button>
                )}
              </nav>
              <div className="menu-mobile-entrar">
                <Link to="/login" className="btn btn-outline" onClick={() => setMenuAberto(false)}>
                  Entrar
                </Link>
                <Link to="/cadastro" className="btn btn-primary" onClick={() => setMenuAberto(false)}>
                  Criar conta
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
