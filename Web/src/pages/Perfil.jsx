import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useVeiculo, useEstacionamento } from "../hooks/useParkingData";
import { registrarVeiculo, adicionarSaldo } from "../services/veiculos";
import { criarEstacionamento } from "../services/estacionamentos";
import { normalizarPlaca, placaValida, formatarMoeda } from "../utils/format";
import "./Pages.css";

const VALORES_RECARGA = [10, 25, 50];

export default function Perfil() {
  const { user, userData } = useAuth();
  const role = userData?.role || "motorista";

  const name = userData?.name || user?.displayName || "Usuário";
  const email = user?.email || "";
  const placa = userData?.placa || null;
  const estId = userData?.estacionamentoId || null;

  const { veiculo } = useVeiculo(role === "motorista" ? placa : null);
  const { estacionamento } = useEstacionamento(role === "operador" ? estId : null);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [placaInput, setPlacaInput] = useState("");
  const [mensagem, setMensagem] = useState(null); // { tipo: "erro"|"ok", texto }
  const [processando, setProcessando] = useState(false);

  // Promoção motorista -> operador (também é o caminho de recuperação para
  // cadastros de operador que falharam no meio)
  const [estNome, setEstNome] = useState("");
  const [estCidade, setEstCidade] = useState("");
  const [estVagas, setEstVagas] = useState(4);
  const [estTarifa, setEstTarifa] = useState(5);
  const [msgEst, setMsgEst] = useState(null);

  async function handleCriarEstacionamento(e) {
    e.preventDefault();
    setMsgEst(null);
    if (!estNome.trim() || !estCidade.trim()) {
      setMsgEst({ tipo: "erro", texto: "Informe o nome e a cidade." });
      return;
    }
    setProcessando(true);
    try {
      await criarEstacionamento({
        uid: user.uid,
        nome: estNome.trim(),
        cidade: estCidade.trim(),
        numVagas: estVagas,
        tarifaHora: estTarifa,
      });
      // o papel troca sozinho via onSnapshot do AuthContext
    } catch (err) {
      const texto = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();
      setMsgEst({
        tipo: "erro",
        texto: texto.includes("permission")
          ? "O banco recusou a escrita (permission-denied). Publique as regras do arquivo firestore.rules no Console do Firebase e tente de novo."
          : err.message || "Erro ao cadastrar o estacionamento.",
      });
    } finally {
      setProcessando(false);
    }
  }

  async function handleCadastrarPlaca(e) {
    e.preventDefault();
    setMensagem(null);

    const placaNova = normalizarPlaca(placaInput);
    if (!placaValida(placaNova)) {
      setMensagem({
        tipo: "erro",
        texto:
          "Placa inválida. Aceitamos o padrão antigo (ABC1234) e o Mercosul (ABC1D23).",
      });
      return;
    }

    setProcessando(true);
    try {
      await registrarVeiculo({ uid: user.uid, nome: name, placa: placaNova });
      setPlacaInput("");
      setMensagem({ tipo: "ok", texto: "Veículo cadastrado com sucesso!" });
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: err.message || "Erro ao cadastrar o veículo. Tente novamente.",
      });
    } finally {
      setProcessando(false);
    }
  }

  async function handleRecarga(valor) {
    setMensagem(null);
    setProcessando(true);
    try {
      await adicionarSaldo(placa, valor);
      setMensagem({
        tipo: "ok",
        texto: `Recarga de ${formatarMoeda(valor)} adicionada ao saldo.`,
      });
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: err.message || "Erro ao adicionar saldo. Tente novamente.",
      });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Perfil</h1>
        <p>
          {role === "operador"
            ? "Sua conta e seu estacionamento no ParaAí."
            : "Sua conta e seu veículo no ParaAí."}
        </p>
      </div>

      <div className="profile-grid">
        <div className="card profile-summary">
          <div className="profile-avatar">{initials}</div>
          <h3>{name}</h3>
          <p>{email}</p>
          {role === "operador" ? (
            <span className="status-pill warning">Operador</span>
          ) : (
            placa && <span className="placa-tag">{placa}</span>
          )}
        </div>

        <div className="card">
          <h2>Dados da conta</h2>

          <div className="field">
            <label>Nome completo</label>
            <input type="text" value={name} disabled />
          </div>

          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} disabled />
          </div>

          <div className="field">
            <label>Tipo de conta</label>
            <input
              type="text"
              value={role === "operador" ? "Dono de estacionamento" : "Motorista"}
              disabled
            />
          </div>
        </div>
      </div>

      {role === "operador" ? (
        <div className="card vehicle-card">
          <h2>Meu estacionamento</h2>

          {!estacionamento ? (
            <p className="empty-state">Carregando dados do estacionamento...</p>
          ) : (
            <>
              <div className="info-row">
                <span className="label">Nome</span>
                <strong>{estacionamento.nome}</strong>
              </div>
              <div className="info-row">
                <span className="label">Cidade</span>
                <span>{estacionamento.cidade}</span>
              </div>
              <div className="info-row">
                <span className="label">Vagas</span>
                <span>{estacionamento.numVagas}</span>
              </div>
              <div className="info-row">
                <span className="label">Tarifa</span>
                <strong className="money">
                  {formatarMoeda(estacionamento.tarifaHora)}/hora
                </strong>
              </div>
              <div className="info-row">
                <span className="label">ID do estacionamento</span>
                <code className="est-id">{estId}</code>
              </div>
              <p className="muted-note">
                Este ID vincula o totem físico ao seu painel: no firmware do
                equipamento, configure{" "}
                <code>#define ESTACIONAMENTO_ID "{estId}"</code> no arquivo{" "}
                <code>Credenciais.h</code>. A tarifa cobrada pelo totem é a
                configurada no firmware.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card vehicle-card">
          <h2>Meu veículo</h2>

          {mensagem && (
            <p className={mensagem.tipo === "erro" ? "error-text" : "success-text"}>
              {mensagem.texto}
            </p>
          )}

          {!placa ? (
            <>
              <p className="muted-note" style={{ marginTop: 0 }}>
                Cadastre a placa do seu veículo para usar a rede ParaAí. É essa
                placa que você digita no totem na entrada e na saída. Aceitamos
                o padrão antigo (ABC1234) e o Mercosul (ABC1D23).
              </p>
              <form onSubmit={handleCadastrarPlaca} className="placa-form">
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label htmlFor="placa">Placa do veículo</label>
                  <input
                    id="placa"
                    type="text"
                    value={placaInput}
                    onChange={(e) => setPlacaInput(normalizarPlaca(e.target.value))}
                    placeholder="ABC1234 ou ABC1D23"
                    maxLength={7}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={processando}
                >
                  {processando ? "Cadastrando..." : "Cadastrar"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="info-row">
                <span className="label">Placa</span>
                <span className="placa-tag">{placa}</span>
              </div>
              <div className="info-row">
                <span className="label">Cadastro</span>
                {veiculo?.ativo ? (
                  <span className="status-pill success">Ativo</span>
                ) : (
                  <span className="status-pill danger">Inativo</span>
                )}
              </div>
              <div className="info-row">
                <span className="label">Situação</span>
                <span>
                  {Number(veiculo?.vagaAtual) > 0
                    ? `Estacionado — Vaga ${veiculo.vagaAtual}`
                    : "Fora do estacionamento"}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Saldo</span>
                <strong className="money">{formatarMoeda(veiculo?.saldo)}</strong>
              </div>

              <div className="saldo-actions">
                {VALORES_RECARGA.map((valor) => (
                  <button
                    key={valor}
                    className="btn-chip"
                    onClick={() => handleRecarga(valor)}
                    disabled={processando}
                  >
                    + {formatarMoeda(valor)}
                  </button>
                ))}
              </div>
              <p className="muted-note">
                Recarga simulada, sem pagamento real — recurso de demonstração
                do projeto acadêmico.
              </p>
            </>
          )}
        </div>
      )}

      {role === "motorista" && (
        <div className="card vehicle-card">
          <h2>Tenho um estacionamento</h2>
          <p className="muted-note" style={{ marginTop: 0 }}>
            Cadastre seu estacionamento para receber o kit ParaAí e acompanhar
            faturamento, acessos e ocupação. Sua conta passará a ser de
            operador.
          </p>

          {msgEst && (
            <p className={msgEst.tipo === "erro" ? "error-text" : "success-text"}>
              {msgEst.texto}
            </p>
          )}

          <form onSubmit={handleCriarEstacionamento}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="estNome">Nome do estacionamento</label>
                <input
                  id="estNome"
                  type="text"
                  value={estNome}
                  onChange={(e) => setEstNome(e.target.value)}
                  placeholder="Ex.: Estacionamento Central"
                />
              </div>
              <div className="field">
                <label htmlFor="estCidade">Cidade</label>
                <input
                  id="estCidade"
                  type="text"
                  value={estCidade}
                  onChange={(e) => setEstCidade(e.target.value)}
                  placeholder="Ex.: Curitiba - PR"
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="estVagas">Nº de vagas</label>
                <input
                  id="estVagas"
                  type="number"
                  min={1}
                  max={200}
                  value={estVagas}
                  onChange={(e) => setEstVagas(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="estTarifa">Tarifa (R$/hora)</label>
                <input
                  id="estTarifa"
                  type="number"
                  min={0}
                  step="0.50"
                  value={estTarifa}
                  onChange={(e) => setEstTarifa(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-outline" disabled={processando}>
              {processando ? "Cadastrando..." : "Cadastrar estacionamento"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
