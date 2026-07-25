import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useVeiculo,
  useHistoricoPlaca,
  useEstacionamento,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracaoAoVivo,
} from "../utils/format";
import { VALOR_POR_HORA } from "../utils/constants";
import "./Pages.css";

export default function PainelMotorista() {
  const { user, userData } = useAuth();
  const firstName = (userData?.name || user?.displayName || "Motorista").split(" ")[0];
  const placa = userData?.placa || null;

  const { veiculo } = useVeiculo(placa);
  const { historico } = useHistoricoPlaca(placa);

  const estacionado = Number(veiculo?.vagaAtual) > 0;
  const horaEntrada = Number(veiculo?.horaEntrada) || 0;

  // Em qual estacionamento da rede o carro está agora
  const estIdAtual = estacionado ? veiculo?.estacionamentoId || null : null;
  const { estacionamento: estAtual } = useEstacionamento(estIdAtual);
  const tarifaAtual = Number(estAtual?.tarifaHora) || VALOR_POR_HORA;

  // Cronômetro ao vivo enquanto o carro está estacionado
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!estacionado) return undefined;
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [estacionado]);

  const segundosEstacionado =
    estacionado && horaEntrada > 0 ? Math.max(0, agora - horaEntrada) : 0;
  const custoEstimado = (segundosEstacionado / 3600) * tarifaAtual;

  const ultimosAcessos = historico.slice(0, 5);
  const totalGasto = historico.reduce(
    (soma, h) => soma + (Number(h.valorCobrado) || 0),
    0
  );

  const saldo = Number(veiculo?.saldo) || 0;
  // Alerta se o saldo não cobre nem 1 hora na tarifa vigente
  const saldoBaixo = Boolean(placa) && saldo < tarifaAtual;

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Olá, {firstName} 👋</h1>
        <p>Seu carro na rede ParaAí, em tempo real.</p>
      </div>

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
            {!placa ? "—" : estacionado ? "Estacionado" : "Na rua"}
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
                {ultimosAcessos.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div>
                      <strong>Vaga {item.vaga}</strong>
                      {item.estacionamentoId ? ` · ${item.estacionamentoId}` : ""}
                      <div className="activity-time">{formatarDataHora(item.saida)}</div>
                    </div>
                    <span className="status-pill success">
                      {formatarMoeda(item.valorCobrado)}
                    </span>
                  </div>
                ))}
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
