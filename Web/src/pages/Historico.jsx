import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useCatalogoEstacionamentos,
  useHistoricoPlaca,
  useHistoricoEstacionamento,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracao,
  valorPendente,
  valorRecebido,
} from "../utils/format";
import "./Pages.css";

// Situação de um recibo. Registros da estadia pelo app da versão anterior
// podem ter ficado "ativa" e continuam visíveis como histórico.
function situacao(item) {
  if (item.status === "ativa") return { rotulo: "Em andamento", classe: "warning" };
  if (valorPendente(item) > 0) return { rotulo: "Pendente", classe: "warning" };
  return { rotulo: "Concluído", classe: "success" };
}

// Motorista: seus acessos e pagamentos na rede.
// Operador: todas as movimentações do estacionamento dele.
export default function Historico() {
  const { userData } = useAuth();
  const role = userData?.role || "motorista";
  const placa = userData?.placa || null;
  const estId = userData?.estacionamentoId || null;

  const porPlaca = useHistoricoPlaca(role === "motorista" ? placa : null);
  const porEst = useHistoricoEstacionamento(role === "operador" ? estId : null);
  const { estacionamentos } = useCatalogoEstacionamentos();

  const { historico, loading } = role === "operador" ? porEst : porPlaca;

  const registros = useMemo(
    () =>
      [...historico].sort(
        (a, b) =>
          (Number(b.saida) || Number(b.entrada) || 0) -
          (Number(a.saida) || Number(a.entrada) || 0)
      ),
    [historico]
  );

  const nomesPorEstacionamento = useMemo(
    () =>
      Object.fromEntries(
        estacionamentos.map((item) => [item.id, item.nome || item.id])
      ),
    [estacionamentos]
  );

  // Recebido exclui a parte que o saldo não cobriu (pendência).
  const totalValor = registros.reduce((soma, item) => soma + valorRecebido(item), 0);
  const totalPendente = registros.reduce((soma, item) => soma + valorPendente(item), 0);

  const semVinculo = role === "motorista" ? !placa : !estId;

  return (
    <div className="page container">
      <div className="page-header">
        <h1>{role === "operador" ? "Movimentações" : "Meus acessos"}</h1>
        <p>
          {role === "operador"
            ? "Todas as entradas e saídas registradas pelo seu totem."
            : "Seus acessos e pagamentos em toda a rede ParaAí."}
        </p>
      </div>

      {semVinculo ? (
        <div className="card empty-state">
          {role === "motorista" ? (
            <>
              <p>Cadastre a placa do seu veículo para acompanhar os acessos.</p>
              <Link to="/perfil" className="btn btn-primary">
                Cadastrar placa
              </Link>
            </>
          ) : (
            <p>Sua conta ainda não tem um estacionamento vinculado.</p>
          )}
        </div>
      ) : loading ? (
        <div className="card empty-state">Carregando...</div>
      ) : registros.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum registro ainda.</p>
          <p className="muted-note">
            {role === "operador"
              ? "As movimentações aparecem aqui após cada saída registrada no totem."
              : "Os recibos aparecem aqui automaticamente após cada uso."}
          </p>
        </div>
      ) : (
        <>
          <div className="stats-grid two">
            <div className="card stat-card">
              <span className="stat-label">
                {role === "operador" ? "Movimentações" : "Utilizações"}
              </span>
              <span className="stat-value">{registros.length}</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">
                {role === "operador" ? "Total recebido" : "Total pago"}
              </span>
              <span className="stat-value accent">{formatarMoeda(totalValor)}</span>
              {totalPendente > 0 && (
                <span className="muted-note fat-pendente">
                  {role === "operador" ? "A receber" : "Pendente"}:{" "}
                  {formatarMoeda(totalPendente)}
                </span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="tabela-wrap tabela-cards">
              <table className="history-table responsive-table">
                <thead>
                  <tr>
                    {role === "operador" && <th>Placa</th>}
                    {role === "motorista" && <th>Estacionamento</th>}
                    <th>Vaga</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Duração</th>
                    <th>Valor</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((item) => {
                    const estado = situacao(item);
                    return (
                      <tr key={item.id}>
                        {role === "operador" && (
                          <td data-label="Placa">
                            <span className="placa-tag placa-tag-sm">{item.placa}</span>
                          </td>
                        )}
                        {role === "motorista" && (
                          <td data-label="Estacionamento">
                            {nomesPorEstacionamento[item.estacionamentoId] ||
                              item.estacionamentoId ||
                              "Rede ParaAí"}
                          </td>
                        )}
                        <td data-label="Vaga">Vaga {item.vaga}</td>
                        <td data-label="Entrada">{formatarDataHora(item.entrada)}</td>
                        <td data-label="Saída">
                          {item.status === "ativa" ? "—" : formatarDataHora(item.saida)}
                        </td>
                        <td data-label="Duração">{formatarDuracao(item.duracaoMinutos)}</td>
                        <td data-label="Valor" className="money">
                          {formatarMoeda(item.valorCobrado)}
                        </td>
                        <td data-label="Situação">
                          <span
                            className={`status-pill ${estado.classe}`}
                            title={
                              valorPendente(item) > 0
                                ? `${formatarMoeda(valorPendente(item))} não coberto pelo saldo`
                                : undefined
                            }
                          >
                            {estado.rotulo}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
