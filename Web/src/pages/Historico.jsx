import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useCatalogoEstacionamentos,
  useEstadiaApp,
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
  const { user, userData } = useAuth();
  const role = userData?.role || "motorista";
  const placa = userData?.placa || null;
  const estId = userData?.estacionamentoId || null;

  const porPlaca = useHistoricoPlaca(role === "motorista" ? placa : null);
  const porEst = useHistoricoEstacionamento(role === "operador" ? estId : null);
  const { estadia: ultimaEstadiaApp } = useEstadiaApp(
    role === "motorista" ? user?.uid : null
  );
  const { estacionamentos } = useCatalogoEstacionamentos();
  const [filtro, setFiltro] = useState("todos");

  const { historico, loading } =
    role === "operador" ? porEst : porPlaca;

  const historicoCompleto = useMemo(() => {
    const itens = [...historico];
    if (
      role === "motorista" &&
      ultimaEstadiaApp &&
      !itens.some((item) => item.id === ultimaEstadiaApp.historicoId)
    ) {
      itens.push({
        id:
          ultimaEstadiaApp.historicoId ||
          `legado-${ultimaEstadiaApp.inicio || user?.uid}`,
        origem: "aplicativo",
        ownerUid: ultimaEstadiaApp.ownerUid,
        placa: ultimaEstadiaApp.placa,
        estacionamentoId: ultimaEstadiaApp.estacionamentoId,
        vaga: ultimaEstadiaApp.vaga,
        entrada: ultimaEstadiaApp.inicio,
        saida: ultimaEstadiaApp.fim || 0,
        duracaoMinutos: ultimaEstadiaApp.minutosCobrados || 0,
        tarifaMinuto: ultimaEstadiaApp.tarifaMinuto,
        modoPagamento: ultimaEstadiaApp.modoPagamento,
        valorAntecipado: ultimaEstadiaApp.valorAntecipado || 0,
        valorCobrado: ultimaEstadiaApp.valorCobrado || 0,
        valorDebitadoNaSaida: ultimaEstadiaApp.valorDebitadoNaSaida || 0,
        status: ultimaEstadiaApp.status,
      });
    }
    return itens.sort(
      (a, b) =>
        (Number(b.saida) || Number(b.entrada) || 0) -
        (Number(a.saida) || Number(a.entrada) || 0)
    );
  }, [historico, role, ultimaEstadiaApp, user?.uid]);

  const temEstadiaAppAtiva = historicoCompleto.some(
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
      historicoCompleto.map((item) => ({
        ...item,
        cobrancaApp:
          item.origem === "aplicativo"
            ? calcularCobrancaEstadiaApp(item, agora)
            : null,
      })),
    [historicoCompleto, agora]
  );

  const nomesPorEstacionamento = useMemo(
    () =>
      Object.fromEntries(
        estacionamentos.map((item) => [item.id, item.nome || item.id])
      ),
    [estacionamentos]
  );

  const comprasApp = acessosExibidos.filter(
    (item) => item.origem === "aplicativo"
  );
  const acessosFiltrados = acessosExibidos.filter((item) => {
    if (filtro === "compras") return item.origem === "aplicativo";
    if (filtro === "totem") return item.origem !== "aplicativo";
    return true;
  });

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
          <div className={`stats-grid ${role === "operador" ? "two" : "three"}`}>
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
            {role === "motorista" && (
              <div className="card stat-card">
                <span className="stat-label">Compras de vagas</span>
                <span className="stat-value">{comprasApp.length}</span>
              </div>
            )}
          </div>

          {role === "motorista" && (
            <div className="history-filters" role="group" aria-label="Filtrar acessos">
              {[
                ["todos", "Todos"],
                ["compras", "Compras no aplicativo"],
                ["totem", "Acessos pelo totem"],
              ].map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  className={filtro === id ? "ativo" : ""}
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}

          {acessosFiltrados.length === 0 ? (
            <div className="card empty-state">
              <p>Nenhum registro nesta categoria.</p>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setFiltro("todos")}
              >
                Mostrar histórico completo
              </button>
            </div>
          ) : (
          <div className="card tabela-wrap">
            <table
              className={`history-table ${
                role === "motorista" ? "history-table-completa" : ""
              }`}
            >
              <thead>
                <tr>
                  {role === "operador" && <th>Placa</th>}
                  {role === "motorista" && <th>Estacionamento</th>}
                  <th>Vaga</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Duração</th>
                  {role === "motorista" && <th>Pagamento</th>}
                  <th>Valor</th>
                  {role === "motorista" && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {acessosFiltrados.map((item) => (
                  <tr key={item.id}>
                    {role === "operador" && (
                      <td>
                        <span className="placa-tag placa-tag-sm">{item.placa}</span>
                      </td>
                    )}
                    {role === "motorista" && (
                      <td>
                        {nomesPorEstacionamento[item.estacionamentoId] ||
                          item.estacionamentoId ||
                          "Rede ParaAí"}
                      </td>
                    )}
                    <td>
                      Vaga {item.vaga}
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
                    {role === "motorista" && (
                      <td>
                        {item.origem === "aplicativo"
                          ? item.modoPagamento === "agora"
                            ? "Aplicativo · primeiro minuto antecipado"
                            : "Aplicativo · pagamento no encerramento"
                          : "Carteira no totem"}
                      </td>
                    )}
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
                      {item.origem === "aplicativo" &&
                        item.status !== "ativa" && (
                          <small>
                            {formatarMoeda(item.valorCobrado)} descontado da carteira
                          </small>
                        )}
                    </td>
                    {role === "motorista" && (
                      <td>
                        <span
                          className={`status-pill ${
                            item.status === "ativa" ? "warning" : "success"
                          }`}
                        >
                          {item.status === "ativa" ? "Em andamento" : "Concluído"}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
