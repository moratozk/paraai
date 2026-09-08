import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useEstacionamento,
  useEstadiasAppAdmin,
  useVagas,
  useVagasPublicas,
} from "../hooks/useParkingData";
import {
  formatarDataHora,
  formatarDuracaoAoVivo,
  formatarMoeda,
} from "../utils/format";
import { VAGAS_ESPECIAIS } from "../utils/mapaVagas";
import "./Pages.css";
import "./MonitoramentoVagasAdmin.css";

const FILTROS = [
  { id: "todas", rotulo: "Todas" },
  { id: "livres", rotulo: "Livres" },
  { id: "ocupadas", rotulo: "Ocupadas" },
  { id: "reservadas", rotulo: "Reservadas" },
];

function statusDaVaga(vaga) {
  if (vaga.ocupada) return "ocupada";
  if (vaga.reservada) return "reservada";
  return "livre";
}

function rotuloStatus(status) {
  if (status === "ocupada") return "Ocupada";
  if (status === "reservada") return "Reservada";
  return "Livre";
}

function minutosIniciados(inicio, agora) {
  return Math.max(1, Math.ceil(Math.max(0, agora - Number(inicio || 0)) / 60));
}

export default function MonitoramentoVagasAdmin() {
  const { estId: rotaEstId } = useParams();
  const { userData } = useAuth();
  const admin = userData?.role === "admin";
  const estId = admin ? rotaEstId : null;
  const { estacionamento, online, loading: loadingEstacionamento } =
    useEstacionamento(estId);
  const { vagas: vagasOperacionais, loading: loadingOperacional } = useVagas(
    estId,
    estacionamento?.numVagas
  );
  const {
    vagas: vagasPublicas,
    loading: loadingPublico,
    erro: erroVagasPublicas,
  } = useVagasPublicas(estId, estacionamento?.numVagas);
  const {
    estadias,
    loading: loadingEstadias,
    erro: erroEstadias,
  } = useEstadiasAppAdmin(estId);
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [vagaSelecionada, setVagaSelecionada] = useState(null);
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  const [telaCheiaNativa, setTelaCheiaNativa] = useState(false);
  const [telaCheiaAlternativa, setTelaCheiaAlternativa] = useState(false);
  const mapaRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(
      () => setAgora(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function sincronizarTelaCheia() {
      setTelaCheiaNativa(document.fullscreenElement === mapaRef.current);
    }
    document.addEventListener("fullscreenchange", sincronizarTelaCheia);
    return () => document.removeEventListener("fullscreenchange", sincronizarTelaCheia);
  }, []);

  useEffect(() => {
    if (!telaCheiaAlternativa) return undefined;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function fecharComEsc(event) {
      if (event.key === "Escape") setTelaCheiaAlternativa(false);
    }
    document.addEventListener("keydown", fecharComEsc);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", fecharComEsc);
    };
  }, [telaCheiaAlternativa]);

  const estadiasAtivas = useMemo(
    () => estadias.filter((estadia) => estadia.status === "ativa"),
    [estadias]
  );
  const estadiasPorVaga = useMemo(() => {
    const mapa = new Map();
    estadiasAtivas.forEach((estadia) => {
      const id = String(estadia.vagaId || estadia.vaga || "");
      if (id) mapa.set(id, estadia);
    });
    return mapa;
  }, [estadiasAtivas]);

  const vagas = useMemo(
    () =>
      vagasOperacionais.map((operacional, indice) => {
        const publica = vagasPublicas[indice] || {};
        const estadia = estadiasPorVaga.get(operacional.id) || null;
        const ocupada = Boolean(operacional.ocupada || publica.ocupadaFisica);
        return {
          ...operacional,
          ocupada,
          reservada: !ocupada && Boolean(publica.reservada || estadia),
          placa: operacional.placa || estadia?.placa || "",
          estadia,
          especial: VAGAS_ESPECIAIS[operacional.numero] || null,
        };
      }),
    [estadiasPorVaga, vagasOperacionais, vagasPublicas]
  );

  const resumo = useMemo(() => {
    const ocupadas = vagas.filter((vaga) => vaga.ocupada).length;
    const reservadas = vagas.filter((vaga) => vaga.reservada).length;
    return {
      total: vagas.length,
      ocupadas,
      reservadas,
      livres: Math.max(0, vagas.length - ocupadas - reservadas),
      ocupacao: vagas.length
        ? Math.round(((ocupadas + reservadas) / vagas.length) * 100)
        : 0,
    };
  }, [vagas]);

  const termo = busca.trim().toUpperCase();
  const vagasComVisibilidade = useMemo(
    () =>
      vagas.map((vaga) => {
        const status = statusDaVaga(vaga);
        const correspondeFiltro =
          filtro === "todas" ||
          (filtro === "livres" && status === "livre") ||
          (filtro === "ocupadas" && status === "ocupada") ||
          (filtro === "reservadas" && status === "reservada");
        const correspondeBusca =
          !termo ||
          String(vaga.numero).padStart(2, "0").includes(termo) ||
          vaga.placa.includes(termo);
        return { ...vaga, visivel: correspondeFiltro && correspondeBusca };
      }),
    [filtro, termo, vagas]
  );
  const quantidadeVisivel = vagasComVisibilidade.filter((vaga) => vaga.visivel).length;
  const metade = Math.ceil(vagasComVisibilidade.length / 2);
  const selecionada = vagas.find((vaga) => vaga.id === vagaSelecionada) || null;
  const loading =
    loadingEstacionamento || loadingOperacional || loadingPublico || loadingEstadias;
  const mapaEmTelaCheia = telaCheiaNativa || telaCheiaAlternativa;

  if (!admin) return <Navigate to="/dashboard" replace />;

  if (!loadingEstacionamento && !estacionamento) {
    return (
      <main className="page container monitor-admin-page">
        <div className="card empty-state">
          <h1>Estacionamento não encontrado</h1>
          <p>O local pode ter sido removido ou não está mais disponível.</p>
          <Link className="btn btn-primary" to="/dashboard">
            Voltar para a administração
          </Link>
        </div>
      </main>
    );
  }

  function renderizarVaga(vaga) {
    const status = statusDaVaga(vaga);
    return (
      <button
        type="button"
        key={vaga.id}
        className={`monitor-vaga ${status} ${vaga.especial ? `especial ${vaga.especial.tipo}` : ""} ${
          vaga.id === vagaSelecionada ? "selecionada" : ""
        } ${vaga.visivel ? "" : "fora-do-filtro"}`}
        onClick={() => vaga.visivel && setVagaSelecionada(vaga.id)}
        disabled={!vaga.visivel}
        aria-label={`Vaga ${vaga.numero}, ${rotuloStatus(status)}${
          vaga.placa ? `, placa ${vaga.placa}` : ""
        }${vaga.especial ? `, destinada a ${vaga.especial.rotulo}` : ""}`}
      >
        <span className="monitor-vaga-topo">
          <strong>{String(vaga.numero).padStart(2, "0")}</strong>
          {vaga.especial && <span title={vaga.especial.rotulo}>{vaga.especial.icone}</span>}
        </span>
        <span className="monitor-vaga-estado">{rotuloStatus(status)}</span>
        <span className="monitor-vaga-placa">
          {vaga.placa || (vaga.especial ? vaga.especial.rotulo : "Disponível")}
        </span>
      </button>
    );
  }

  async function alternarTelaCheia() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (telaCheiaAlternativa) {
      setTelaCheiaAlternativa(false);
      return;
    }
    try {
      if (!mapaRef.current?.requestFullscreen) throw new Error("FULLSCREEN_UNAVAILABLE");
      await mapaRef.current.requestFullscreen();
    } catch {
      setTelaCheiaAlternativa(true);
    }
  }

  return (
    <main className="page container monitor-admin-page">
      <Link className="monitor-voltar" to="/dashboard">
        <span aria-hidden="true">←</span> Estacionamentos da rede
      </Link>

      <header className="monitor-cabecalho">
        <div>
          <span className="monitor-sobrelinha">Central de monitoramento</span>
          <h1>{estacionamento?.nome || "Estacionamento"}</h1>
          <p>
            {[estacionamento?.cidade, estacionamento?.uf].filter(Boolean).join(" · ") ||
              estacionamento?.id}
            {estacionamento?.ultimaAtualizacao
              ? ` · última leitura ${formatarDataHora(estacionamento.ultimaAtualizacao)}`
              : " · aguardando a primeira leitura do equipamento"}
          </p>
        </div>
        <div className="monitor-status-area">
          <span className="live-dot">
            <span className="status-dot online pulsa" /> DADOS AO VIVO
          </span>
          <span className={`monitor-totem ${online ? "online" : "offline"}`}>
            Equipamento {online ? "online" : "sem sinal recente"}
          </span>
        </div>
      </header>

      <section className="monitor-resumo" aria-label="Resumo das vagas">
        <article className="card monitor-kpi total">
          <span>Total</span><strong>{resumo.total}</strong><small>vagas mapeadas</small>
        </article>
        <article className="card monitor-kpi livre">
          <span>Livres</span><strong>{resumo.livres}</strong><small>disponíveis agora</small>
        </article>
        <article className="card monitor-kpi ocupada">
          <span>Ocupadas</span><strong>{resumo.ocupadas}</strong><small>com veículo</small>
        </article>
        <article className="card monitor-kpi reservada">
          <span>Reservadas</span><strong>{resumo.reservadas}</strong><small>pelo aplicativo</small>
        </article>
      </section>

      <div className="card monitor-controles">
        <div className="segmented" role="tablist" aria-label="Filtrar vagas">
          {FILTROS.map((item) => (
            <button
              type="button"
              role="tab"
              key={item.id}
              aria-selected={filtro === item.id}
              className={`segmented-op ${filtro === item.id ? "ativo" : ""}`}
              onClick={() => setFiltro(item.id)}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
        <label className="monitor-busca">
          <span className="sr-only">Buscar vaga ou placa</span>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value.toUpperCase())}
            placeholder="Buscar vaga ou placa…"
          />
        </label>
        <span className="monitor-resultados">
          {quantidadeVisivel} de {vagas.length} vagas
        </span>
      </div>

      {(erroVagasPublicas || erroEstadias) && (
        <p className="error-text" role="alert">{erroVagasPublicas || erroEstadias}</p>
      )}

      {loading ? (
        <div className="card monitor-carregando" role="status">
          <span className="spinner" aria-hidden="true" />
          Sincronizando o mapa em tempo real…
        </div>
      ) : (
        <div className="monitor-conteudo">
          <section
            ref={mapaRef}
            className={`card monitor-mapa-card ${
              telaCheiaAlternativa ? "monitor-mapa-expandido" : ""
            }`}
            aria-label="Mapa das vagas"
          >
            <div className="monitor-mapa-cabecalho">
              <div>
                <span className="monitor-sobrelinha">Visão do pátio</span>
                <h2>Mapa de vagas</h2>
              </div>
              <div className="monitor-mapa-acoes">
                {mapaEmTelaCheia && <span>Pressione Esc para sair</span>}
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  aria-pressed={mapaEmTelaCheia}
                  onClick={alternarTelaCheia}
                >
                  <span aria-hidden="true">{mapaEmTelaCheia ? "↙" : "⛶"}</span>
                  {mapaEmTelaCheia ? "Sair da tela cheia" : "Abrir em tela cheia"}
                </button>
              </div>
            </div>
            <div className="monitor-legenda">
              <span><i className="livre" />Livre</span>
              <span><i className="ocupada" />Ocupada</span>
              <span><i className="reservada" />Reservada no app</span>
            </div>
            <div className="monitor-mapa-scroll">
              <div className="monitor-patio">
                <div className="monitor-fileira">
                  {vagasComVisibilidade.slice(0, metade).map(renderizarVaga)}
                </div>
                <div className="monitor-corredor" aria-hidden="true">
                  <span>ENTRADA</span>
                  <b>→ circulação →</b>
                  <span>SAÍDA</span>
                </div>
                <div className="monitor-fileira inferior">
                  {vagasComVisibilidade.slice(metade).map(renderizarVaga)}
                </div>
              </div>
            </div>
          </section>

          <aside className="card monitor-detalhes" aria-live="polite">
            {selecionada ? (
              <>
                <div className="monitor-detalhes-topo">
                  <span>Vaga selecionada</span>
                  <strong>{String(selecionada.numero).padStart(2, "0")}</strong>
                </div>
                <span className={`monitor-estado-destaque ${statusDaVaga(selecionada)}`}>
                  {rotuloStatus(statusDaVaga(selecionada))}
                </span>
                <dl>
                  <div><dt>Placa</dt><dd>{selecionada.placa || "Não informada"}</dd></div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{selecionada.especial?.rotulo || "Comum"}</dd>
                  </div>
                  <div>
                    <dt>Origem</dt>
                    <dd>{selecionada.estadia ? "Reserva pelo aplicativo" : selecionada.ocupada ? "Sensor ou controle local" : "—"}</dd>
                  </div>
                  {selecionada.estadia && (
                    <>
                      <div>
                        <dt>Tempo</dt>
                        <dd>{formatarDuracaoAoVivo(agora - Number(selecionada.estadia.inicio || agora))}</dd>
                      </div>
                      <div>
                        <dt>Valor atual</dt>
                        <dd>{formatarMoeda(minutosIniciados(selecionada.estadia.inicio, agora) * Number(selecionada.estadia.tarifaMinuto || 0))}</dd>
                      </div>
                      <div>
                        <dt>Pagamento</dt>
                        <dd>{selecionada.estadia.modoPagamento === "agora" ? "Primeiro minuto antecipado" : "Cobrança na saída"}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setVagaSelecionada(null)}>
                  Fechar detalhes
                </button>
              </>
            ) : (
              <div className="monitor-detalhes-vazio">
                <span className="monitor-detalhes-icone" aria-hidden="true">P</span>
                <h2>Detalhes da vaga</h2>
                <p>Clique em qualquer vaga do mapa para conferir placa, origem e tempo de permanência.</p>
                <div className="monitor-ocupacao-barra" aria-label={`${resumo.ocupacao}% das vagas em uso`}>
                  <span style={{ width: `${resumo.ocupacao}%` }} />
                </div>
                <strong>{resumo.ocupacao}% em uso agora</strong>
              </div>
            )}
          </aside>
        </div>
      )}

      {!loading && (
        <section className="card monitor-veiculos">
          <div className="card-head-row">
            <div>
              <h2>Veículos e reservas agora</h2>
              <p>Lista rápida para conferência do guarda.</p>
            </div>
            <span className="status-pill success">{resumo.ocupadas + resumo.reservadas} em uso</span>
          </div>
          {vagas.filter((vaga) => vaga.ocupada || vaga.reservada).length === 0 ? (
            <p className="empty-state">O estacionamento está vazio neste momento.</p>
          ) : (
            <div className="monitor-veiculos-lista">
              {vagas
                .filter((vaga) => vaga.ocupada || vaga.reservada)
                .map((vaga) => (
                  <button type="button" key={vaga.id} onClick={() => setVagaSelecionada(vaga.id)}>
                    <strong>Vaga {String(vaga.numero).padStart(2, "0")}</strong>
                    <span className="placa-tag placa-tag-sm">{vaga.placa || "SEM PLACA"}</span>
                    <span>{vaga.reservada ? "Reserva no aplicativo" : "Ocupação detectada"}</span>
                    <b>{vaga.estadia ? formatarDuracaoAoVivo(agora - Number(vaga.estadia.inicio || agora)) : "Ver detalhes"}</b>
                  </button>
                ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
