import { useAuth } from "../context/AuthContext";
import {
  useEstacionamento,
  useVagas,
  useHistoricoEstacionamento,
} from "../hooks/useParkingData";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracao,
} from "../utils/format";
import "./Pages.css";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Receita por dia (últimos 7 dias, hoje incluso), em dias LOCAIS
function calcularReceita7Dias(historico) {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    dias.push({
      inicio: Math.floor(d.getTime() / 1000),
      fim: Math.floor(d.getTime() / 1000) + 86400,
      rotulo: DIAS_SEMANA[d.getDay()],
      hoje: i === 0,
      valor: 0,
    });
  }
  historico.forEach((h) => {
    const saida = Number(h.saida) || 0;
    const dia = dias.find((d) => saida >= d.inicio && saida < d.fim);
    if (dia) dia.valor += Number(h.valorCobrado) || 0;
  });
  return dias;
}

// Clientes únicos do estacionamento, por gasto total
function calcularClientes(historico) {
  const porPlaca = {};
  historico.forEach((h) => {
    if (!h.placa) return;
    if (!porPlaca[h.placa]) {
      porPlaca[h.placa] = { placa: h.placa, acessos: 0, total: 0, ultimo: 0 };
    }
    const c = porPlaca[h.placa];
    c.acessos += 1;
    c.total += Number(h.valorCobrado) || 0;
    c.ultimo = Math.max(c.ultimo, Number(h.saida) || 0);
  });
  return Object.values(porPlaca).sort((a, b) => b.total - a.total);
}

