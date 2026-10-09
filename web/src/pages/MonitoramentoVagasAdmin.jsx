import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  useEstacionamento,
  useVagas,
  useVagasPublicas,
} from "../hooks/useParkingData";
import { formatarDataHora, formatarDuracaoAoVivo } from "../utils/format";
import { dadosDaCor, descreverVeiculo } from "../utils/veiculo";
import { atualizarTipoVagaAdmin } from "../services/estacionamentos";
import {
  combinarVagasAdmin,
  obterTipoVaga,
  resumirVagas,
  TIPOS_VAGA_EDITAVEIS,
} from "../utils/mapaVagas";
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

function horaCurta(segundos) {
  return new Date(segundos * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MonitoramentoVagasAdmin() {
  const { estId: rotaEstId } = useParams();
  const { userData } = useAuth();
  const toast = useToast();
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
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [vagaSelecionada, setVagaSelecionada] = useState(null);
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  const [telaCheiaNativa, setTelaCheiaNativa] = useState(false);
  const [telaCheiaAlternativa, setTelaCheiaAlternativa] = useState(false);
  const [tipoEmEdicao, setTipoEmEdicao] = useState("comum");
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const [erroTipo, setErroTipo] = useState("");
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

  const vagas = useMemo(
    () => combinarVagasAdmin(vagasOperacionais, vagasPublicas),
    [vagasOperacionais, vagasPublicas]
  );
  const resumo = useMemo(() => resumirVagas(vagas), [vagas]);

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
    loadingEstacionamento || loadingOperacional || loadingPublico;
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

  function selecionarVaga(vaga) {
    setVagaSelecionada(vaga.id);
    setTipoEmEdicao(vaga.tipo || "comum");
    setErroTipo("");
  }

  async function salvarTipoVaga(event) {
    event.preventDefault();
    if (!selecionada) return;
    setSalvandoTipo(true);
    setErroTipo("");
    try {
      await atualizarTipoVagaAdmin({
        estId,
        numero: selecionada.numero,
        tipo: tipoEmEdicao,
      });
      const classificacao = obterTipoVaga(tipoEmEdicao, selecionada.numero);
      toast.sucesso(
        `Vaga ${String(selecionada.numero).padStart(2, "0")} alterada para ${classificacao.rotulo}.`
      );
    } catch (err) {
      setErroTipo(err.message || "Não foi possível alterar o tipo da vaga.");
    } finally {
      setSalvandoTipo(false);
    }
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
        onClick={() => vaga.visivel && selecionarVaga(vaga)}
        disabled={!vaga.visivel}
        aria-label={`Vaga ${vaga.numero}, ${rotuloStatus(status)}${
          vaga.placa ? `, placa ${vaga.placa}` : ""
        }${descreverVeiculo(vaga) ? `, ${descreverVeiculo(vaga)}` : ""}${
          vaga.especial ? `, destinada a ${vaga.especial.rotulo}` : ""
        }`}
      >
        <span className="monitor-vaga-topo">
          <strong>{String(vaga.numero).padStart(2, "0")}</strong>
          {vaga.especial && <span title={vaga.especial.rotulo}>{vaga.especial.icone}</span>}
        </span>
        <span className="monitor-vaga-estado">{rotuloStatus(status)}</span>
        {/* Só a placa: "Disponível" repetia "Livre" e o tipo já está no selo. */}
        {vaga.placa && <span className="monitor-vaga-placa">{vaga.placa}</span>}
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

      {erroVagasPublicas && (
        <p className="error-text" role="alert">{erroVagasPublicas}</p>
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
                {!mapaEmTelaCheia && (
                  <Link className="btn btn-outline btn-sm" to={`/admin/estacionamentos/${estId}/maquete`}>
                    Ver maquete
                  </Link>
                )}
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
              <span><i className="pcd" />PCD</span>
              <span><i className="idoso" />60+</span>
              <span><i className="gestante" />Gestante</span>
            </div>
            {/* Com filtro, as vagas de fora ficam desativadas e o mapa pode
                ficar sem nada focável: o próprio mapa recebe o foco para o
                teclado conseguir rolá-lo no celular. */}
            <div
              className="monitor-mapa-scroll"
              tabIndex={0}
              role="region"
              aria-label="Mapa das vagas"
            >
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
                  {selecionada.ocupada && (
                    <div>
                      <dt>Veículo</dt>
                      <dd>
                        {dadosDaCor(selecionada.cor) ? (
                          <span className="cor-do-veiculo">
                            <i style={{ "--amostra": dadosDaCor(selecionada.cor).amostra }} aria-hidden="true" />
                            {descreverVeiculo(selecionada)}
                          </span>
                        ) : (
                          descreverVeiculo(selecionada) || "Não informado"
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Tipo</dt>
                    <dd>{selecionada.especial?.rotulo || "Comum"}</dd>
                  </div>
                  <div>
                    <dt>Origem</dt>
                    <dd>
                      {selecionada.ocupada
                        ? "Entrada registrada no totem"
                        : selecionada.reservada
                          ? "Reserva pelo aplicativo"
                          : "—"}
                    </dd>
                  </div>
                  {selecionada.reservada && (
                    <div>
                      <dt>Reserva</dt>
                      <dd>
                        até {horaCurta(selecionada.reservadaAte)} (faltam{" "}
                        {formatarDuracaoAoVivo(Math.max(0, selecionada.reservadaAte - agora))})
                      </dd>
                    </div>
                  )}
                </dl>
                <form className="monitor-tipo-editor" onSubmit={salvarTipoVaga}>
                  <fieldset disabled={salvandoTipo}>
                    <legend>Classificação da vaga</legend>
                    <div className="monitor-tipos-grid">
                      {TIPOS_VAGA_EDITAVEIS.map((tipo) => (
                        <label
                          key={tipo.tipo}
                          className={`${tipo.tipo} ${
                            tipoEmEdicao === tipo.tipo ? "selecionado" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name={`tipo-vaga-${selecionada.id}`}
                            value={tipo.tipo}
                            checked={tipoEmEdicao === tipo.tipo}
                            onChange={() => {
                              setTipoEmEdicao(tipo.tipo);
                              setErroTipo("");
                            }}
                          />
                          <span aria-hidden="true">{tipo.icone}</span>
                          <strong>{tipo.rotulo}</strong>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {erroTipo && <p className="error-text">{erroTipo}</p>}
                  <button
                    className="btn btn-primary btn-sm btn-block"
                    type="submit"
                    disabled={salvandoTipo || tipoEmEdicao === selecionada.tipo}
                  >
                    {salvandoTipo ? "Salvando…" : "Salvar tipo da vaga"}
                  </button>
                  <p>A cor será atualizada nos mapas administrativo e público.</p>
                </form>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setVagaSelecionada(null)}>
                  Fechar detalhes
                </button>
              </>
            ) : (
              <div className="monitor-detalhes-vazio">
                <span className="monitor-detalhes-icone" aria-hidden="true">P</span>
                <h2>Detalhes da vaga</h2>
                <p>Toque ou clique em uma vaga do mapa para ver placa, origem e tempo de permanência.</p>
                {/* A frase logo abaixo já diz o número; a barra é só desenho. */}
                <div className="monitor-ocupacao-barra" aria-hidden="true">
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
                  <button type="button" key={vaga.id} onClick={() => selecionarVaga(vaga)}>
                    <strong>Vaga {String(vaga.numero).padStart(2, "0")}</strong>
                    <span className="placa-tag placa-tag-sm">{vaga.placa || "SEM PLACA"}</span>
                    {/* Vaga ocupada sempre veio do totem: no lugar disso, o carro. */}
                    <span>
                      {vaga.reservada
                        ? "Reserva no aplicativo"
                        : descreverVeiculo(vaga) || "Entrada pelo totem"}
                    </span>
                    <b>
                      {vaga.reservada
                        ? `até ${horaCurta(vaga.reservadaAte)}`
                        : "Ver detalhes"}
                    </b>
                  </button>
                ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
