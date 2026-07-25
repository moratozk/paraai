import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import Logo from "./Logo";
import "./Navbar.css";

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
    <header className="navbar">
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
            <>
              <a href="/#como-funciona">Como funciona</a>
              <a href="/#para-quem">Para quem</a>
              <a href="/#duvidas">Dúvidas</a>
            </>
          )}
        </nav>

        <div className="navbar-actions">
          {user ? (
            <div className="conta-wrap" ref={contaRef}>
              <button
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
                    <button
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                      }}
                    >
                      <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
                      {theme === "light" ? "Tema escuro" : "Tema claro"}
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
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                title="Alternar tema"
                aria-label="Alternar tema claro/escuro"
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>
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
          className={`menu-hamburguer ${menuAberto ? "aberto" : ""}`}
          onClick={() => setMenuAberto(!menuAberto)}
          aria-label="Abrir menu"
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
              <button className="btn btn-outline btn-block" onClick={toggleTheme}>
                {theme === "light" ? "Tema escuro" : "Tema claro"}
              </button>
              <button className="btn btn-outline btn-block" onClick={handleLogout}>
                Sair
              </button>
            </>
          ) : (
            <>
              <a href="/#como-funciona" onClick={() => setMenuAberto(false)}>
                Como funciona
              </a>
              <a href="/#para-quem" onClick={() => setMenuAberto(false)}>
                Para quem
              </a>
              <a href="/#duvidas" onClick={() => setMenuAberto(false)}>
                Dúvidas
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
