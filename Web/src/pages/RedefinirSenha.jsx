import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { LogoMark } from "../components/Logo";
import "./Auth.css";

// Tela onde o usuário define a nova senha SEM sair do site.
// O código chega pelo link do e-mail (parâmetro oobCode). Se a pessoa abriu
// esta página direto, ela pode colar o código manualmente.
export default function RedefinirSenha() {
  const [searchParams] = useSearchParams();
  const { validarCodigoSenha, redefinirSenhaComCodigo } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const codigoDaUrl = searchParams.get("oobCode") || "";

  const [codigo, setCodigo] = useState(codigoDaUrl);
  const [emailDaConta, setEmailDaConta] = useState("");
  const [validando, setValidando] = useState(Boolean(codigoDaUrl));
  const [codigoOk, setCodigoOk] = useState(false);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  // valida automaticamente o código que veio na URL
  useEffect(() => {
    if (!codigoDaUrl) return;
    let ativo = true;
    (async () => {
      try {
        const email = await validarCodigoSenha(codigoDaUrl);
        if (!ativo) return;
        setEmailDaConta(email);
        setCodigoOk(true);
      } catch (err) {
        if (!ativo) return;
        setErro(traduzErro(err));
      } finally {
        if (ativo) setValidando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [codigoDaUrl, validarCodigoSenha]);

  async function conferirCodigoManual(e) {
    e.preventDefault();
    setErro("");
    if (!codigo.trim()) {
      setErro("Cole o código que veio no e-mail.");
      return;
    }
    setValidando(true);
    try {
      const email = await validarCodigoSenha(codigo.trim());
      setEmailDaConta(email);
      setCodigoOk(true);
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setValidando(false);
    }
  }

  async function salvarNovaSenha(e) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 6) {
      setErro("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirma) {
      setErro("As senhas não coincidem.");
      return;
    }
    setSalvando(true);
    try {
      await redefinirSenhaComCodigo(codigo.trim(), novaSenha);
      setPronto(true);
      toast.sucesso("Senha redefinida! Entre com a nova senha.");
      setTimeout(() => navigate("/login"), 2600);
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setSalvando(false);
    }
  }

  // ---------- concluído ----------
  if (pronto) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div className="auth-check" aria-hidden="true">✓</div>
          <h1 className="auth-title">Senha redefinida</h1>
          <p className="subtitle">
            Tudo certo! Já pode entrar com a nova senha. Estamos te levando
            para o login…
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  // ---------- validando o código da URL ----------
  if (validando && codigoDaUrl) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div className="spinner-grande" style={{ margin: "10px auto 22px" }} />
          <h1 className="auth-title">Conferindo o link…</h1>
          <p className="subtitle">Só um instante.</p>
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
        <h1 className="auth-title">Criar nova senha</h1>
        <p className="subtitle">
          {codigoOk
            ? `Definindo a nova senha de ${emailDaConta}`
            : "Cole abaixo o código que enviamos no seu e-mail"}
        </p>

        {erro && <p className="error-text">{erro}</p>}

        {!codigoOk ? (
          /* ---------- código manual ---------- */
          <form onSubmit={conferirCodigoManual}>
            <div className="field">
              <label htmlFor="codigo">Código de recuperação</label>
              <input
                id="codigo"
                type="text"
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Cole o código aqui"
              />
              <span className="field-hint">
                Ele está no link do e-mail que você recebeu. O jeito mais fácil
                é clicar direto no botão do e-mail.
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={validando}
            >
              {validando ? "Conferindo…" : "Continuar"}
            </button>

            <p className="auth-footer">
              Não recebeu?{" "}
              <Link to="/recuperar-senha">Enviar de novo</Link>
            </p>
          </form>
        ) : (
          /* ---------- nova senha ---------- */
          <form onSubmit={salvarNovaSenha}>
            <div className="field">
              <label htmlFor="novaSenha">Nova senha</label>
              <div className="input-com-acao">
                <input
                  id="novaSenha"
                  type={verSenha ? "text" : "password"}
                  autoFocus
                  autoComplete="new-password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  className="input-acao"
                  onClick={() => setVerSenha((v) => !v)}
                >
                  {verSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="confirma">Confirmar nova senha</label>
              <input
                id="confirma"
                type={verSenha ? "text" : "password"}
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                placeholder="Repita a senha"
              />
              {confirma && confirma !== novaSenha && (
                <span className="field-hint erro">As senhas não coincidem</span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={salvando}
            >
              {salvando ? "Salvando…" : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function traduzErro(err) {
  switch (err?.code) {
    case "auth/expired-action-code":
      return "Este código expirou. Peça um novo e-mail de recuperação.";
    case "auth/invalid-action-code":
      return "Código inválido ou já utilizado. Peça um novo e-mail.";
    case "auth/user-disabled":
      return "Esta conta está desativada.";
    case "auth/user-not-found":
      return "Conta não encontrada.";
    case "auth/weak-password":
      return "Senha muito fraca. Use pelo menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet.";
    default:
      return err?.message || "Não foi possível redefinir a senha.";
  }
}
