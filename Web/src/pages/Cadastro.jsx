import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { criarEstacionamento } from "../services/estacionamentos";
import { buscarCep, cepCompleto, formatarCep } from "../services/cep";
import { formatarTelefone, telefoneValido } from "../utils/format";
import { LogoMark } from "../components/Logo";
import "./Auth.css";

function IconeMotorista() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4.2 15.5h15.6l-1.4-5.1a2.1 2.1 0 0 0-2-1.5H7.6a2.1 2.1 0 0 0-2 1.5l-1.4 5.1Z" />
      <path d="M3 15.5v2.2c0 .8.6 1.4 1.4 1.4h15.2c.8 0 1.4-.6 1.4-1.4v-2.2M7.1 15.5h.1m9.6 0h.1" />
      <path d="M6.1 19.1v1.4m11.8-1.4v1.4" />
    </svg>
  );
}

function IconeEstacionamento() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M9 17V7h3.6a3.4 3.4 0 1 1 0 6.8H9m0-3.4h3.5" />
    </svg>
  );
}

// Motorista: uma etapa só.
// Operador: 3 etapas — conta → estacionamento → vagas.
// A TARIFA não entra aqui de propósito: é definida depois, no painel, onde
// o dono pode ajustá-la quando quiser.
export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(
    searchParams.get("perfil") === "operador" ? "operador" : "motorista"
  );
  const [etapa, setEtapa] = useState(1);

  // etapa 1 — conta
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verSenha, setVerSenha] = useState(false);

  // etapa 2 — estacionamento
  const [nomeEstacionamento, setNomeEstacionamento] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState(null);
  const [numero, setNumero] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");

  // etapa 3 — operação
  const [numVagas, setNumVagas] = useState(4);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const forcaSenha = calcularForcaSenha(password);
  const totalEtapas = role === "operador" ? 3 : 1;
  const nomesEtapas = ["Conta", "Estacionamento", "Operação"];

  function trocarPapel(novo) {
    setRole(novo);
    setEtapa(1);
    setError("");
  }

  async function handleCepChange(valor) {
    setCep(formatarCep(valor));
    setErroCep("");
    if (!cepCompleto(valor)) {
      setEndereco(null);
      return;
    }
    setBuscandoCep(true);
    try {
      const dados = await buscarCep(valor);
      setEndereco(dados);
    } catch (err) {
      setEndereco(null);
      setErroCep(err.message);
    } finally {
      setBuscandoCep(false);
    }
  }

  // valida a etapa atual antes de avançar
  function avancar() {
    setError("");
    if (etapa === 1) {
      if (!name.trim()) return setError("Informe seu nome.");
      if (!email.trim()) return setError("Informe seu e-mail.");
      if (!telefoneValido(telefone))
        return setError("Informe um celular válido com DDD. Ex.: (41) 99999-8888");
      if (password.length < 6)
        return setError("A senha deve ter pelo menos 6 caracteres.");
      if (password !== confirmPassword)
        return setError("As senhas não coincidem.");
      setEtapa(2);
      return;
    }
    if (etapa === 2) {
      if (!nomeEstacionamento.trim())
        return setError("Informe o nome do estacionamento.");
      if (!endereco)
        return setError("Informe um CEP válido para localizar o endereço.");
      if (!numero.trim()) return setError("Informe o número do endereço.");
      setEtapa(3);
    }
  }

  async function finalizar(e) {
    e?.preventDefault();
    setError("");

    // motorista: validações da etapa única
    if (role === "motorista") {
      if (!telefoneValido(telefone))
        return setError("Informe um celular válido com DDD. Ex.: (41) 99999-8888");
      if (password !== confirmPassword)
        return setError("As senhas não coincidem.");
      if (password.length < 6)
        return setError("A senha deve ter pelo menos 6 caracteres.");
    }

    if (role === "operador") {
      const vagas = Number(numVagas);
      if (!Number.isInteger(vagas) || vagas < 1 || vagas > 200) {
        return setError("Informe um número de vagas entre 1 e 200.");
      }
    }

    setLoading(true);

    let cred;
    try {
      cred = await register(name, email, password, role, telefone);
    } catch (err) {
      const ehFirestore = `${err?.code || ""}`.includes("permission");
      setError(
        ehFirestore
          ? err.cadastroRevertido
            ? `Não foi possível concluir o cadastro: ${traduzErroFirestore(err)} A conta incompleta foi removida; você pode tentar novamente.`
            : `A conta foi criada, mas o perfil não pôde ser salvo: ${traduzErroFirestore(err)}`
          : mapAuthError(err.code)
      );
      setLoading(false);
      return;
    }

    if (role === "operador") {
      try {
        await criarEstacionamento({
          uid: cred.user.uid,
          nome: nomeEstacionamento.trim(),
          numVagas,
          cep,
          logradouro: endereco.logradouro,
          numero: numero.trim(),
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf,
        });
      } catch (err) {
        console.error("Falha ao criar estacionamento:", err);
        setError(
          `Sua conta foi criada, mas o estacionamento não: ${traduzErroFirestore(err)} ` +
            "Você já está logado — cadastre-o na página Perfil."
        );
        setLoading(false);
        return;
      }
    }

    toast.sucesso(
      role === "operador"
        ? "Estacionamento cadastrado! Defina sua tarifa no painel."
        : "Conta criada! Bem-vindo ao ParaAí."
    );
    navigate("/dashboard");
  }

  return (
    <div className="auth-page">
      <div className="card auth-card auth-card-larga">
        <div className="auth-logo">
          <LogoMark size={54} />
        </div>
        <h1 className="auth-title">Criar conta</h1>
        <p className="subtitle">
          {role === "operador"
            ? `Etapa ${etapa} de ${totalEtapas} · ${nomesEtapas[etapa - 1]}`
            : "Comece agora, leva menos de um minuto"}
        </p>

        {/* trilha de etapas (só operador) */}
        {role === "operador" && (
          <div className="etapas-trilha" aria-hidden="true">
            {nomesEtapas.map((rot, i) => {
              const n = i + 1;
              return (
                <div
                  key={rot}
                  className={`etapa-item ${
                    etapa === n ? "ativa" : etapa > n ? "feita" : ""
                  }`}
                >
                  <span className="etapa-bola">{etapa > n ? "✓" : n}</span>
                  <span className="etapa-rotulo">{rot}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* seletor de papel (some depois da primeira etapa) */}
        {etapa === 1 && (
          <div className="role-switch" role="radiogroup" aria-label="Tipo de conta">
            <button
              type="button"
              role="radio"
              aria-checked={role === "motorista"}
              className={`role-option ${role === "motorista" ? "active" : ""}`}
              onClick={() => trocarPapel("motorista")}
            >
              <span className="role-icone"><IconeMotorista /></span>
              <span className="role-titulo">Sou motorista</span>
              <span className="role-desc">Estacionar na rede</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={role === "operador"}
              className={`role-option ${role === "operador" ? "active" : ""}`}
              onClick={() => trocarPapel("operador")}
            >
              <span className="role-icone"><IconeEstacionamento /></span>
              <span className="role-titulo">Tenho um estacionamento</span>
              <span className="role-desc">Automatizar meu pátio</span>
            </button>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (role === "operador" && etapa < 3) avancar();
            else finalizar(e);
          }}
        >
          {/* ---------- ETAPA 1: CONTA ---------- */}
          {etapa === 1 && (
            <>
              <div className="field">
                <label htmlFor="name">Nome completo</label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
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
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </div>

              <div className="field">
                <label htmlFor="telefone">Celular</label>
                <input
                  id="telefone"
                  type="tel"
                  inputMode="numeric"
                  required
                  autoComplete="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  placeholder="(41) 99999-8888"
                  maxLength={15}
                />
                {telefone && !telefoneValido(telefone) ? (
                  <span className="field-hint erro">
                    Celular incompleto — precisa de DDD + 9 dígitos
                  </span>
                ) : (
                  <span className="field-hint">
                    Usamos para avisos importantes sobre sua conta
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="password">Senha</label>
                <div className="input-com-acao">
                  <input
                    id="password"
                    type={verSenha ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    className="input-acao"
                    onClick={() => setVerSenha((v) => !v)}
                    aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {verSenha ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {password && (
                  <div className="forca-senha">
                    <div className={`forca-barra n${forcaSenha.nivel}`}>
                      <span /><span /><span /><span />
                    </div>
                    <span className="field-hint">{forcaSenha.texto}</span>
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="confirmPassword">Confirmar senha</label>
                <input
                  id="confirmPassword"
                  type={verSenha ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                />
                {confirmPassword && confirmPassword !== password && (
                  <span className="field-hint erro">As senhas não coincidem</span>
                )}
              </div>
            </>
          )}

          {/* ---------- ETAPA 2: ESTACIONAMENTO ---------- */}
          {etapa === 2 && (
            <>
              <div className="field">
                <label htmlFor="nomeEstacionamento">Nome do estacionamento</label>
                <input
                  id="nomeEstacionamento"
                  type="text"
                  autoFocus
                  value={nomeEstacionamento}
                  onChange={(e) => setNomeEstacionamento(e.target.value)}
                  placeholder="Ex.: Estacionamento Central"
                />
              </div>

              <div className="field-row cep-row">
                <div className="field">
                  <label htmlFor="cep">CEP</label>
                  <div className="input-com-acao">
                    <input
                      id="cep"
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {buscandoCep && <span className="input-spinner" />}
                  </div>
                  {erroCep ? (
                    <span className="field-hint erro">{erroCep}</span>
                  ) : endereco ? (
                    <span className="field-hint ok">✓ Endereço localizado</span>
                  ) : (
                    <span className="field-hint">Preenche o endereço sozinho</span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="numero">Número</label>
                  <input
                    id="numero"
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="123"
                    disabled={!endereco}
                  />
                </div>
              </div>

              {endereco && (
                <div className="endereco-preview">
                  <div className="endereco-linha">
                    <span className="endereco-label">Rua</span>
                    <strong>{endereco.logradouro || "—"}</strong>
                  </div>
                  <div className="endereco-linha">
                    <span className="endereco-label">Bairro</span>
                    <strong>{endereco.bairro || "—"}</strong>
                  </div>
                  <div className="endereco-linha">
                    <span className="endereco-label">Cidade/UF</span>
                    <strong>
                      {endereco.cidade} - {endereco.uf}
                    </strong>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- ETAPA 3: OPERAÇÃO ---------- */}
          {etapa === 3 && (
            <>
              <div className="field">
                <label htmlFor="numVagas">Quantas vagas o pátio tem?</label>
                <input
                  id="numVagas"
                  type="number"
                  min={1}
                  max={200}
                  required
                  autoFocus
                  value={numVagas}
                  onChange={(e) => setNumVagas(e.target.value)}
                />
                <span className="field-hint">
                  É o número de vagas que o painel vai monitorar. Dá para
                  alterar depois.
                </span>
              </div>

              <div className="resumo-cadastro">
                <span className="resumo-titulo">Resumo</span>
                <div className="endereco-linha">
                  <span className="endereco-label">Estacionamento</span>
                  <strong>{nomeEstacionamento}</strong>
                </div>
                <div className="endereco-linha">
                  <span className="endereco-label">Endereço</span>
                  <strong>
                    {endereco?.logradouro}, {numero}
                  </strong>
                </div>
                <div className="endereco-linha">
                  <span className="endereco-label">Cidade</span>
                  <strong>
                    {endereco?.cidade} - {endereco?.uf}
                  </strong>
                </div>
                <div className="endereco-linha">
                  <span className="endereco-label">Vagas</span>
                  <strong>{numVagas}</strong>
                </div>
              </div>

              <p className="field-hint" style={{ marginBottom: 18 }}>
                A tarifa por hora você define no painel, logo após entrar.
              </p>
            </>
          )}

          {/* ---------- AÇÕES ---------- */}
          <div className={etapa > 1 ? "acoes-etapa" : ""}>
            {etapa > 1 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEtapa(etapa - 1);
                  setError("");
                }}
              >
                Voltar
              </button>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={etapa === 1 ? { width: "100%" } : { flex: 1 }}
              disabled={loading}
            >
              {loading
                ? "Criando conta..."
                : role === "motorista"
                  ? "Criar minha conta"
                  : etapa < 3
                    ? "Continuar"
                    : "Finalizar cadastro"}
            </button>
          </div>
        </form>

        <p className="auth-footer">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}

function calcularForcaSenha(senha) {
  if (!senha) return { nivel: 0, texto: "" };
  let pontos = 0;
  if (senha.length >= 6) pontos++;
  if (senha.length >= 10) pontos++;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) pontos++;
  if (/[0-9]/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  const nivel = Math.min(4, Math.max(1, pontos));
  return {
    nivel,
    texto: { 1: "Senha fraca", 2: "Senha razoável", 3: "Senha boa", 4: "Senha forte" }[nivel],
  };
}

function mapAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return (
        "Este e-mail já está cadastrado — pode ter sido numa tentativa " +
        'anterior que deu erro no meio. Use "Entrar": o sistema completa ' +
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
