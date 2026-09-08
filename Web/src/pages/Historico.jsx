import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useHistoricoPlaca,
  useHistoricoEstacionamento,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracao,
  formatarDuracaoAoVivo,
} from "../utils/format";
import { calcularCobrancaEstadiaApp } from "../services/estadiasApp";
import "./Pages.css";

// Motorista: seus acessos e pagamentos na rede.
// Operador: todas as movimentações do estacionamento dele.
export default function Historico() {
  const { userData } = useAuth();
  const role = userData?.role || "motorista";
  const placa = userData?.placa || null;
  const estId = userData?.estacionamentoId || null;

  const porPlaca = useHistoricoPlaca(role === "motorista" ? placa : null);
  const porEst = useHistoricoEstacionamento(role === "operador" ? estId : null);

  const { historico, loading } =
    role === "operador" ? porEst : porPlaca;

  const temEstadiaAppAtiva = historico.some(
    (item) => item.origem === "aplicativo" && item.status === "ativa"
  );
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!temEstadiaAppAtiva) return undefined;
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [temEstadiaAppAtiva]);

  const acessosExibidos = useMemo(
    () =>
      historico.map((item) => ({
        ...item,
        cobrancaApp:
          item.origem === "aplicativo"
            ? calcularCobrancaEstadiaApp(item, agora)
            : null,
      })),
    [historico, agora]
  );

  const totalValor = acessosExibidos.reduce(
    (soma, item) =>
      soma +
      (item.status === "ativa"
        ? Number(item.cobrancaApp?.valorDescontado) || 0
        : Number(item.valorCobrado) || 0),
    0
  );

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
      ) : acessosExibidos.length === 0 ? (
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
              <span className="stat-value">{acessosExibidos.length}</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">
                {role === "operador" ? "Total recebido" : "Total pago"}
              </span>
              <span className="stat-value accent">{formatarMoeda(totalValor)}</span>
            </div>
          </div>

          <div className="card tabela-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  {role === "operador" && <th>Placa</th>}
                  <th>Vaga</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Duração</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {acessosExibidos.map((item) => (
                  <tr key={item.id}>
                    {role === "operador" && (
                      <td>
                        <span className="placa-tag placa-tag-sm">{item.placa}</span>
                      </td>
                    )}
                    <td>
                      Vaga {item.vaga}
                      {item.status === "ativa" && (
                        <span className="status-pill warning history-active-pill">
                          Em andamento
                        </span>
                      )}
                    </td>
                    <td>{formatarDataHora(item.entrada)}</td>
                    <td>
                      {item.status === "ativa"
                        ? "Em andamento"
                        : formatarDataHora(item.saida)}
                    </td>
                    <td>
                      {item.status === "ativa"
                        ? formatarDuracaoAoVivo(item.cobrancaApp.segundos)
                        : formatarDuracao(item.duracaoMinutos)}
                    </td>
                    <td className="money history-payment">
                      <strong>
                        {formatarMoeda(
                          item.status === "ativa"
                            ? item.cobrancaApp.valorTotal
                            : item.valorCobrado
                        )}
                      </strong>
                      {item.status === "ativa" && (
                        <small>
                          {formatarMoeda(item.cobrancaApp.valorDescontado)} descontado ·{" "}
                          {formatarMoeda(item.cobrancaApp.valorPendente)} a pagar
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
