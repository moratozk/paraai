import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { enviarPedido, LIMITE_MENSAGEM, problemaNoPedido } from "../services/pedidos";
import { buscarCep, cepCompleto, formatarCep } from "../services/cep";
import {
  formatarMoeda,
  formatarTelefone,
  lerValorEmReais,
  telefoneValido,
} from "../utils/format";
import { LogoMark } from "../components/Logo";
import CampoDireitoVaga from "../components/CampoDireitoVaga";
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

// O cadastro público cria motoristas e contas de estacionamento. Quem tem um
// pátio manda aqui o pedido para entrar na rede (conta "candidato"); a
// equipe do ParaAí aprova no painel da rede, e só então a conta vira dona do
// estacionamento. O acesso administrativo é provisionado fora do cliente,
// para não permitir autopromoção de privilégios.
export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(
    searchParams.get("perfil") === "estacionamento" ? "estacionamento" : "motorista"
  );
  const estacionamento = role === "estacionamento";
  const [etapa, setEtapa] = useState(1);

  // etapa 1 — conta
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [vagaEspecial, setVagaEspecial] = useState("");
  const [declarouDireito, setDeclarouDireito] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [aceitouPrivacidade, setAceitouPrivacidade] = useState(false);

  // etapa 2 — estacionamento
  const [nomeEstacionamento, setNomeEstacionamento] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState(null);
  const [numero, setNumero] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");

  // etapa 3 — operação
  const [numVagas, setNumVagas] = useState("");
  const [tarifa, setTarifa] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Conta criada nesta tela. Se só o pedido falhar, o botão tenta de novo
  // sem criar outra conta (o e-mail já estaria em uso).
  const [contaCriada, setContaCriada] = useState(null);

  const { register, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const forcaSenha = calcularForcaSenha(password);
  const totalEtapas = estacionamento ? 3 : 1;
  const nomesEtapas = ["Conta", "Estacionamento", "Operação"];
  const tarifaLida = lerValorEmReais(tarifa);

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

  function dadosDoPedido() {
    return {
      nome: name,
      telefone,
      nomeEstacionamento,
      cep,
      endereco,
      numero,
      numVagas,
      tarifaHora: tarifa,
      mensagem,
    };
  }

  async function finalizar(e) {
    e?.preventDefault();
    setError("");

    // motorista: validações da etapa única
    if (!estacionamento) {
      if (!telefoneValido(telefone))
        return setError("Informe um celular válido com DDD. Ex.: (41) 99999-8888");
      if (password !== confirmPassword)
        return setError("As senhas não coincidem.");
      if (password.length < 6)
        return setError("A senha deve ter pelo menos 6 caracteres.");
      if (vagaEspecial && !declarouDireito)
        return setError("Confirme a declaração do direito à vaga especial.");
    }

    if (!aceitouPrivacidade)
      return setError("Para criar a conta, aceite a política de privacidade.");

    if (estacionamento) {
      const problema = problemaNoPedido(dadosDoPedido());
      if (problema) return setError(problema);
    }

    setLoading(true);

    let uid = contaCriada;
    if (!uid) {
      try {
        const cred = await register(
          name,
          email,
          password,
          estacionamento ? "candidato" : "motorista",
          telefone,
          estacionamento ? "" : vagaEspecial
        );
        uid = cred.user.uid;
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
    }

    if (estacionamento) {
      setContaCriada(uid);
      try {
        await enviarPedido(uid, dadosDoPedido());
      } catch (err) {
        setError(
          `Sua conta foi criada, mas o pedido não chegou: ${traduzErroFirestore(err)} ` +
            "Toque em Enviar pedido para tentar de novo."
        );
        setLoading(false);
        return;
      }
    }

    toast.sucesso(
      estacionamento
        ? "Pedido enviado! A equipe do ParaAí vai analisar."
        : "Conta criada! Bem-vindo ao ParaAí."
    );
    navigate("/dashboard");
  }

  // Quem já entrou vai para o painel, menos durante o envio desta tela (a
  // conta nasce antes do pedido) ou quando só o pedido falhou.
  if (user && !loading && !contaCriada) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-page">
      <div className="card auth-card auth-card-larga">
        <div className="auth-logo">
          <LogoMark size={54} />
        </div>
        <h1 className="auth-title">
          {estacionamento ? "Cadastre seu estacionamento" : "Criar conta"}
        </h1>
        <p className="subtitle">
          {estacionamento
            ? `Etapa ${etapa} de ${totalEtapas} · ${nomesEtapas[etapa - 1]}`
            : "Comece agora, leva menos de um minuto"}
        </p>

        {/* trilha de etapas (só estacionamento) */}
        {estacionamento && (
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
        {etapa === 1 && !contaCriada && (
          <div className="role-switch" role="radiogroup" aria-label="Tipo de conta">
            <button
              type="button"
              role="radio"
              aria-checked={!estacionamento}
              className={`role-option ${!estacionamento ? "active" : ""}`}
              onClick={() => trocarPapel("motorista")}
            >
              <span className="role-icone"><IconeMotorista /></span>
              <span className="role-titulo">Sou motorista</span>
              <span className="role-desc">Estacionar na rede</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={estacionamento}
              className={`role-option ${estacionamento ? "active" : ""}`}
              onClick={() => trocarPapel("estacionamento")}
            >
              <span className="role-icone"><IconeEstacionamento /></span>
              <span className="role-titulo">Tenho um estacionamento</span>
              <span className="role-desc">Pôr o meu pátio na rede</span>
            </button>
          </div>
        )}

        {estacionamento && etapa === 1 && (
          <p className="cadastro-como-funciona">
            Você manda o pedido em três etapas. A equipe do ParaAí confere os
            dados e, com o pedido aprovado, o seu pátio entra no mapa dos
            motoristas e a sua conta ganha o painel do estacionamento.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (estacionamento && etapa < 3) avancar();
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

              {!estacionamento && (
                <CampoDireitoVaga
                  id="vagaEspecial"
                  valor={vagaEspecial}
                  onValor={setVagaEspecial}
                  declarado={declarouDireito}
                  onDeclarado={setDeclarouDireito}
                />
              )}

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
              <div className="field-row">
                <div className="field">
                  <label htmlFor="numVagas">Quantas vagas?</label>
                  <input
                    id="numVagas"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    required
                    autoFocus
                    value={numVagas}
                    onChange={(e) => setNumVagas(e.target.value)}
                    placeholder="Ex.: 20"
                  />
                  <span className="field-hint">De 1 a 200. Dá para mudar depois.</span>
                </div>

                <div className="field">
                  <label htmlFor="tarifa">Preço da hora (R$)</label>
                  <input
                    id="tarifa"
                    type="text"
                    inputMode="decimal"
                    required
                    value={tarifa}
                    onChange={(e) => setTarifa(e.target.value)}
                    placeholder="Ex.: 8,00"
                  />
                  <span className="field-hint">O motorista paga pelo tempo, hora a hora.</span>
                </div>
              </div>

              <div className="field">
                <label htmlFor="mensagem">Recado para a equipe (opcional)</label>
                <textarea
                  id="mensagem"
                  rows={3}
                  maxLength={LIMITE_MENSAGEM}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Ex.: horário de funcionamento, se o pátio é coberto, melhor horário para falar com você."
                />
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
                  <strong>{numVagas || "—"}</strong>
                </div>
                <div className="endereco-linha">
                  <span className="endereco-label">Hora</span>
                  <strong>
                    {tarifa && Number.isFinite(tarifaLida) ? formatarMoeda(tarifaLida) : "—"}
                  </strong>
                </div>
              </div>
            </>
          )}

          {/* Aceite da política na última etapa, logo antes de criar a conta. */}
          {etapa === totalEtapas && (
            <div className="field">
              <label className="declaracao declaracao-curta" htmlFor="aceitePrivacidade">
                <input
                  id="aceitePrivacidade"
                  type="checkbox"
                  required
                  checked={aceitouPrivacidade}
                  onChange={(e) => setAceitouPrivacidade(e.target.checked)}
                />
                <span>
                  Li e aceito a{" "}
                  <Link to="/privacidade" target="_blank" rel="noopener">
                    política de privacidade
                  </Link>
                  .
                </span>
              </label>
            </div>
          )}

          {/* ---------- AÇÕES ---------- */}
          <div className={etapa > 1 ? "acoes-etapa" : ""}>
            {/* Com a conta já criada, os dados de acesso não voltam a ser editados. */}
            {etapa > (contaCriada ? 2 : 1) && (
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
                ? estacionamento
                  ? "Enviando pedido..."
                  : "Criando conta..."
                : !estacionamento
                  ? "Criar minha conta"
                  : etapa < 3
                    ? "Continuar"
                    : "Enviar pedido"}
            </button>
          </div>
        </form>

        <p className="auth-footer">
          Já tem conta? <Link to="/login">Entrar</Link>
          <br />
          Faz parte da equipe? <Link to="/login?perfil=admin">Acesso administrativo</Link>
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

// Termina a frase de erro do cadastro. O motivo técnico (regras do banco
// recusando a escrita, por exemplo) vai para o console, não para a tela.
function traduzErroFirestore(err) {
  console.error("Falha ao salvar os dados do cadastro:", err);
  if (`${err?.code || ""}`.includes("permission")) {
    return "não conseguimos salvar seus dados agora.";
  }
  if (err?.code === "unavailable") {
    return "sem conexão com o ParaAí.";
  }
  return "aconteceu um erro inesperado.";
}
