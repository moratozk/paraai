import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatarTelefone, telefoneValido } from "../utils/format";
import "./Pages.css";

export default function Configuracoes() {
  const { user, userData, alterarPerfil, alterarSenha, alterarEmail } = useAuth();
  const toast = useToast();

  const [aba, setAba] = useState("perfil");

  // --- perfil (nome + telefone) ---
  const [nome, setNome] = useState(userData?.name || user?.displayName || "");
  const [telefone, setTelefone] = useState(
    formatarTelefone(userData?.telefone || "")
  );
  const [salvandoNome, setSalvandoNome] = useState(false);

  // --- e-mail ---
  const [novoEmail, setNovoEmail] = useState("");
  const [senhaEmail, setSenhaEmail] = useState("");
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

  // --- senha ---
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const [erro, setErro] = useState("");

  async function salvarNome(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) {
      setErro("O nome não pode ficar vazio.");
      return;
    }
    if (telefone && !telefoneValido(telefone)) {
      setErro("Celular inválido. Use DDD + 9 dígitos.");
      return;
    }
    setSalvandoNome(true);
    try {
      await alterarPerfil({ nome: nome.trim(), telefone });
      toast.sucesso("Perfil atualizado!");
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setSalvandoNome(false);
    }
  }

  async function salvarEmail(e) {
    e.preventDefault();
    setErro("");
    if (!novoEmail.trim()) {
      setErro("Informe o novo e-mail.");
      return;
    }
    if (novoEmail.trim().toLowerCase() === (user?.email || "").toLowerCase()) {
      setErro("Esse já é o seu e-mail atual.");
      return;
    }
    setSalvandoEmail(true);
    try {
      await alterarEmail(senhaEmail, novoEmail.trim());
      setEmailEnviado(true);
      setSenhaEmail("");
      toast.sucesso("Confirmação enviada para o novo e-mail.");
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setSalvandoEmail(false);
    }
  }

  async function salvarSenha(e) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 6) {
      setErro("A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setErro("A confirmação não corresponde à nova senha.");
      return;
    }
    setSalvandoSenha(true);
    try {
      await alterarSenha(senhaAtual, novaSenha);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmaSenha("");
      toast.sucesso("Senha alterada com sucesso!");
    } catch (err) {
      setErro(traduzErro(err));
    } finally {
      setSalvandoSenha(false);
    }
  }

  const ABAS = [
    { id: "perfil", rotulo: "Perfil", icone: "👤" },
    { id: "email", rotulo: "E-mail", icone: "✉️" },
    { id: "senha", rotulo: "Senha", icone: "🔒" },
  ];

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Configurações</h1>
        <p>Gerencie os dados de acesso da sua conta ParaAí.</p>
      </div>

      <div className="config-layout">
        {/* ---- navegação lateral ---- */}
        <nav className="config-nav">
          {ABAS.map((a) => (
            <button
              key={a.id}
              className={`config-nav-item ${aba === a.id ? "ativo" : ""}`}
              onClick={() => {
                setAba(a.id);
                setErro("");
              }}
            >
              <span aria-hidden="true">{a.icone}</span>
              {a.rotulo}
            </button>
          ))}
        </nav>

        <div className="config-conteudo">
          {erro && <p className="error-text">{erro}</p>}

          {/* ---------- PERFIL ---------- */}
          {aba === "perfil" && (
            <div className="card">
              <h2>Dados do perfil</h2>
              <form onSubmit={salvarNome}>
                <div className="field">
                  <label htmlFor="nome">Nome completo</label>
                  <input
                    id="nome"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className="field">
                  <label htmlFor="telefone">Celular</label>
                  <input
                    id="telefone"
                    type="tel"
                    inputMode="numeric"
                    value={telefone}
                    onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                    placeholder="(41) 99999-8888"
                    maxLength={15}
                  />
                  {telefone && !telefoneValido(telefone) && (
                    <span className="field-hint erro">
                      Celular incompleto — precisa de DDD + 9 dígitos
                    </span>
                  )}
                </div>

                <div className="field">
                  <label>Tipo de conta</label>
                  <input
                    type="text"
                    value={
                      userData?.role === "operador"
                        ? "Dono de estacionamento"
                        : "Motorista"
                    }
                    disabled
                  />
                  <span className="field-hint">
                    {userData?.role === "operador"
                      ? "Sua conta administra um estacionamento da rede."
                      : "Para administrar um estacionamento, vá em Perfil → Tenho um estacionamento."}
                  </span>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={salvandoNome}
                >
                  {salvandoNome ? "Salvando..." : "Salvar alterações"}
                </button>
              </form>
            </div>
          )}

          {/* ---------- E-MAIL ---------- */}
          {aba === "email" && (
            <div className="card">
              <h2>Alterar e-mail</h2>

              <div className="info-row">
                <span className="label">E-mail atual</span>
                <strong>{user?.email}</strong>
              </div>

              {emailEnviado ? (
                <div className="aviso-sucesso">
                  <strong>Confirme no novo e-mail.</strong> Enviamos um link
                  para <strong>{novoEmail}</strong>. A troca só é concluída
                  depois que você clicar nesse link — até lá, continue entrando
                  com o e-mail atual.
                </div>
              ) : (
                <form onSubmit={salvarEmail}>
                  <div className="field">
                    <label htmlFor="novoEmail">Novo e-mail</label>
                    <input
                      id="novoEmail"
                      type="email"
                      required
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      placeholder="novo@email.com"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="senhaEmail">Sua senha atual</label>
                    <input
                      id="senhaEmail"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={senhaEmail}
                      onChange={(e) => setSenhaEmail(e.target.value)}
                      placeholder="Confirme quem é você"
                    />
                    <span className="field-hint">
                      Pedimos a senha para garantir que é você quem está
                      alterando o acesso.
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={salvandoEmail}
                  >
                    {salvandoEmail ? "Enviando..." : "Enviar confirmação"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ---------- SENHA ---------- */}
          {aba === "senha" && (
            <div className="card">
              <h2>Alterar senha</h2>
              <form onSubmit={salvarSenha}>
                <div className="field">
                  <label htmlFor="senhaAtual">Senha atual</label>
                  <input
                    id="senhaAtual"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="novaSenha">Nova senha</label>
                  <input
                    id="novaSenha"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div className="field">
                  <label htmlFor="confirmaSenha">Confirmar nova senha</label>
                  <input
                    id="confirmaSenha"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmaSenha}
                    onChange={(e) => setConfirmaSenha(e.target.value)}
                  />
                  {confirmaSenha && confirmaSenha !== novaSenha && (
                    <span className="field-hint erro">
                      As senhas não coincidem
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={salvandoSenha}
                >
                  {salvandoSenha ? "Alterando..." : "Alterar senha"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function traduzErro(err) {
  switch (err?.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Senha atual incorreta.";
    case "auth/email-already-in-use":
      return "Esse e-mail já está em uso por outra conta.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/weak-password":
      return "A nova senha é muito fraca.";
    case "auth/requires-recent-login":
      return "Por segurança, entre novamente e repita a operação.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique sua internet.";
    case "auth/operation-not-allowed":
      return (
        "O Firebase bloqueou a troca de e-mail. No Console, em Authentication → " +
        "Configurações, verifique a opção de proteção de enumeração de e-mail."
      );
    default:
      return err?.message || "Não foi possível concluir. Tente novamente.";
  }
}
