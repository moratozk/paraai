import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { criarEstacionamento } from "../services/estacionamentos";
import { LogoMark } from "../components/Logo";
import "./Auth.css";

export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(
    searchParams.get("perfil") === "operador" ? "operador" : "motorista"
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // dados do estacionamento (só quando role === "operador")
  const [nomeEstacionamento, setNomeEstacionamento] = useState("");
  const [cidade, setCidade] = useState("");
  const [numVagas, setNumVagas] = useState(4);
  const [tarifaHora, setTarifaHora] = useState(5);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (role === "operador" && (!nomeEstacionamento.trim() || !cidade.trim())) {
      setError("Informe o nome do estacionamento e a cidade.");
      return;
    }

    setLoading(true);

    let cred;
    try {
      cred = await register(name, email, password, role);
    } catch (err) {
      setError(mapAuthError(err.code));
      setLoading(false);
      return;
    }

    if (role === "operador") {
      try {
        await criarEstacionamento({
          uid: cred.user.uid,
          nome: nomeEstacionamento.trim(),
          cidade: cidade.trim(),
          numVagas,
          tarifaHora,
        });
      } catch (err) {
        // A conta JÁ foi criada; só o estacionamento falhou. Avisa com a
        // causa real e aponta o caminho de recuperação (Perfil).
        console.error("Falha ao criar estacionamento:", err);
        setError(
          `Sua conta foi criada, mas não foi possível registrar o estacionamento: ${traduzErroFirestore(err)} ` +
            "Você já está logado — cadastre o estacionamento na página Perfil."
        );
        setLoading(false);
        return;
      }
    }

    navigate("/dashboard");
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-logo">
          <LogoMark size={52} />
        </div>
        <h1 className="auth-title">Criar conta</h1>
        <p className="subtitle">Cadastre-se gratuitamente no ParaAí</p>

        {/* seletor de papel */}
        <div className="role-switch" role="radiogroup" aria-label="Tipo de conta">
          <button
            type="button"
            className={`role-option ${role === "motorista" ? "active" : ""}`}
            onClick={() => setRole("motorista")}
          >
            Sou motorista
          </button>
          <button
            type="button"
            className={`role-option ${role === "operador" ? "active" : ""}`}
            onClick={() => setRole("operador")}
          >
            Tenho um estacionamento
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Nome completo</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>

          {role === "operador" && (
            <>
              <div className="field">
                <label htmlFor="nomeEstacionamento">Nome do estacionamento</label>
                <input
                  id="nomeEstacionamento"
                  type="text"
                  required
                  value={nomeEstacionamento}
                  onChange={(e) => setNomeEstacionamento(e.target.value)}
                  placeholder="Ex.: Estacionamento Central"
                />
              </div>

              <div className="field">
                <label htmlFor="cidade">Cidade</label>
                <input
                  id="cidade"
                  type="text"
                  required
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Ex.: Curitiba - PR"
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="numVagas">Nº de vagas</label>
                  <input
                    id="numVagas"
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={numVagas}
                    onChange={(e) => setNumVagas(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="tarifaHora">Tarifa (R$/hora)</label>
                  <input
                    id="tarifaHora"
                    type="number"
                    min={0}
                    step="0.50"
                    required
                    value={tarifaHora}
                    onChange={(e) => setTarifaHora(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirmar senha</label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading
              ? "Criando conta..."
              : role === "operador"
                ? "Cadastrar meu estacionamento"
                : "Criar conta"}
          </button>
        </form>

        <p className="auth-footer">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}

function mapAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return (
        "Este e-mail já está cadastrado — pode ter sido numa tentativa " +
        "anterior que deu erro no meio. Use \"Entrar\": o sistema completa " +
        "o seu cadastro automaticamente ao acessar."
      );
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/weak-password":
      return "Senha muito fraca.";
    case "auth/network-request-failed":
      return "Sem conexão com o servidor. Verifique sua internet.";
    default:
      return "Erro ao criar conta. Tente novamente.";
  }
}

function traduzErroFirestore(err) {
  const texto = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();
  if (texto.includes("permission")) {
    return (
      "o banco de dados recusou a escrita (permission-denied). Publique as " +
      "regras do arquivo firestore.rules no Console do Firebase."
    );
  }
  return err?.message || "erro inesperado.";
}
