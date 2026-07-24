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
} from "../utils/format";
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

  const totalValor = historico.reduce(
    (soma, item) => soma + (Number(item.valorCobrado) || 0),
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
      ) : historico.length === 0 ? (
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
              <span className="stat-value">{historico.length}</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">
                {role === "operador" ? "Total recebido" : "Total pago"}
              </span>
              <span className="stat-value accent">{formatarMoeda(totalValor)}</span>
            </div>
          </div>

          <div className="card">
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
                {historico.map((item) => (
                  <tr key={item.id}>
                    {role === "operador" && (
                      <td>
                        <span className="placa-tag placa-tag-sm">{item.placa}</span>
                      </td>
                    )}
                    <td>Vaga {item.vaga}</td>
                    <td>{formatarDataHora(item.entrada)}</td>
                    <td>{formatarDataHora(item.saida)}</td>
                    <td>{formatarDuracao(item.duracaoMinutos)}</td>
                    <td className="money">{formatarMoeda(item.valorCobrado)}</td>
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
