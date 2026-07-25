import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { atualizarConfiguracao } from "../services/estacionamentos";
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

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje", dias: 0 },
  { id: "7d", rotulo: "7 dias", dias: 7 },
  { id: "30d", rotulo: "30 dias", dias: 30 },
  { id: "tudo", rotulo: "Tudo", dias: null },
];

function inicioDoDia(offsetDias = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDias);
  return Math.floor(d.getTime() / 1000);
}

// Série diária de receita/acessos para o gráfico
function calcularSerieDiaria(historico, numDias) {
  const dias = [];
  for (let i = numDias - 1; i >= 0; i--) {
    const inicio = inicioDoDia(i);
    dias.push({
      inicio,
      fim: inicio + 86400,
      rotulo: DIAS_SEMANA[new Date(inicio * 1000).getDay()],
      dataCurta: new Date(inicio * 1000).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      hoje: i === 0,
      valor: 0,
      acessos: 0,
    });
  }
  historico.forEach((h) => {
    const saida = Number(h.saida) || 0;
    const dia = dias.find((d) => saida >= d.inicio && saida < d.fim);
    if (dia) {
      dia.valor += Number(h.valorCobrado) || 0;
      dia.acessos += 1;
    }
  });
  return dias;
}

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

// Hora do dia com mais entradas (0-23)
function calcularHorarioPico(historico) {
  if (!historico.length) return null;
  const porHora = new Array(24).fill(0);
  historico.forEach((h) => {
    const entrada = Number(h.entrada) || 0;
    if (entrada > 0) porHora[new Date(entrada * 1000).getHours()] += 1;
  });
  const max = Math.max(...porHora);
  if (max === 0) return null;
  return { hora: porHora.indexOf(max), quantidade: max };
}

