import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  atualizarConfiguracao,
  publicarMapaVagas,
  sincronizarCatalogo,
} from "../services/estacionamentos";
import {
  useEstacionamento,
  useVagas,
  useHistoricoEstacionamento,
} from "../hooks/useParkingData";
import StatusTotem from "../components/StatusTotem";
import MapaVagas from "../components/MapaVagas";
import GraficoReceita from "../components/GraficoReceita";
import {
  formatarMoeda,
  formatarDataHora,
  formatarDuracao,
  valorPendente,
  valorRecebido,
} from "../utils/format";
import {
  PERIODOS,
  baixarCSV,
  calcularClientes,
  calcularHorarioPico,
  calcularSerieDiaria,
  inicioDoPeriodo,
} from "../utils/relatorios";
import "./Pages.css";

export default function PainelOperador() {
  const { userData } = useAuth();
  const toast = useToast();
  const estId = userData?.estacionamentoId || null;

  const { estacionamento, online } = useEstacionamento(estId);

  const assinaturaCatalogo = [
    estacionamento?.nome,
    estacionamento?.numVagas,
    estacionamento?.tarifaHora,
    estacionamento?.cep,
    estacionamento?.logradouro,
    estacionamento?.numero,
    estacionamento?.bairro,
    estacionamento?.cidade,
    estacionamento?.uf,
    estacionamento?.ultimaAtualizacao,
    estacionamento?.vagasLivres,
    estacionamento?.vagasEmOperacao,
  ].join("|");

  useEffect(() => {
    if (!estacionamento?.id) return;
    sincronizarCatalogo(estacionamento).catch((err) =>
      console.error("Não foi possível sincronizar o catálogo:", err)
    );
    // A assinatura contém somente os campos públicos sincronizados acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estacionamento?.id, assinaturaCatalogo]);

  const { vagas } = useVagas(estId, estacionamento?.numVagas);
  const { historico, loading } = useHistoricoEstacionamento(estId);

  const [periodo, setPeriodo] = useState("7d");
  const [busca, setBusca] = useState("");

  // edição dos dados operacionais direto no painel
  const [editando, setEditando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaTarifa, setNovaTarifa] = useState("");
  const [novasVagas, setNovasVagas] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [publicarMapaAoSalvar, setPublicarMapaAoSalvar] = useState(false);

  function abrirEdicao() {
    setNovoNome(estacionamento?.nome || "");
    setNovaTarifa(String(estacionamento?.tarifaHora ?? 5));
    setNovasVagas(String(estacionamento?.numVagas ?? 4));
    setPublicarMapaAoSalvar(estacionamento?.modoDisponibilidade === "mapa");
    setEditando(true);
  }

  function prepararDemonstracaoFatec() {
    setNovoNome("Estacionamento FATEC");
    setNovaTarifa(String(estacionamento?.tarifaHora ?? 5));
    setNovasVagas("20");
    setPublicarMapaAoSalvar(true);
    setEditando(true);
  }

  async function salvarConfig(e) {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      await atualizarConfiguracao(estId, {
        nome: novoNome,
        tarifaHora: novaTarifa.replace(",", "."),
        numVagas: novasVagas,
      });
      if (publicarMapaAoSalvar) {
        await publicarMapaVagas(estId);
      }
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
  const desde = useMemo(() => inicioDoPeriodo(periodoAtivo), [periodoAtivo]);

  const doPeriodo = useMemo(
    () => historico.filter((h) => (Number(h.saida) || 0) >= desde),
    [historico, desde]
  );

  // --- KPIs ---
  // Recebido exclui o que o saldo do motorista não cobriu (pendência).
  const faturamentoPeriodo = doPeriodo.reduce((s, h) => s + valorRecebido(h), 0);
  const pendentePeriodo = doPeriodo.reduce((s, h) => s + valorPendente(h), 0);
  const faturamentoTotal = historico.reduce((s, h) => s + valorRecebido(h), 0);
  const cobradoPeriodo = doPeriodo.reduce(
    (s, h) => s + (Number(h.valorCobrado) || 0),
    0
  );
  const ticketMedio = doPeriodo.length
    ? cobradoPeriodo / doPeriodo.length
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
        <div className="card empty-state setup-pendente">
          <h2>Conclua o cadastro do estacionamento</h2>
          <p>
            Sua conta de operador está pronta, mas ainda falta informar os
            dados do pátio para liberar o painel.
          </p>
          <Link to="/perfil" className="btn btn-primary">
            Informar dados do estacionamento
          </Link>
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
          {(estacionamento?.nome !== "Estacionamento FATEC" ||
            Number(estacionamento?.numVagas) !== 20) && (
            <button className="btn btn-primary btn-sm" onClick={prepararDemonstracaoFatec}>
              Preparar demo FATEC
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={abrirEdicao}>
            Ajustar estacionamento
          </button>
        </div>
      </div>

      {/* Situação do equipamento: guia de instalação na primeira vez, alerta
          quando cai, e uma linha discreta quando está tudo certo. */}
      <StatusTotem
        estacionamento={estacionamento ? { id: estId, ...estacionamento } : null}
        online={online}
        onCopiarId={() => {
          navigator.clipboard?.writeText(estId);
          toast.sucesso("Identificador copiado.");
        }}
      />

      {/* ---------- Edição de tarifa / vagas ---------- */}
      {editando && (
        <div className="card card-glow config-rapida">
          <form onSubmit={salvarConfig}>
            <div className="card-head-row">
              <h2 style={{ marginBottom: 0, background: "none", paddingBottom: 0 }}>
                Configuração do pátio
              </h2>
            </div>
            <div className="field">
              <label htmlFor="novoNome">Nome do estacionamento</label>
              <input
                id="novoNome"
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="novaTarifa">Tarifa por hora (R$)</label>
                <input
                  id="novaTarifa"
                  type="number"
                  min={0}
                  step="0.50"
                  value={novaTarifa}
                  onChange={(e) => setNovaTarifa(e.target.value)}
                />
                <span className="field-hint">
                  Cobrada proporcional aos minutos estacionados. O totem lê
                  este valor automaticamente.
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
                  O totem se ajusta sozinho: em até um minuto passa a distribuir
                  as entradas entre essa mesma quantidade de vagas.
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
            Painel e totem usam a mesma tarifa. O equipamento sincroniza as
            alterações em até um minuto quando está conectado.
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
            Recebido · {periodoAtivo.rotulo.toLowerCase()}
          </span>
          <div className="fat-total">{formatarMoeda(faturamentoPeriodo)}</div>
          {pendentePeriodo > 0 && (
            <span className="muted-note fat-pendente">
              A receber: {formatarMoeda(pendentePeriodo)} em saídas sem saldo
            </span>
          )}
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
            <strong>{doPeriodo.length ? formatarMoeda(ticketMedio) : "—"}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">Permanência média</span>
            <strong>{doPeriodo.length ? formatarDuracao(permanenciaMedia) : "—"}</strong>
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

      <MapaVagas vagas={vagas} nomeEstacionamento={estacionamento?.nome} />

      <div className="dashboard-grid">
        <div className="dashboard-col">
          {/* ---------- Gráfico ---------- */}
          <div className="card">
            <h2>Receita · últimos {diasGrafico} dias</h2>
            <GraficoReceita
              serie={serie}
              rotulo={`Receita por dia dos últimos ${diasGrafico} dias`}
              vazio="Nenhuma receita registrada neste intervalo. Os valores aparecem aqui automaticamente após cada saída no totem."
            />
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
              // Em telas médias a tabela rola de lado: com foco, o teclado
              // também consegue rolar.
              <div
                className="tabela-wrap tabela-cards"
                tabIndex={0}
                role="region"
                aria-label="Movimentações"
              >
                <table className="history-table responsive-table">
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
                        <td data-label="Placa">
                          <span className="placa-tag placa-tag-sm">
                            {item.placa}
                          </span>
                        </td>
                        <td data-label="Vaga">{item.vaga}</td>
                        <td data-label="Entrada">{formatarDataHora(item.entrada)}</td>
                        <td data-label="Saída">{formatarDataHora(item.saida)}</td>
                        <td data-label="Duração">{formatarDuracao(item.duracaoMinutos)}</td>
                        <td data-label="Valor" className="money">
                          <span className="valor-com-marca">
                            {formatarMoeda(item.valorCobrado)}
                            {valorPendente(item) > 0 && (
                              <span
                                className="status-pill warning pill-pendente"
                                title={`${formatarMoeda(valorPendente(item))} não coberto pelo saldo`}
                              >
                                pendente
                              </span>
                            )}
                          </span>
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
          {/* ---------- Clientes ---------- */}
          <div className="card">
            <h2>Melhores clientes</h2>
            {clientes.length === 0 ? (
              <p className="empty-state">
                Os clientes aparecem aqui após o primeiro uso.
              </p>
            ) : (
              <div className="tabela-wrap tabela-cards">
                <table className="history-table history-table-compacta responsive-table">
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
                        <td data-label="Placa">
                          <span className="placa-tag placa-tag-sm">{c.placa}</span>
                        </td>
                        <td data-label="Usos">{c.acessos}</td>
                        <td data-label="Gasto" className="money">
                          {formatarMoeda(c.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
