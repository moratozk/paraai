import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  useAgora,
  useEstacionamentosAdmin,
  useHistoricoRede,
  useOcupacaoRede,
  useTotensRede,
} from "../hooks/useParkingData";
import {
  atualizarEstacionamentoAdmin,
  criarEstacionamentoAdmin,
} from "../services/estacionamentos";
import { buscarCep, cepCompleto, formatarCep } from "../services/cep";
import GerenciarTotens from "../components/GerenciarTotens";
import GraficoReceita from "../components/GraficoReceita";
import {
  formatarDataHora,
  formatarDuracao,
  formatarMoeda,
  valorPendente,
} from "../utils/format";
import {
  PERIODOS,
  baixarCSV,
  calcularHorarioPico,
  calcularSerieDiaria,
  inicioDoPeriodo,
  resumirEstadias,
} from "../utils/relatorios";
import { TOTEM_OFFLINE_APOS_SEGUNDOS } from "../utils/constants";
import "./Pages.css";
import "./Admin.css";

// Linhas da tabela de movimentações: as mais recentes primeiro e mais a cada
// clique. O CSV leva todas as do filtro.
const LINHAS_INICIAIS = 10;
const LINHAS_POR_CLIQUE = 20;

// Situação do totem de um estacionamento pelo último sinal (heartbeat) que
// ele gravou no documento do estacionamento.
function situacaoDoTotem(estacionamento, agora, quantosTotens) {
  const ultimo = Number(estacionamento.ultimaAtualizacao) || 0;
  if (ultimo > 0 && agora - ultimo < TOTEM_OFFLINE_APOS_SEGUNDOS) {
    return { online: true, rotulo: "Totem online", classe: "online" };
  }
  if (ultimo > 0) return { online: false, rotulo: "Totem offline", classe: "warning" };
  return quantosTotens > 0
    ? { online: false, rotulo: "Totem nunca conectou", classe: "offline" }
    : { online: false, rotulo: "Sem totem", classe: "offline" };
}

function IconeSeta() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const FORM_VAZIO = {
  nome: "",
  numVagas: 20,
  tarifaHora: 5,
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "SP",
};

function dadosFormulario(estacionamento) {
  return {
    nome: estacionamento.nome || "",
    numVagas: estacionamento.numVagas || 1,
    tarifaHora: estacionamento.tarifaHora ?? 0,
    cep: estacionamento.cep || "",
    logradouro: estacionamento.logradouro || "",
    numero: estacionamento.numero || "",
    bairro: estacionamento.bairro || "",
    cidade: estacionamento.cidade || "",
    uf: estacionamento.uf || "",
  };
}

