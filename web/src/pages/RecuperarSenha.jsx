import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogoMark } from "../components/Logo";
import "./Auth.css";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { recuperarSenha } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await recuperarSenha(email);
      setEnviado(true);
    } catch (err) {
      // Não confirmamos se o e-mail existe ou não: dizer "e-mail não
      // cadastrado" permitiria descobrir quem tem conta no sistema.
      if (err.code === "auth/invalid-email") {
        setError("E-mail inválido.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Sem conexão. Verifique sua internet.");
      } else {
        setEnviado(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div className="auth-check" aria-hidden="true">
            ✓
          </div>
          <h1 className="auth-title">Verifique seu e-mail</h1>
          <p className="subtitle">
            Se houver uma conta ParaAí em <strong>{email}</strong>, enviamos um
            link para você criar uma nova senha. O link vale por 1 hora.
          </p>
          <p className="muted-note" style={{ marginBottom: 22 }}>
            Não chegou? Confira a caixa de spam ou tente novamente em alguns
            minutos.
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Voltar para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-logo">
          <LogoMark size={52} />
        </div>
        <h1 className="auth-title">Esqueceu a senha?</h1>
        <p className="subtitle">
          Digite seu e-mail e enviaremos um link para você criar uma nova.
        </p>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail da conta</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>

        <p className="auth-footer">
          Lembrou a senha? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