function baixarCSV(historico, nomeEstacionamento) {
  const cabecalho = [
    "placa",
    "vaga",
    "entrada",
    "saida",
    "duracao_minutos",
    "valor_cobrado",
  ];
  const linhas = historico.map((h) =>
    [
      h.placa || "",
      h.vaga || "",
      formatarDataHora(h.entrada),
      formatarDataHora(h.saida),
      h.duracaoMinutos || 0,
      (Number(h.valorCobrado) || 0).toFixed(2).replace(".", ","),
    ].join(";")
  );
  const csv = [cabecalho.join(";"), ...linhas].join("\n");
  // BOM para o Excel abrir acentos corretamente
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paraai-movimentacoes-${(nomeEstacionamento || "estacionamento")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PainelOperador() {
  const { userData } = useAuth();
  const toast = useToast();
  const estId = userData?.estacionamentoId || null;

  const { estacionamento, online } = useEstacionamento(estId);
  const { vagas } = useVagas(estId, estacionamento?.numVagas);
  const { historico, loading } = useHistoricoEstacionamento(estId);

  const [periodo, setPeriodo] = useState("7d");
  const [busca, setBusca] = useState("");

  // edição de tarifa / vagas direto no painel
  const [editando, setEditando] = useState(false);
  const [novaTarifa, setNovaTarifa] = useState("");
  const [novasVagas, setNovasVagas] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  function abrirEdicao() {
    setNovaTarifa(String(estacionamento?.tarifaHora ?? 5));
    setNovasVagas(String(estacionamento?.numVagas ?? 4));
    setEditando(true);
  }

  async function salvarConfig(e) {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      await atualizarConfiguracao(estId, {
        tarifaHora: novaTarifa.replace(",", "."),
        numVagas: novasVagas,
      });
      toast.sucesso("Configuração atualizada!");
      setEditando(false);
    } catch (err) {
      toast.erro(err.message || "Não foi possível salvar.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  // --- recortes do período selecionado ---
  const periodoAtivo = PERIODOS.find((p) => p.id === periodo) || PERIODOS[1];
  const desde = useMemo(() => {
    if (periodoAtivo.dias === null) return 0;
    return inicioDoDia(periodoAtivo.dias === 0 ? 0 : periodoAtivo.dias - 1);
  }, [periodoAtivo]);

  const doPeriodo = useMemo(
    () => historico.filter((h) => (Number(h.saida) || 0) >= desde),
    [historico, desde]
  );

  // --- KPIs ---
  const faturamentoPeriodo = doPeriodo.reduce(
    (s, h) => s + (Number(h.valorCobrado) || 0),
    0
  );
  const faturamentoTotal = historico.reduce(
    (s, h) => s + (Number(h.valorCobrado) || 0),
    0
  );
  const ticketMedio = doPeriodo.length
    ? faturamentoPeriodo / doPeriodo.length
    : 0;
  const permanenciaMedia = doPeriodo.length
    ? doPeriodo.reduce((s, h) => s + (Number(h.duracaoMinutos) || 0), 0) /
      doPeriodo.length
    : 0;

  const ocupadas = vagas.filter((v) => v.ocupada).length;
  const taxaOcupacao = vagas.length
    ? Math.round((ocupadas / vagas.length) * 100)
    : 0;

  const clientes = useMemo(() => calcularClientes(historico), [historico]);
  const clientesPeriodo = useMemo(
    () => calcularClientes(doPeriodo).length,
    [doPeriodo]
  );
  const pico = useMemo(() => calcularHorarioPico(historico), [historico]);

  const diasGrafico = periodoAtivo.dias === 30 ? 14 : 7;
  const serie = useMemo(
    () => calcularSerieDiaria(historico, diasGrafico),
    [historico, diasGrafico]
  );
  const maxSerie = Math.max(...serie.map((d) => d.valor), 0);

  // --- tabela filtrada pela busca ---
  const movimentacoes = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const base = termo
      ? doPeriodo.filter((h) => (h.placa || "").includes(termo))
      : doPeriodo;
    return base.slice(0, 25);
  }, [doPeriodo, busca]);

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
      {/* ---------- Cabeçalho ---------- */}
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
        <div className="header-acoes">
          {online ? (
            <span className="status-pill success">
              <span className="status-dot online pulsa"></span>Totem online
            </span>
          ) : (
            <span className="status-pill danger">
              <span className="status-dot offline"></span>Totem offline
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={abrirEdicao}>
            Ajustar tarifa
          </button>
        </div>
      </div>

      {/* ---------- Edição de tarifa / vagas ---------- */}
      {editando && (
        <div className="card card-glow config-rapida">
          <form onSubmit={salvarConfig}>
            <div className="card-head-row">
              <h2 style={{ marginBottom: 0, background: "none", paddingBottom: 0 }}>
                Configuração do pátio
              </h2>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="novaTarifa">Tarifa por hora (R$)</label>
                <input
                  id="novaTarifa"
                  type="number"
                  min={0}
                  step="0.50"
                  autoFocus
                  value={novaTarifa}
                  onChange={(e) => setNovaTarifa(e.target.value)}
                />
                <span className="field-hint">
                  Cobrada proporcional aos minutos estacionados.
                </span>
              </div>
              <div className="field">
                <label htmlFor="novasVagas">Número de vagas</label>
                <input
                  id="novasVagas"
                  type="number"
                  min={1}
                  max={200}
                  value={novasVagas}
                  onChange={(e) => setNovasVagas(e.target.value)}
                />
                <span className="field-hint">
                  Quantas vagas o painel deve monitorar.
                </span>
              </div>
            </div>
            <div className="acoes-etapa">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditando(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={salvandoConfig}
              >
                {salvandoConfig ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
          <p className="muted-note">
            Atenção: a tarifa que o <strong>totem</strong> cobra é a definida no
            firmware (<code>VALOR_POR_HORA</code>). O valor aqui vale para o
            painel e para as estimativas mostradas ao motorista.
          </p>
        </div>
      )}

      {/* ---------- Barra de período ---------- */}
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={periodo === p.id}
              className={`segmented-op ${periodo === p.id ? "ativo" : ""}`}
              onClick={() => setPeriodo(p.id)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            if (!doPeriodo.length) {
              toast.info("Nada para exportar neste período.");
              return;
            }
            baixarCSV(doPeriodo, estacionamento?.nome);
            toast.sucesso(`${doPeriodo.length} movimentações exportadas.`);
          }}
        >
          Exportar CSV
        </button>
      </div>

      {/* ---------- Faturamento em destaque ---------- */}
      <div className="card fat-hero">
        <div>
          <span className="stat-label">
            Faturamento · {periodoAtivo.rotulo.toLowerCase()}
          </span>
          <div className="fat-total">{formatarMoeda(faturamentoPeriodo)}</div>
          <span className="muted-note" style={{ marginTop: 4, display: "block" }}>
            Acumulado histórico: {formatarMoeda(faturamentoTotal)}
          </span>
        </div>
        <div className="fat-periodos">
          <div className="fat-p">
            <span className="stat-label">Veículos</span>
            <strong>{doPeriodo.length}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">Ticket médio</span>
            <strong>{formatarMoeda(ticketMedio)}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">Permanência média</span>
            <strong>{formatarDuracao(permanenciaMedia)}</strong>
          </div>
        </div>
      </div>

      {/* ---------- KPIs de operação ---------- */}
      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Ocupação agora</span>
          <span className="stat-value accent">{taxaOcupacao}%</span>
          <div className="ocupacao-barra">
            <div
              className="ocupacao-preenchida"
              style={{ width: `${taxaOcupacao}%` }}
            />
          </div>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {ocupadas} de {vagas.length} vagas ocupadas
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Clientes no período</span>
          <span className="stat-value">{clientesPeriodo}</span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {clientes.length} clientes únicos no total
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Veículos no total</span>
          <span className="stat-value">{historico.length}</span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            desde o início da operação
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Horário de pico</span>
          <span className="stat-value situacao">
            {pico ? `${String(pico.hora).padStart(2, "0")}h` : "—"}
          </span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {pico ? `${pico.quantidade} entradas nesse horário` : "sem dados ainda"}
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col">
          {/* ---------- Gráfico ---------- */}
          <div className="card">
            <h2>Receita · últimos {diasGrafico} dias</h2>
            {maxSerie <= 0 ? (
              <p className="empty-state">
                Nenhuma receita registrada neste intervalo. Os valores aparecem
                aqui automaticamente após cada saída no totem.
              </p>
            ) : (
              <div
                className="chart-bars"
                role="img"
                aria-label={`Receita por dia dos últimos ${diasGrafico} dias`}
              >
                {serie.map((dia, i) => (
                  <div className="chart-col" key={i}>
                    <div className="chart-bar-track">
                      <div
                        className={`chart-bar ${dia.hoje ? "hoje" : ""}`}
                        style={{
                          height: `${Math.round((dia.valor / maxSerie) * 100)}%`,
                        }}
                      >
                        <span className="chart-tooltip">
                          {dia.dataCurta} · {formatarMoeda(dia.valor)} ·{" "}
                          {dia.acessos} {dia.acessos === 1 ? "carro" : "carros"}
                        </span>
                        {dia.valor === maxSerie && (
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

          {/* ---------- Movimentações ---------- */}
          <div className="card">
            <div className="card-head-row">
              <h2 style={{ marginBottom: 0, background: "none", paddingBottom: 0 }}>
                Movimentações
              </h2>
              <input
                type="search"
                className="input-busca"
                placeholder="Buscar placa..."
                value={busca}
                onChange={(e) => setBusca(e.target.value.toUpperCase())}
                aria-label="Buscar por placa"
              />
            </div>

            {loading ? (
              <div className="skeleton-lista">
                {[0, 1, 2, 3].map((i) => (
                  <div className="skeleton-linha" key={i} />
                ))}
              </div>
            ) : movimentacoes.length === 0 ? (
              <p className="empty-state">
                {busca
                  ? `Nenhuma movimentação da placa "${busca}" neste período.`
                  : "Nenhuma movimentação neste período."}
              </p>
            ) : (
              <div className="tabela-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Vaga</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Duração</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoes.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="placa-tag placa-tag-sm">
                            {item.placa}
                          </span>
                        </td>
                        <td>{item.vaga}</td>
                        <td>{formatarDataHora(item.entrada)}</td>
                        <td>{formatarDataHora(item.saida)}</td>
                        <td>{formatarDuracao(item.duracaoMinutos)}</td>
                        <td className="money">
                          {formatarMoeda(item.valorCobrado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-col">
          {/* ---------- Pátio ao vivo ---------- */}
          <div className="card">
            <div className="card-head-row">
              <h2 style={{ marginBottom: 0, background: "none", paddingBottom: 0 }}>
                Pátio ao vivo
              </h2>
              <span className="live-dot" title="Atualiza em tempo real">
                <span className="status-dot online pulsa"></span>AO VIVO
              </span>
            </div>
            <div className="vagas-grid mini animada">
              {vagas.map((v) => (
                <div
                  key={v.id}
                  className={`vaga-slot ${v.ocupada ? "occupied" : "free"}`}
                  title={
                    v.ocupada
                      ? `Vaga ${v.numero} ocupada${v.placa ? ` — ${v.placa}` : ""}`
                      : `Vaga ${v.numero} livre`
                  }
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

          {/* ---------- Clientes ---------- */}
          <div className="card">
            <h2>Melhores clientes</h2>
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
            <div className="card destaque-aviso">
              <h2>Vincular o totem</h2>
              <p className="muted-note" style={{ marginTop: 0 }}>
                Seu totem ainda não enviou sinal. No firmware do equipamento
                (arquivo <code>Credenciais.h</code>), configure:
              </p>
              <pre className="code-hint">
                #define ESTACIONAMENTO_ID "{estId}"
              </pre>
              <button
                className="btn btn-outline btn-block btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(estId);
                  toast.sucesso("ID copiado!");
                }}
              >
                Copiar ID
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
