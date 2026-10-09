import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useReserva, useVeiculo } from "../hooks/useParkingData";
import {
  baixarJson,
  copiaDosDados,
  impedimentoParaExcluir,
  nomeDoArquivoDosDados,
} from "../services/conta";
import { reservaAtiva } from "../services/reservas";
import { formatarMoeda, formatarTelefone, telefoneValido } from "../utils/format";
import "./Pages.css";

const ABAS = [
  { id: "perfil", rotulo: "Perfil", icone: "👤" },
  { id: "email", rotulo: "E-mail", icone: "✉️" },
  { id: "senha", rotulo: "Senha", icone: "🔒" },
  { id: "privacidade", rotulo: "Privacidade", icone: "🛡️" },
];

export default function Configuracoes() {
  const { user, userData, alterarPerfil, alterarSenha, alterarEmail, excluirConta } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();

  // ?aba=privacidade abre direto na aba (links do Perfil e da política).
  const [aba, setAba] = useState(() =>
    ABAS.some((a) => a.id === params.get("aba")) ? params.get("aba") : "perfil"
  );

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

  // --- privacidade (cópia dos dados e exclusão da conta) ---
  const role = userData?.role || "motorista";
  const motorista = role === "motorista";
  const placa = motorista ? userData?.placa || null : null;
  const naPrivacidade = aba === "privacidade";
  const { veiculo } = useVeiculo(naPrivacidade ? placa : null);
  const { reserva } = useReserva(naPrivacidade && motorista ? user?.uid : null);
  const veiculoDaConta = veiculo?.ownerUid === user?.uid ? veiculo : null;
  const impedimento = impedimentoParaExcluir(veiculoDaConta);
  const saldo = Number(veiculoDaConta?.saldo) || 0;
  const [baixando, setBaixando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [senhaExclusao, setSenhaExclusao] = useState("");
  const [erroExclusao, setErroExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const campoSenhaExclusao = useRef(null);

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

  async function baixarDados() {
    setBaixando(true);
    try {
      const copia = await copiaDosDados(user);
      baixarJson(nomeDoArquivoDosDados(), copia);
      toast.sucesso("Arquivo com os seus dados baixado.");
    } catch (err) {
      console.error("Falha ao montar a cópia dos dados:", err);
      toast.erro("Não foi possível preparar o arquivo agora. Tente novamente.");
    } finally {
      setBaixando(false);
    }
  }

  function mostrarErroExclusao(texto) {
    setErroExclusao(texto);
    campoSenhaExclusao.current?.focus();
  }

  async function excluir(e) {
    e.preventDefault();
    setErroExclusao("");
    if (!senhaExclusao) {
      mostrarErroExclusao("Digite a sua senha para confirmar.");
      return;
    }
    setExcluindo(true);
    try {
      await excluirConta(senhaExclusao);
      // Sem navigate: com o acesso encerrado, PrivateRoute leva ao início.
      toast.sucesso("Conta excluída. Seus dados foram apagados do ParaAí.");
    } catch (err) {
      setExcluindo(false);
      mostrarErroExclusao(
        ["auth/wrong-password", "auth/invalid-credential"].includes(err?.code)
          ? "Senha incorreta."
          : traduzErro(err)
      );
    }
  }

  const tipoConta = TIPOS_DE_CONTA[userData?.role] || TIPOS_DE_CONTA.motorista;

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Configurações</h1>
        <p>Gerencie o acesso e a privacidade da sua conta ParaAí.</p>
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
                  <div className="info-row">
                    <span className="label">Tipo de conta</span>
                    <span>{tipoConta.nome}</span>
                  </div>
                  <span className="field-hint">{tipoConta.descricao}</span>
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

          {/* ---------- PRIVACIDADE ---------- */}
          {aba === "privacidade" && (
            <>
              <div className="card config-privacidade">
                <h2>Seus dados</h2>
                <p className="config-texto">
                  {motorista
                    ? "Baixe uma cópia de tudo o que o ParaAí guarda sobre você: perfil, carro, carteira, extrato, estadias e reserva."
                    : role === "operador"
                      ? "Baixe uma cópia do seu perfil e do cadastro do seu estacionamento."
                      : "Baixe uma cópia do seu perfil."}
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={baixarDados}
                  disabled={baixando}
                >
                  {baixando ? "Preparando o arquivo..." : "Baixar meus dados"}
                </button>
                <p className="muted-note">
                  O arquivo vem em JSON, um formato aberto que outros serviços
                  conseguem ler. O que cada dado faz está na{" "}
                  <Link to="/privacidade" className="link-texto">
                    política de privacidade
                  </Link>
                  .
                </p>
              </div>

              <div className="card config-privacidade">
                <h2>Excluir conta</h2>
                {!motorista ? (
                  <p className="config-texto">
                    {role === "operador"
                      ? "A conta de um estacionamento é encerrada pela administração da rede, porque o pátio, os totens e as movimentações dependem dela."
                      : "Contas de administração são encerradas pela própria administração da rede, fora do site."}
                  </p>
                ) : (
                  <>
                    <p className="config-texto">
                      Apaga o seu perfil, a carteira, o extrato e a reserva, e
                      encerra o acesso ao ParaAí. Não dá para desfazer.
                    </p>
                    <ul className="config-lista">
                      {placa && (
                        <li>
                          A placa {placa} fica livre para outra pessoa cadastrar,
                          sem as suas estadias.
                        </li>
                      )}
                      <li>
                        As estadias continuam com os estacionamentos, só com a
                        placa: sem nome, e-mail ou celular.
                      </li>
                      {saldo > 0 && (
                        <li>O saldo simulado de {formatarMoeda(saldo)} não é devolvido.</li>
                      )}
                    </ul>

                    {impedimento === "estacionado" ? (
                      <p className="destaque-aviso">
                        Seu carro está estacionado. Registre a saída no totem
                        antes de excluir a conta.
                      </p>
                    ) : impedimento === "pendencia" ? (
                      <p className="destaque-aviso">
                        <span>
                          Há uma pendência de {formatarMoeda(-saldo)} de uma
                          estadia. <Link to="/perfil" className="link-texto">Regularize com uma recarga</Link>{" "}
                          antes de excluir a conta.
                        </span>
                      </p>
                    ) : !confirmandoExclusao ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setConfirmandoExclusao(true)}
                      >
                        Excluir minha conta
                      </button>
                    ) : (
                      <form onSubmit={excluir} className="config-exclusao">
                        {reservaAtiva(reserva) && (
                          <p className="config-texto">
                            A sua reserva da vaga {reserva.vaga} também será cancelada.
                          </p>
                        )}
                        <div className="field">
                          <label htmlFor="senhaExclusao">Sua senha</label>
                          <input
                            id="senhaExclusao"
                            ref={campoSenhaExclusao}
                            type="password"
                            autoComplete="current-password"
                            autoFocus
                            value={senhaExclusao}
                            onChange={(e) => {
                              setSenhaExclusao(e.target.value);
                              setErroExclusao("");
                            }}
                            aria-invalid={erroExclusao ? "true" : undefined}
                            aria-describedby="exclusao-ajuda"
                          />
                          <span
                            className={`field-hint${erroExclusao ? " erro" : ""}`}
                            id="exclusao-ajuda"
                          >
                            {erroExclusao || "Pedimos a senha para confirmar que é você."}
                          </span>
                        </div>
                        <div className="acoes-form">
                          <button
                            type="submit"
                            className="btn btn-danger-solido"
                            disabled={excluindo}
                          >
                            {excluindo ? "Excluindo..." : "Excluir definitivamente"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={excluindo}
                            onClick={() => {
                              setConfirmandoExclusao(false);
                              setSenhaExclusao("");
                              setErroExclusao("");
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const TIPOS_DE_CONTA = {
  admin: {
    nome: "Administrador da rede",
    descricao: "Sua conta cadastra e acompanha os estacionamentos da rede ParaAí.",
  },
  operador: {
    nome: "Dono de estacionamento",
    descricao: "Sua conta administra um estacionamento da rede.",
  },
  motorista: {
    nome: "Motorista",
    descricao: "Estacionamentos são cadastrados pela administração da rede ParaAí.",
  },
};

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
      // No Firebase: Authentication > Configurações > proteção contra
      // enumeração de e-mail. Quem usa o site não tem o que fazer aqui.
      console.error("Troca de e-mail recusada pela configuração da conta:", err);
      return "A troca de e-mail está indisponível no momento. Tente mais tarde.";
    default:
      // Erros com `code` vêm do Firebase e não são para o motorista; os sem
      // `code` são nossos (AuthContext) e já estão em português.
      console.error("Falha ao atualizar a conta:", err);
      return (!err?.code && err?.message) || "Não foi possível concluir. Tente novamente.";
  }
}