export default function PainelAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const { estacionamentos, loading, erro } = useEstacionamentosAdmin();
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroForm, setErroForm] = useState("");

  const [periodo, setPeriodo] = useState("7d");
  const [filtroEstacionamento, setFiltroEstacionamento] = useState("");
  const [busca, setBusca] = useState("");
  const [totensAbertos, setTotensAbertos] = useState(null);
  const [linhasVisiveis, setLinhasVisiveis] = useState(LINHAS_INICIAIS);

  const agora = useAgora(30000);
  const {
    historico,
    loading: carregandoHistorico,
    erro: erroHistorico,
  } = useHistoricoRede(true);
  const { totens, loading: carregandoTotens, erro: erroTotens } = useTotensRede(true);
  const ocupadas = useOcupacaoRede(estacionamentos);

  const nomesPorEstacionamento = useMemo(
    () =>
      Object.fromEntries(
        estacionamentos.map((item) => [item.id, item.nome || item.id])
      ),
    [estacionamentos]
  );
  const totensPorEstacionamento = useMemo(() => {
    const grupos = {};
    totens.forEach((totem) => {
      (grupos[totem.estacionamentoId] ||= []).push(totem);
    });
    return grupos;
  }, [totens]);

  // --- recortes do período ---
  const periodoAtivo = PERIODOS.find((p) => p.id === periodo) || PERIODOS[1];
  const rotuloPeriodo = periodoAtivo.rotulo.toLowerCase();
  const desde = useMemo(() => inicioDoPeriodo(periodoAtivo), [periodoAtivo]);
  const doPeriodo = useMemo(
    () => historico.filter((h) => (Number(h.saida) || 0) >= desde),
    [historico, desde]
  );
  const resumo = useMemo(() => resumirEstadias(doPeriodo), [doPeriodo]);
  const resumoPorEstacionamento = useMemo(() => {
    const grupos = {};
    doPeriodo.forEach((h) => {
      (grupos[h.estacionamentoId] ||= []).push(h);
    });
    return Object.fromEntries(
      Object.entries(grupos).map(([id, itens]) => [id, resumirEstadias(itens)])
    );
  }, [doPeriodo]);
  const pico = useMemo(() => calcularHorarioPico(doPeriodo), [doPeriodo]);
  const diasGrafico = periodoAtivo.dias === 30 ? 14 : 7;
  const serie = useMemo(
    () => calcularSerieDiaria(historico, diasGrafico),
    [historico, diasGrafico]
  );

  // --- situação agora ---
  const publicados = estacionamentos.filter((item) => item.ativo !== false).length;
  const vagasRede = estacionamentos.reduce(
    (total, item) => total + (Number(item.numVagas) || 0),
    0
  );
  const ocupadasRede = estacionamentos.reduce(
    (total, item) => total + (Number(ocupadas[item.id]) || 0),
    0
  );
  const taxaOcupacao = vagasRede ? Math.round((ocupadasRede / vagasRede) * 100) : 0;
  const situacoes = Object.fromEntries(
    estacionamentos.map((item) => [
      item.id,
      situacaoDoTotem(item, agora, (totensPorEstacionamento[item.id] || []).length),
    ])
  );
  const totensOnline = Object.values(situacoes).filter((item) => item.online).length;

  // --- movimentações filtradas ---
  const movimentacoes = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return doPeriodo.filter(
      (h) =>
        (!filtroEstacionamento || h.estacionamentoId === filtroEstacionamento) &&
        (!termo || (h.placa || "").includes(termo))
    );
  }, [doPeriodo, filtroEstacionamento, busca]);

  function exportarCSV() {
    if (!movimentacoes.length) {
      toast.info("Nada para exportar com este filtro.");
      return;
    }
    baixarCSV(
      movimentacoes,
      filtroEstacionamento ? nomesPorEstacionamento[filtroEstacionamento] : "rede",
      { nomesPorEstacionamento }
    );
    toast.sucesso(`${movimentacoes.length} movimentações exportadas.`);
  }

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function abrirNovo() {
    setForm({ ...FORM_VAZIO });
    setEditandoId(null);
    setErroForm("");
    setFormAberto(true);
  }

  function abrirEdicao(estacionamento) {
    setForm(dadosFormulario(estacionamento));
    setEditandoId(estacionamento.id);
    setErroForm("");
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function atualizarCep(valor) {
    const cep = formatarCep(valor);
    atualizarCampo("cep", cep);
    if (!cepCompleto(cep)) return;
    setBuscandoCep(true);
    try {
      const endereco = await buscarCep(cep);
      setForm((atual) => ({
        ...atual,
        cep,
        logradouro: endereco.logradouro || atual.logradouro,
        bairro: endereco.bairro || atual.bairro,
        cidade: endereco.cidade || atual.cidade,
        uf: endereco.uf || atual.uf,
      }));
    } catch (err) {
      setErroForm(err.message || "Não foi possível localizar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function salvar(event) {
    event.preventDefault();
    setErroForm("");
    setSalvando(true);
    try {
      if (editandoId) {
        await atualizarEstacionamentoAdmin(editandoId, form);
        toast.sucesso("Estacionamento atualizado.");
      } else {
        const id = await criarEstacionamentoAdmin({ uid: user.uid, ...form });
        toast.sucesso(`Estacionamento ${id} criado e publicado.`);
      }
      setFormAberto(false);
      setEditandoId(null);
      setForm({ ...FORM_VAZIO });
    } catch (err) {
      setErroForm(err.message || "Não foi possível salvar o estacionamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(estacionamento) {
    try {
      await atualizarEstacionamentoAdmin(estacionamento.id, {
        ativo: estacionamento.ativo === false,
      });
      toast.sucesso(
        estacionamento.ativo === false
          ? "Estacionamento publicado para os motoristas."
          : "Estacionamento retirado da lista pública."
      );
    } catch (err) {
      toast.erro(err.message || "Não foi possível alterar a publicação.");
    }
  }

  return (
    <main className="page container admin-page">
      <div className="page-header header-row">
        <div>
          <span className="admin-eyebrow">Administração do sistema</span>
          <h1>Rede ParaAí</h1>
          <p>Faturamento, ocupação e totens de todos os estacionamentos.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={abrirNovo}>
          Novo estacionamento
        </button>
      </div>

      {formAberto && (
        <form className="card admin-form" onSubmit={salvar}>
          <div className="card-head-row">
            <div>
              <h2>{editandoId ? "Editar estacionamento" : "Novo estacionamento"}</h2>
              {editandoId && <code className="est-id">{editandoId}</code>}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setFormAberto(false)}
            >
              Cancelar
            </button>
          </div>

          <div className="admin-form-grid">
            <label className="field admin-span-2">
              <span>Nome do estacionamento</span>
              <input
                required
                value={form.nome}
                onChange={(event) => atualizarCampo("nome", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Número de vagas</span>
              <input
                required
                type="number"
                min="1"
                max="200"
                value={form.numVagas}
                onChange={(event) => atualizarCampo("numVagas", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Tarifa por hora</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.tarifaHora}
                onChange={(event) => atualizarCampo("tarifaHora", event.target.value)}
              />
            </label>
            <label className="field">
              <span>CEP</span>
              <div className="input-com-acao">
                <input
                  value={form.cep}
                  onChange={(event) => atualizarCep(event.target.value)}
                  maxLength="9"
                  placeholder="00000-000"
                />
                {buscandoCep && <span className="input-spinner" />}
              </div>
            </label>
            <label className="field admin-span-2">
              <span>Logradouro</span>
              <input
                value={form.logradouro}
                onChange={(event) => atualizarCampo("logradouro", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Número</span>
              <input
                value={form.numero}
                onChange={(event) => atualizarCampo("numero", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Bairro</span>
              <input
                value={form.bairro}
                onChange={(event) => atualizarCampo("bairro", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Cidade</span>
              <input
                value={form.cidade}
                onChange={(event) => atualizarCampo("cidade", event.target.value)}
              />
            </label>
            <label className="field">
              <span>UF</span>
              <input
                value={form.uf}
                maxLength="2"
                onChange={(event) => atualizarCampo("uf", event.target.value.toUpperCase())}
              />
            </label>
          </div>
          {erroForm && <p className="error-text">{erroForm}</p>}
          <button className="btn btn-primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Criar e publicar"}
          </button>
        </form>
      )}

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={periodo === p.id}
              className={`segmented-op ${periodo === p.id ? "ativo" : ""}`}
              onClick={() => {
                setPeriodo(p.id);
                setLinhasVisiveis(LINHAS_INICIAIS);
              }}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {erroHistorico && <p className="error-text">{erroHistorico}</p>}

      <div className="card fat-hero">
        <div>
          <span className="stat-label">Recebido na rede · {rotuloPeriodo}</span>
          <div className="fat-total">{formatarMoeda(resumo.recebido)}</div>
          {resumo.pendente > 0 && (
            <span className="muted-note fat-pendente">
              A receber: {formatarMoeda(resumo.pendente)} em saídas sem saldo
            </span>
          )}
        </div>
        <div className="fat-periodos">
          <div className="fat-p">
            <span className="stat-label">Estadias</span>
            <strong>{resumo.estadias}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">Ticket médio</span>
            <strong>{resumo.estadias ? formatarMoeda(resumo.ticketMedio) : "—"}</strong>
          </div>
          <div className="fat-p">
            <span className="stat-label">Permanência média</span>
            <strong>
              {resumo.estadias ? formatarDuracao(resumo.permanenciaMedia) : "—"}
            </strong>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Ocupação agora</span>
          <span className="stat-value accent">{taxaOcupacao}%</span>
          <div className="ocupacao-barra" aria-hidden="true">
            <div className="ocupacao-preenchida" style={{ width: `${taxaOcupacao}%` }} />
          </div>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {ocupadasRede} de {vagasRede} vagas ocupadas
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Totens online</span>
          <span className="stat-value">
            {totensOnline}
            <small className="stat-de"> de {estacionamentos.length}</small>
          </span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            estacionamentos com o totem conectado
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Estacionamentos</span>
          <span className="stat-value">{estacionamentos.length}</span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {publicados} {publicados === 1 ? "publicado" : "publicados"} para os motoristas
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Horário de pico</span>
          <span className="stat-value situacao">
            {pico ? `${String(pico.hora).padStart(2, "0")}h` : "—"}
          </span>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {pico
              ? `${pico.quantidade} ${pico.quantidade === 1 ? "entrada" : "entradas"} nesse horário · ${rotuloPeriodo}`
              : "sem estadias no período"}
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Receita da rede · últimos {diasGrafico} dias</h2>
        <GraficoReceita
          serie={serie}
          rotulo={`Receita da rede por dia dos últimos ${diasGrafico} dias`}
          vazio="Nenhuma receita registrada neste intervalo. Os valores aparecem aqui após cada saída nos totens da rede."
        />
      </div>

      <h2 className="admin-secao" id="admin-estacionamentos">
        Estacionamentos
      </h2>
      {erro && <p className="error-text">{erro}</p>}
      {loading ? (
        <div className="card empty-state">Carregando estacionamentos…</div>
      ) : estacionamentos.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum estacionamento cadastrado.</p>
          <button className="btn btn-primary" type="button" onClick={abrirNovo}>
            Cadastrar o primeiro
          </button>
        </div>
      ) : (
        <section className="admin-estacionamentos" aria-labelledby="admin-estacionamentos">
          {estacionamentos.map((item) => {
            const doEstacionamento = resumoPorEstacionamento[item.id] || resumirEstadias([]);
            const situacao = situacoes[item.id];
            const totensDoEstacionamento = totensPorEstacionamento[item.id] || [];
            const quantosTotens = totensDoEstacionamento.length;
            const abertos = totensAbertos === item.id;
            return (
              <article className="card admin-estacionamento" key={item.id}>
                <div>
                  <span className="admin-localidade">
                    {[item.cidade, item.uf].filter(Boolean).join(" · ") || "Rede ParaAí"}
                  </span>
                  <h3>{item.nome || "Estacionamento sem nome"}</h3>
                  <div className="admin-estacionamento-marcas">
                    <code className="est-id">{item.id}</code>
                    <span className={`status-pill ${item.ativo === false ? "offline" : "success"}`}>
                      {item.ativo === false ? "Oculto" : "Publicado"}
                    </span>
                    <span className={`status-pill ${situacao.classe}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {situacao.rotulo}
                    </span>
                  </div>
                </div>
                <div className="admin-estacionamento-dados">
                  <div>
                    <span>Recebido · {rotuloPeriodo}</span>
                    <strong className="money">{formatarMoeda(doEstacionamento.recebido)}</strong>
                  </div>
                  <div>
                    <span>Estadias · {rotuloPeriodo}</span>
                    <strong>{doEstacionamento.estadias}</strong>
                  </div>
                  <div>
                    <span>Ocupação agora</span>
                    <strong>
                      {ocupadas[item.id] ?? "—"} de {Number(item.numVagas) || 0}
                    </strong>
                  </div>
                </div>
                <p className="admin-endereco">
                  {[item.logradouro, item.numero, item.bairro].filter(Boolean).join(", ") ||
                    "Endereço não informado"}
                  {" · "}
                  <span className="admin-tarifa">
                    Tarifa {formatarMoeda(item.tarifaHora)}/hora
                  </span>
                </p>
                <div className="admin-estacionamento-acoes">
                  <Link
                    className="btn btn-primary btn-sm"
                    to={`/admin/estacionamentos/${item.id}/vagas`}
                  >
                    Ver vagas ao vivo
                  </Link>
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => abrirEdicao(item)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => alternarAtivo(item)}>
                    {item.ativo === false ? "Publicar" : "Ocultar dos motoristas"}
                  </button>
                </div>
                <button
                  className="admin-totens-alternar"
                  type="button"
                  aria-expanded={abertos}
                  aria-controls={`totens-${item.id}`}
                  onClick={() => setTotensAbertos(abertos ? null : item.id)}
                >
                  Gerenciar totens
                  <span className="admin-totens-contagem">
                    {quantosTotens === 0
                      ? "nenhum totem"
                      : `${quantosTotens} ${quantosTotens === 1 ? "totem" : "totens"}`}
                  </span>
                  <IconeSeta />
                </button>
                {abertos && (
                  <div className="admin-totens totem-security-card" id={`totens-${item.id}`}>
                    <GerenciarTotens
                      estId={item.id}
                      totens={totensDoEstacionamento}
                      carregando={carregandoTotens}
                      erroLista={erroTotens}
                      titulo={null}
                      descricao="Cada totem usa um acesso exclusivo. Bloquear um deles não afeta a conta do dono nem os outros totens."
                    />
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <div className="card admin-movimentacoes">
        <div className="card-head-row">
          <h2 style={{ marginBottom: 0 }}>Movimentações da rede · {rotuloPeriodo}</h2>
          <button className="btn btn-outline btn-sm" type="button" onClick={exportarCSV}>
            Exportar CSV
          </button>
        </div>
        <div className="admin-filtros">
          <label className="field">
            <span>Estacionamento</span>
            <select
              value={filtroEstacionamento}
              onChange={(event) => {
                setFiltroEstacionamento(event.target.value);
                setLinhasVisiveis(LINHAS_INICIAIS);
              }}
            >
              <option value="">Todos</option>
              {estacionamentos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome || item.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Placa</span>
            <input
              type="search"
              value={busca}
              placeholder="Buscar placa..."
              onChange={(event) => {
                setBusca(event.target.value.toUpperCase());
                setLinhasVisiveis(LINHAS_INICIAIS);
              }}
            />
          </label>
        </div>

        {carregandoHistorico ? (
          <div className="skeleton-lista">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-linha" key={i} />
            ))}
          </div>
        ) : movimentacoes.length === 0 ? (
          <p className="empty-state">
            {busca
              ? `Nenhuma movimentação da placa "${busca}" com este filtro.`
              : "Nenhuma movimentação com este filtro."}
          </p>
        ) : (
          <>
            <div
              className="tabela-wrap tabela-cards"
              tabIndex={0}
              role="region"
              aria-label="Movimentações da rede"
            >
              <table className="history-table responsive-table">
                <thead>
                  <tr>
                    <th>Estacionamento</th>
                    <th>Placa</th>
                    <th>Vaga</th>
                    <th>Saída</th>
                    <th>Duração</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.slice(0, linhasVisiveis).map((h) => (
                    <tr key={h.id}>
                      <td data-label="Estacionamento">
                        {nomesPorEstacionamento[h.estacionamentoId] || h.estacionamentoId || "—"}
                      </td>
                      <td data-label="Placa">
                        <span className="placa-tag placa-tag-sm">{h.placa}</span>
                      </td>
                      <td data-label="Vaga">{h.vaga}</td>
                      <td data-label="Saída">{formatarDataHora(h.saida)}</td>
                      <td data-label="Duração">{formatarDuracao(h.duracaoMinutos)}</td>
                      <td data-label="Valor" className="money">
                        <span className="valor-com-marca">
                          {formatarMoeda(h.valorCobrado)}
                          {valorPendente(h) > 0 && (
                            <span
                              className="status-pill warning pill-pendente"
                              title={`${formatarMoeda(valorPendente(h))} não coberto pelo saldo`}
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
            {movimentacoes.length > linhasVisiveis && (
              <div className="tabela-mais">
                <p className="muted-note">
                  Mostrando as {linhasVisiveis} mais recentes de {movimentacoes.length}. O CSV
                  leva todas.
                </p>
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => setLinhasVisiveis((atual) => atual + LINHAS_POR_CLIQUE)}
                >
                  Ver mais
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
