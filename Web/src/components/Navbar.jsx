import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
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

  const operador = userData?.role === "operador";
  const nome = userData?.name || user?.displayName || "Usuário";
  const inicial = nome[0].toUpperCase();

  // Links de navegação principais (Perfil/Config saíram para o menu do avatar)
  const links = user
    ? operador
      ? [
          { to: "/dashboard", label: "Painel" },
          { to: "/historico", label: "Movimentações" },
        ]
      : [
          { to: "/dashboard", label: "Painel" },
          { to: "/historico", label: "Meus acessos" },
        ]
    : [];

  return (
    <header className={`navbar ${barraSolida ? "navbar-rolou" : ""}`}>
      <div className="container navbar-inner">
        <Link to="/" className="navbar-logo" aria-label="ParaAí — início">
          <Logo size={34} />
        </Link>

        <nav className="navbar-links">
          {user ? (
            links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={location.pathname === l.to ? "ativo" : ""}
              >
                {l.label}
              </Link>
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
                {userData?.photoURL || user?.photoURL ? (
                  <img
                    src={userData?.photoURL || user?.photoURL}
                    alt=""
                    className="avatar"
                  />
                ) : (
                  <div className="avatar avatar-placeholder">{inicial}</div>
                )}
                <span className="user-bloco">
                  <span className="user-name">{nome}</span>
                  <span className="user-papel">
                    {operador ? "Estacionamento" : "Motorista"}
                  </span>
                </span>
                <span className={`conta-seta ${contaAberta ? "girada" : ""}`}>
                  ▾
                </span>
              </button>

              {contaAberta && (
                <div className="conta-menu" role="menu">
                  <div className="conta-menu-topo">
                    <div className="avatar avatar-placeholder">{inicial}</div>
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

        <button
          type="button"
          className={`menu-hamburguer ${menuAberto ? "aberto" : ""}`}
          onClick={() => setMenuAberto(!menuAberto)}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {/* ---- menu mobile ---- */}
      <div className={`menu-mobile ${menuAberto ? "aberto" : ""}`}>
        <div className="container menu-mobile-inner">
          {user ? (
            <>
              <div className="menu-mobile-user">
                <div className="avatar avatar-placeholder">{inicial}</div>
                <div>
                  <strong>{nome}</strong>
                  <span className="user-papel">
                    {operador ? "Estacionamento" : "Motorista"}
                  </span>
                </div>
              </div>
              {links.map((l) => (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ))}
              <Link to="/perfil">Meu perfil</Link>
              <Link to="/configuracoes">Configurações</Link>
              <button className="btn btn-outline btn-block" onClick={handleLogout}>
                Sair
              </button>
            </>
          ) : (
            <>
              <a href="/#como" onClick={() => setMenuAberto(false)}>
                Como funciona
              </a>
              <Link to="/login" className="btn btn-outline btn-block">
                Entrar
              </Link>
              <Link to="/cadastro" className="btn btn-primary btn-block">
                Criar conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
