import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import Logo from "./Logo";
import "./Navbar.css";

export default function Navbar() {
  const { user, userData, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-logo" aria-label="ParaAí — início">
          <Logo size={34} />
        </Link>

        <nav className="navbar-links">
          {user ? (
            userData?.role === "operador" ? (
              <>
                <Link to="/dashboard">Painel</Link>
                <Link to="/vagas">Mapa de Vagas</Link>
                <Link to="/historico">Movimentações</Link>
                <Link to="/perfil">Perfil</Link>
              </>
            ) : (
              <>
                <Link to="/dashboard">Painel</Link>
                <Link to="/historico">Meus acessos</Link>
                <Link to="/perfil">Perfil</Link>
              </>
            )
          ) : (
            <>
              <a href="/#como-funciona">Como funciona</a>
              <a href="/#kit">O kit</a>
            </>
          )}
        </nav>

        <div className="navbar-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="Alternar tema">
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          {user ? (
            <>
              <div className="user-info" onClick={() => navigate("/perfil") }>
                {(userData?.photoURL || user?.photoURL) ? (
                  <img
                    src={userData?.photoURL || user?.photoURL}
                    alt={userData?.name || user?.displayName || "Usuário"}
                    className="avatar"
                  />
                ) : (
                  <div className="avatar avatar-placeholder">
                    {(userData?.name || user?.displayName || "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="user-name">{userData?.name || user?.displayName || "Usuário"}</span>
              </div>

              <button className="btn btn-outline" onClick={handleLogout}>
                Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline">
                Entrar
              </Link>
              <Link to="/cadastro" className="btn btn-primary">
                Criar conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