export default function PainelOperador() {
  const { userData } = useAuth();
  const estId = userData?.estacionamentoId || null;

  const { estacionamento, online } = useEstacionamento(estId);
  const { vagas } = useVagas(estId, estacionamento?.numVagas);
  const { historico } = useHistoricoEstacionamento(estId);

  const agora = Math.floor(Date.now() / 1000);
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const tsHoje = Math.floor(inicioHoje.getTime() / 1000);

  const somaDesde = (ts) =>
    historico
      .filter((h) => (Number(h.saida) || 0) >= ts)
      .reduce((soma, h) => soma + (Number(h.valorCobrado) || 0), 0);
  const contaDesde = (ts) =>
    historico.filter((h) => (Number(h.saida) || 0) >= ts).length;

  const faturamentoTotal = somaDesde(0);
  const faturamentoHoje = somaDesde(tsHoje);
  const faturamento7 = somaDesde(agora - 7 * 86400);
  const faturamento30 = somaDesde(agora - 30 * 86400);

  const acessosHoje = contaDesde(tsHoje);
  const ocupadas = vagas.filter((v) => v.ocupada).length;

  const receita7 = calcularReceita7Dias(historico);
  const maxReceita = Math.max(...receita7.map((d) => d.valor));
  const clientes = calcularClientes(historico);
  const movimentacoes = historico.slice(0, 8);

  if (!estId) {
    return (
      <div className="page container">
        <div className="card empty-state">
          Sua conta de operador ainda não tem um estacionamento vinculado.
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="page-header header-row">
        <div>
          <h1>{estacionamento?.nome || "Meu estacionamento"}</h1>
          <p>
            {estacionamento?.cidade || ""}
            {estacionamento?.cidade ? " · " : ""}
            Tarifa {formatarMoeda(estacionamento?.tarifaHora ?? 0)}/hora ·{" "}
            {vagas.length} vagas
          </p>
        </div>
        {online ? (
          <span className="status-pill success">
            <span className="status-dot online"></span>Totem online
          </span>
        ) : (
          <span className="status-pill danger">
            <span className="status-dot offline"></span>Totem offline
          </span>
        )}
      </div>

      {/* ---- Faturamento em destaque ---- */}
      <div className="card fat-hero">
        <div>
          <span className="stat-label">Faturamento total</span>
          <div className="fat-total">{formatarMoeda(faturamentoTotal)}</div>
        </div>
        <div className="fat-periodos">
          <div className="fat-p">
            <span className="stat-label">Hoje</span>
            <strong>{formatarMoeda(faturamentoHoje)}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">7 dias</span>
            <strong>{formatarMoeda(faturamento7)}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">30 dias</span>
            <strong>{formatarMoeda(faturamento30)}</strong>
          </div>
        </div>
      </div>

      {/* ---- Operação ---- */}
      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Acessos hoje</span>
          <span className="stat-value">{acessosHoje}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Acessos totais</span>
          <span className="stat-value">{historico.length}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Clientes únicos</span>
          <span className="stat-value">{clientes.length}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Ocupação agora</span>
          <span className={`stat-value ${ocupadas < vagas.length ? "accent" : ""}`}>
            {ocupadas}/{vagas.length}
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col">
          {/* ---- Receita 7 dias ---- */}
          <div className="card">
            <h2>Receita — últimos 7 dias</h2>
            {maxReceita <= 0 ? (
              <p className="empty-state">
                Nenhuma receita registrada nos últimos 7 dias.
              </p>
            ) : (
              <div className="chart-bars" role="img" aria-label="Receita por dia dos últimos 7 dias">
                {receita7.map((dia, i) => (
                  <div
                    className="chart-col"
                    key={i}
                    title={`${dia.rotulo}: ${formatarMoeda(dia.valor)}`}
                  >
                    <div className="chart-bar-track">
                      <div
                        className={`chart-bar ${dia.hoje ? "hoje" : ""}`}
                        style={{ height: `${maxReceita > 0 ? Math.round((dia.valor / maxReceita) * 100) : 0}%` }}
                      >
                        {dia.valor === maxReceita && (
                          <span className="chart-bar-value">
                            {formatarMoeda(dia.valor)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="chart-col-label">{dia.rotulo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Movimentações ---- */}
          <div className="card">
            <h2>Últimas movimentações</h2>
            {movimentacoes.length === 0 ? (
              <p className="empty-state">
                Nenhuma movimentação registrada ainda. Assim que o totem
                registrar a primeira saída, ela aparece aqui.
              </p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Vaga</th>
                    <th>Saída</th>
                    <th>Duração</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="placa-tag placa-tag-sm">{item.placa}</span>
                      </td>
                      <td>{item.vaga}</td>
                      <td>{formatarDataHora(item.saida)}</td>
                      <td>{formatarDuracao(item.duracaoMinutos)}</td>
                      <td className="money">{formatarMoeda(item.valorCobrado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="dashboard-col">
          {/* ---- Pátio ao vivo (animado) ---- */}
          <div className="card">
            <h2>Pátio ao vivo</h2>
            <div className="vagas-grid mini animada">
              {vagas.map((v) => (
                <div
                  key={v.id}
                  className={`vaga-slot ${v.ocupada ? "occupied" : "free"}`}
                  title={v.ocupada ? `Vaga ${v.numero} ocupada` : `Vaga ${v.numero} livre`}
                >
                  <span className="vaga-numero">VAGA {v.numero}</span>
                  {v.ocupada ? (
                    <>
                      <span className="vaga-icon">🚗</span>
                      {v.placa && (
                        <span className="placa-tag placa-tag-sm">{v.placa}</span>
                      )}
                    </>
                  ) : (
                    <span className="vaga-free">LIVRE</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- Clientes ---- */}
          <div className="card">
            <h2>Clientes</h2>
            {clientes.length === 0 ? (
              <p className="empty-state">
                Os clientes aparecem aqui após o primeiro uso.
              </p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Usos</th>
                    <th>Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.slice(0, 6).map((c) => (
                    <tr key={c.placa}>
                      <td>
                        <span className="placa-tag placa-tag-sm">{c.placa}</span>
                      </td>
                      <td>{c.acessos}</td>
                      <td className="money">{formatarMoeda(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!online && (
            <div className="card">
              <h2>Vincular o totem</h2>
              <p className="muted-note" style={{ marginTop: 0 }}>
                Seu totem ainda não enviou sinal. No firmware do equipamento
                (arquivo <code>Credenciais.h</code>), configure:
              </p>
              <pre className="code-hint">
                #define ESTACIONAMENTO_ID "{estId}"
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
