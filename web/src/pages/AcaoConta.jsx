import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogoMark } from "../components/Logo";
import RedefinirSenha from "./RedefinirSenha";
import "./Auth.css";

// Destino dos links de todos os e-mails do Firebase Auth. No console, o URL
// de ação dos modelos aponta para https://paraai.web.app/acao; o Firebase diz
// o tipo em `mode` e manda o código em `oobCode`. Fica fora de PublicRoute:
// quem confirma um e-mail novo costuma estar logado.
export default function AcaoConta() {
  const [params] = useSearchParams();
  const modo = params.get("mode");
  if (modo === "resetPassword") return <RedefinirSenha />;
  return <AplicarCodigo modo={modo} codigo={params.get("oobCode") || ""} />;
}

const TEXTOS = {
  verifyAndChangeEmail: {
    aplicando: "Confirmando o novo e-mail…",
    titulo: "E-mail atualizado",
    corpo: (email) =>
      email ? `Seu e-mail de acesso agora é ${email}. Entre de novo usando ele.` : "Seu e-mail de acesso foi atualizado. Entre de novo usando ele.",
  },
  recoverEmail: {
    aplicando: "Desfazendo a troca de e-mail…",
    titulo: "E-mail restaurado",
    corpo: (email) =>
      `O e-mail da conta voltou a ser ${email || "o anterior"}. Se não foi você quem pediu a troca, crie uma nova senha agora.`,
  },
  verifyEmail: {
    aplicando: "Confirmando seu e-mail…",
    titulo: "E-mail confirmado",
    corpo: () => "Obrigado! Seu e-mail foi confirmado.",
  },
};

function AplicarCodigo({ modo, codigo }) {
  const { lerCodigoDeAcao, aplicarCodigoDeAcao, recuperarSenha, logout } = useAuth();
  const textos = TEXTOS[modo];
  const [estado, setEstado] = useState(textos && codigo ? "aplicando" : "incompleto");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [senha, setSenha] = useState("ociosa"); // ociosa | enviando | enviada | falhou
  // O código só vale uma vez; o StrictMode roda o efeito duas vezes em dev.
  const jaAplicou = useRef(false);

  useEffect(() => {
    if (!textos || !codigo || jaAplicou.current) return;
    jaAplicou.current = true;
    (async () => {
      try {
        const info = await lerCodigoDeAcao(codigo);
        await aplicarCodigoDeAcao(codigo);
        setEmail(info?.data?.email || "");
        // Com o e-mail trocado (ou devolvido), a sessão aberta é da conta antiga.
        if (modo !== "verifyEmail") await logout().catch(() => {});
        setEstado("pronto");
      } catch (err) {
        setErro(traduzErro(err));
        setEstado("erro");
      }
    })();
  }, [textos, codigo, modo, lerCodigoDeAcao, aplicarCodigoDeAcao, logout]);

  async function enviarNovaSenha() {
    setSenha("enviando");
    try {
      await recuperarSenha(email);
      setSenha("enviada");
    } catch {
      setSenha("falhou");
    }
  }

  if (estado === "aplicando") {
    return (
      <Moldura>
        <div className="spinner-grande" style={{ margin: "10px auto 22px" }} />
        <h1 className="auth-title">{textos.aplicando}</h1>
        <p className="subtitle">Só um instante.</p>
      </Moldura>
    );
  }

  if (estado === "pronto") {
    return (
      <Moldura>
        <div className="auth-selo" aria-hidden="true">✓</div>
        <h1 className="auth-title">{textos.titulo}</h1>
        <p className="subtitle">{textos.corpo(email)}</p>
        {modo === "recoverEmail" && email && (
          <>
            {senha === "enviada" && (
              <p className="aviso-sucesso">Enviamos o link para criar a nova senha para {email}.</p>
            )}
            {senha === "falhou" && (
              <p className="error-text">Não foi possível enviar agora. Use “Esqueci minha senha” no login.</p>
            )}
            {senha !== "enviada" && (
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={enviarNovaSenha}
                disabled={senha === "enviando"}
              >
                {senha === "enviando" ? "Enviando…" : "Criar nova senha"}
              </button>
            )}
          </>
        )}
        <Link
          to={modo === "verifyEmail" ? "/" : "/login"}
          className={`btn btn-block ${modo === "recoverEmail" && email ? "btn-ghost" : "btn-primary btn-lg"}`}
        >
          {modo === "verifyEmail" ? "Continuar" : "Ir para o login"}
        </Link>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <div className="auth-selo erro" aria-hidden="true">!</div>
      <h1 className="auth-title">{estado === "erro" ? "Link sem efeito" : "Link incompleto"}</h1>
      <p className="subtitle">
        {estado === "erro"
          ? erro
          : "Abra o link direto do e-mail. Se copiou o endereço, confira se ele veio inteiro."}
      </p>
      <Link to="/login" className="btn btn-primary btn-block btn-lg">
        Ir para o login
      </Link>
      <p className="auth-footer">
        Problema com a senha? <Link to="/recuperar-senha">Receber um novo link</Link>
      </p>
    </Moldura>
  );
}

function Moldura({ children }) {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-logo">
          <LogoMark size={52} />
        </div>
        {children}
      </div>
    </div>
  );
}

function traduzErro(err) {
  switch (err?.code) {
    case "auth/expired-action-code":
      return "Este link expirou. Peça um novo e repita o processo.";
    case "auth/invalid-action-code":
      return "Este link é inválido ou já foi usado.";
    case "auth/user-disabled":
      return "Esta conta está desativada.";
    case "auth/user-not-found":
      return "A conta deste link não existe mais.";
    case "auth/email-already-in-use":
      return "Esse e-mail já é usado por outra conta.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet e abra o link de novo.";
    default:
      return "Não foi possível concluir. Peça um novo link e tente de novo.";
  }
}
