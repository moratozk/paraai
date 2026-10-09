import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  useVeiculo,
  useHistoricoPlaca,
  useEstacionamentoPublico,
  useReserva,
  useCatalogoEstacionamentos,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracaoAoVivo,
  saldoEmPendencia,
  valorPendente,
} from "../utils/format";
import { VALOR_POR_HORA } from "../utils/constants";
import { cancelarReserva, reservaAtiva } from "../services/reservas";
import { descreverVeiculo } from "../utils/veiculo";
import "./Pages.css";

export default function PainelMotorista() {
  const { user, userData } = useAuth();
  const toast = useToast();
  const firstName = (userData?.name || user?.displayName || "Motorista").split(" ")[0];
  const placa = userData?.placa || null;

  const { veiculo } = useVeiculo(placa);
  const { historico } = useHistoricoPlaca(placa);
  const { reserva } = useReserva(user?.uid);
  const [cancelandoReserva, setCancelandoReserva] = useState(false);

  const estacionado = Number(veiculo?.vagaAtual) > 0;
  const horaEntrada = Number(veiculo?.horaEntrada) || 0;

  // Em qual estacionamento da rede o carro está agora
  const estIdAtual = estacionado ? veiculo?.estacionamentoId || null : null;
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

  // Cronômetro ao vivo enquanto o carro está estacionado ou a reserva vale.
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  const reservaValida = !estacionado && reservaAtiva(reserva, agora);
  const { estacionamento: estReserva } = useEstacionamentoPublico(
    reservaValida ? reserva.estacionamentoId : null
  );
  useEffect(() => {
    if (!estacionado && !reservaValida) return undefined;
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [estacionado, reservaValida]);

  const segundosEstacionado =
    estacionado && horaEntrada > 0 ? Math.max(0, agora - horaEntrada) : 0;
  const custoEstimado = (segundosEstacionado / 3600) * tarifaAtual;

  const ultimosAcessos = historico.slice(0, 5);
  // O motorista vê o nome do estacionamento, nunca o identificador interno.
  const { estacionamentos } = useCatalogoEstacionamentos();
  const nomesPorEstacionamento = useMemo(
    () => Object.fromEntries(estacionamentos.map((item) => [item.id, item.nome])),
    [estacionamentos]
  );
  const totalGasto = historico.reduce(
    (soma, h) => soma + (Number(h.valorCobrado) || 0),
    0
  );

  const saldo = Number(veiculo?.saldo) || 0;
  // Saldo negativo: uma saída não foi coberta e o totem recusa nova entrada.
  const emPendencia = Boolean(placa) && saldoEmPendencia(saldo);
  // Alerta se o saldo não cobre nem 1 hora na tarifa vigente
  const saldoBaixo = Boolean(placa) && !emPendencia && saldo < tarifaAtual;

  async function cancelarMinhaReserva() {
    setCancelandoReserva(true);
    try {
      await cancelarReserva({ uid: user.uid, reserva });
      toast.sucesso("Reserva cancelada. A vaga voltou a ficar livre.");
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCancelandoReserva(false);
    }
  }

  const horaFimReserva = reservaValida
    ? new Date(reserva.expiraEm * 1000).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Olá, {firstName} 👋</h1>
        <p>Seu carro na rede ParaAí, em tempo real.</p>
      </div>

      {reservaValida && (
        <div className="card destaque-aviso reserva-ativa">
          <div>
            <span className="stat-label">Vaga reservada</span>
            <strong>
              Vaga {String(reserva.vaga).padStart(2, "0")} ·{" "}
              {estReserva?.nome || reserva.estacionamentoId}
            </strong>
            <span>
              Vale até {horaFimReserva} (faltam{" "}
              {formatarDuracaoAoVivo(Math.max(0, reserva.expiraEm - agora))}). Ao chegar,
              digite a placa {placa} no totem.
            </span>
          </div>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={cancelandoReserva}
            onClick={cancelarMinhaReserva}
          >
            {cancelandoReserva ? "Cancelando…" : "Cancelar reserva"}
          </button>
        </div>
      )}

      {emPendencia && (
        <div className="card destaque-aviso alerta-saldo">
          <div>
            <strong>Saldo pendente.</strong> Faltaram {formatarMoeda(-saldo)}{" "}
            para cobrir suas estadias. Recarregue para regularizar: até lá, o
            totem não registra novas entradas.
          </div>
          <Link to="/perfil" className="btn btn-primary btn-sm">
            Regularizar
          </Link>
        </div>
      )}

      {saldoBaixo && (
        <div className="card destaque-aviso alerta-saldo">
          <div>
            <strong>Saldo baixo.</strong> Você tem{" "}
            {formatarMoeda(saldo)} — menos que uma hora de estacionamento.
            Recarregue para não sair com pendência.
          </div>
          <Link to="/perfil" className="btn btn-primary btn-sm">
            Recarregar
          </Link>
        </div>
      )}

      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Saldo na carteira</span>
          <span className={`stat-value ${saldoBaixo || emPendencia ? "danger" : "accent"}`}>
            {placa ? formatarMoeda(saldo) : "—"}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Situação</span>
          <span className="stat-value situacao">
            {!placa
              ? "—"
              : estacionado
                ? "Estacionado"
                : reservaValida
                  ? "Vaga reservada"
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
                <div className="info-row">
                  <span className="label">Modelo e cor</span>
                  {descreverVeiculo(veiculo) ? (
                    <span>{descreverVeiculo(veiculo)}</span>
                  ) : (
                    <Link to="/perfil" className="field-link">
                      Informar no Perfil
                    </Link>
                  )}
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
                ) : reservaValida ? (
                  <div className="info-row">
                    <span className="label">Reserva</span>
                    <span className="status-pill warning">
                      Vaga {String(reserva.vaga).padStart(2, "0")} até {horaFimReserva}
                    </span>
                  </div>
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
                      {item.estacionamentoId
                        ? ` · ${nomesPorEstacionamento[item.estacionamentoId] || "Rede ParaAí"}`
                        : ""}
                      <div className="activity-time">
                        {item.status === "ativa"
                          ? "Em andamento"
                          : formatarDataHora(item.saida)}
                      </div>
                    </div>
                    <span
                      className={`status-pill ${
                        item.status === "ativa" || valorPendente(item) > 0
                          ? "warning"
                          : "success"
                      }`}
                      title={
                        valorPendente(item) > 0
                          ? "Parte desta estadia ficou pendente"
                          : undefined
                      }
                    >
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
