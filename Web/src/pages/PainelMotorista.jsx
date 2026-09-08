import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  useVeiculo,
  useHistoricoPlaca,
  useEstacionamentoPublico,
  useEstadiaApp,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracaoAoVivo,
} from "../utils/format";
import { VALOR_POR_HORA } from "../utils/constants";
import {
  calcularCobrancaEstadiaApp,
  finalizarEstadiaApp,
} from "../services/estadiasApp";
import "./Pages.css";

export default function PainelMotorista() {
  const { user, userData } = useAuth();
  const toast = useToast();
  const firstName = (userData?.name || user?.displayName || "Motorista").split(" ")[0];
  const placa = userData?.placa || null;

  const { veiculo } = useVeiculo(placa);
  const { historico } = useHistoricoPlaca(placa);
  const { estadia: estadiaApp } = useEstadiaApp(user?.uid);
  const estadiaAppAtiva = estadiaApp?.status === "ativa";
  const [finalizandoApp, setFinalizandoApp] = useState(false);
  const [erroEstadiaApp, setErroEstadiaApp] = useState("");

  const estacionado = Number(veiculo?.vagaAtual) > 0;
  const horaEntrada = Number(veiculo?.horaEntrada) || 0;

  // Em qual estacionamento da rede o carro está agora
  const estIdAtual = estacionado
    ? veiculo?.estacionamentoId || null
    : estadiaAppAtiva
      ? estadiaApp.estacionamentoId
      : null;
  const { estacionamento: estAtual } = useEstacionamentoPublico(estIdAtual);
  // O totem congela a tarifa no momento da entrada para que uma alteração no
  // painel não mude o preço de quem já está estacionado.
  const tarifaDaEntrada = Number(veiculo?.tarifaHoraEntrada);
  const tarifaDoEstacionamento = Number(estAtual?.tarifaHora);
  const tarifaAtual =
    estacionado && Number.isFinite(tarifaDaEntrada) && tarifaDaEntrada >= 0
      ? tarifaDaEntrada
      : Number.isFinite(tarifaDoEstacionamento) && tarifaDoEstacionamento >= 0
        ? tarifaDoEstacionamento
        : VALOR_POR_HORA;

  // Cronômetro ao vivo enquanto o carro está estacionado
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!estacionado && !estadiaAppAtiva) return undefined;
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [estacionado, estadiaAppAtiva]);

  const segundosEstacionado =
    estacionado && horaEntrada > 0 ? Math.max(0, agora - horaEntrada) : 0;
  const custoEstimado = (segundosEstacionado / 3600) * tarifaAtual;
  const cobrancaEstadiaApp = calcularCobrancaEstadiaApp(estadiaApp, agora);

  const ultimosAcessos = historico.slice(0, 5);
  const totalGasto = historico.reduce(
    (soma, h) => soma + (Number(h.valorCobrado) || 0),
    0
  );

  const saldo = Number(veiculo?.saldo) || 0;
  // Alerta se o saldo não cobre nem 1 hora na tarifa vigente
  const saldoBaixo = Boolean(placa) && saldo < tarifaAtual;

  async function encerrarEstadiaPeloApp() {
    setFinalizandoApp(true);
    setErroEstadiaApp("");
    try {
      const resumo = await finalizarEstadiaApp({ uid: user.uid, placa });
      toast.sucesso(
        `Permanência encerrada. Total cobrado: ${formatarMoeda(resumo.valorTotal)}.`
      );
    } catch (err) {
      setErroEstadiaApp(err.message || "Não foi possível concluir o pagamento.");
    } finally {
      setFinalizandoApp(false);
    }
  }

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Olá, {firstName} 👋</h1>
        <p>Seu carro na rede ParaAí, em tempo real.</p>
      </div>

      {estadiaAppAtiva && (
        <div className="card destaque-aviso estadia-app-ativa">
          <div>
            <span className="stat-label">Estacionamento pelo aplicativo</span>
            <strong>
              Vaga {estadiaApp.vaga} ·{" "}
              {formatarDuracaoAoVivo(cobrancaEstadiaApp.segundos)}
            </strong>
            <span>
              Total até agora: {formatarMoeda(cobrancaEstadiaApp.valorTotal)} ·{" "}
              {formatarMoeda(cobrancaEstadiaApp.tarifaMinuto)}/min
            </span>
            <span>
              Já descontado: {formatarMoeda(cobrancaEstadiaApp.valorDescontado)} ·{" "}
              falta pagar: {formatarMoeda(cobrancaEstadiaApp.valorPendente)}
            </span>
            {erroEstadiaApp && <span className="error-text">{erroEstadiaApp}</span>}
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={finalizandoApp}
            onClick={encerrarEstadiaPeloApp}
          >
            {finalizandoApp
              ? "Finalizando…"
              : `Encerrar e pagar ${formatarMoeda(cobrancaEstadiaApp.valorPendente)}`}
          </button>
        </div>
      )}

      {saldoBaixo && (
        <div className="card destaque-aviso alerta-saldo">
          <div>
            <strong>Saldo baixo.</strong> Você tem{" "}
            {formatarMoeda(saldo)} — menos que uma hora de estacionamento.
            Recarregue para não ficar preso na saída.
          </div>
          <Link to="/perfil" className="btn btn-primary btn-sm">
            Recarregar
          </Link>
        </div>
      )}

      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Saldo na carteira</span>
          <span className={`stat-value ${saldoBaixo ? "perigo" : "accent"}`}>
            {placa ? formatarMoeda(saldo) : "—"}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Situação</span>
          <span className="stat-value situacao">
            {!placa
              ? "—"
              : estacionado || estadiaAppAtiva
                ? "Estacionado"
                : "Na rua"}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Utilizações</span>
          <span className="stat-value">{historico.length}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Total gasto</span>
          <span className="stat-value">{formatarMoeda(totalGasto)}</span>
        </div>
      </div>

      <div className="card destaque-aviso marketplace-chamada-painel">
        <div>
          <strong>Vai estacionar?</strong> Compare os locais da rede, veja a
          tarifa e confira as vagas antes de sair.
        </div>
        <Link to="/estacionamentos" className="btn btn-primary btn-sm">
          Explorar estacionamentos
        </Link>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col">
          <div className="card">
            <h2>Meu carro</h2>

            {!placa ? (
              <div className="empty-state">
                <p>Você ainda não cadastrou a placa do seu veículo.</p>
                <Link to="/perfil" className="btn btn-primary">
                  Cadastrar placa
                </Link>
              </div>
            ) : (
              <>
                <div className="info-row">
                  <span className="label">Placa</span>
                  <span className="placa-tag">{placa}</span>
                </div>

                {estacionado ? (
                  <>
                    <div className="info-row">
                      <span className="label">Estacionado em</span>
                      <strong>
                        {estAtual?.nome || estIdAtual || "Estacionamento da rede"}
                      </strong>
                    </div>
                    <div className="info-row">
                      <span className="label">Vaga</span>
                      <strong>Vaga {veiculo.vagaAtual}</strong>
                    </div>
                    <div className="info-row">
                      <span className="label">Entrada</span>
                      <span>{formatarDataHora(horaEntrada)}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Tempo estacionado</span>
                      <strong>{formatarDuracaoAoVivo(segundosEstacionado)}</strong>
                    </div>
                    <div className="info-row">
                      <span className="label">Custo estimado</span>
                      <strong className="money">{formatarMoeda(custoEstimado)}</strong>
                    </div>
                  </>
                ) : estadiaAppAtiva ? (
                  <>
                    <div className="info-row">
                      <span className="label">Estacionado em</span>
                      <strong>
                        {estAtual?.nome ||
                          estadiaApp.estacionamentoId ||
                          "Estacionamento da rede"}
                      </strong>
                    </div>
                    <div className="info-row">
                      <span className="label">Vaga</span>
                      <strong>Vaga {estadiaApp.vaga}</strong>
                    </div>
                    <div className="info-row">
                      <span className="label">Situação</span>
                      <span className="status-pill success">Estadia pelo aplicativo</span>
                    </div>
                  </>
                ) : (
                  <div className="info-row">
                    <span className="label">Situação</span>
                    <span className="status-pill success">Fora do estacionamento</span>
                  </div>
                )}

                <div className="info-row">
                  <span className="label">Saldo disponível</span>
                  <strong className="money">{formatarMoeda(veiculo?.saldo)}</strong>
                </div>

                <Link to="/perfil" className="btn btn-outline btn-block" style={{ marginTop: 16 }}>
                  Recarregar saldo
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="dashboard-col">
          <div className="card">
            <h2>Últimos acessos e pagamentos</h2>
            {!placa ? (
              <p className="empty-state">Cadastre sua placa para ver seus acessos.</p>
            ) : ultimosAcessos.length === 0 ? (
              <p className="empty-state">
                Nenhum acesso registrado ainda. Ao usar um estacionamento da
                rede, o recibo aparece aqui.
              </p>
            ) : (
              <>
                {ultimosAcessos.map((item) => {
                  const cobranca =
                    item.origem === "aplicativo"
                      ? calcularCobrancaEstadiaApp(item, agora)
                      : null;
                  return (
                    <div className="activity-item" key={item.id}>
                      <div>
                        <strong>Vaga {item.vaga}</strong>
                        {item.estacionamentoId ? ` · ${item.estacionamentoId}` : ""}
                        <div className="activity-time">
                          {item.status === "ativa"
                            ? formatarDuracaoAoVivo(cobranca.segundos)
                            : formatarDataHora(item.saida)}
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          item.status === "ativa" ? "warning" : "success"
                        }`}
                      >
                        {item.status === "ativa"
                          ? `${formatarMoeda(cobranca.valorPendente)} a pagar`
                          : formatarMoeda(item.valorCobrado)}
                      </span>
                    </div>
                  );
                })}
                <Link to="/historico" className="btn btn-outline btn-block" style={{ marginTop: 16 }}>
                  Ver histórico completo
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
