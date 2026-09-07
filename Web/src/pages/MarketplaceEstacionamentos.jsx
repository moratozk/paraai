import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCatalogoEstacionamentos } from "../hooks/useParkingData";
import { montarEnderecoLinha } from "../services/cep";
import { formatarMoeda } from "../utils/format";
import { TOTEM_OFFLINE_APOS_SEGUNDOS } from "../utils/constants";
import MapaVagasPublico from "../components/MapaVagasPublico";
import "./Pages.css";
import "./MarketplaceEstacionamentos.css";

const FILTROS = [
  { id: "todos", rotulo: "Todos" },
  { id: "com-vagas", rotulo: "Com vagas agora" },
  { id: "ate-dez", rotulo: "Até R$ 10/h" },
];

function normalizarBusca(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function prepararEstacionamento(item, agora) {
  const ultimaAtualizacao = Number(item.ultimaAtualizacao) || 0;
  const online =
    ultimaAtualizacao > 0 &&
    agora - ultimaAtualizacao < TOTEM_OFFLINE_APOS_SEGUNDOS;
  const disponibilidadePeloMapa = item.modoDisponibilidade === "mapa";
  const leituraVagas = Number(
    disponibilidadePeloMapa ? item.vagasLivresMapeadas : item.vagasLivres
  );
  const temLeitura =
    (disponibilidadePeloMapa || online) &&
    Number.isFinite(leituraVagas) &&
    leituraVagas >= 0;
  const vagasLivres = temLeitura ? leituraVagas : null;
  const tarifaHora = Number(item.tarifaHora);
  const endereco = montarEnderecoLinha(item);
  const pesquisavel = normalizarBusca(
    [item.nome, item.bairro, item.cidade, item.uf, item.cep, endereco].join(" ")
  );

  return {
    ...item,
    online,
    disponibilidadePeloMapa,
    temLeitura,
    vagasLivres,
    disponivel: temLeitura && vagasLivres > 0,
    tarifaHora: Number.isFinite(tarifaHora) ? tarifaHora : 0,
    endereco,
    pesquisavel,
  };
}

export default function MarketplaceEstacionamentos() {
  const { userData } = useAuth();
  const { estacionamentos, loading, erro } = useCatalogoEstacionamentos();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ordem, setOrdem] = useState("relevancia");
  const [mapaAberto, setMapaAberto] = useState(null);
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(
      () => setAgora(Math.floor(Date.now() / 1000)),
      30000
    );
    return () => clearInterval(timer);
  }, []);

  const termo = normalizarBusca(busca);
  const preparados = useMemo(
    () => estacionamentos.map((item) => prepararEstacionamento(item, agora)),
    [estacionamentos, agora]
  );

  const resultados = useMemo(() => {
    const filtrados = preparados.filter((item) => {
      if (termo && !item.pesquisavel.includes(termo)) return false;
      if (filtro === "com-vagas" && !item.disponivel) return false;
      if (filtro === "ate-dez" && item.tarifaHora > 10) return false;
      return true;
    });

    return filtrados.sort((a, b) => {
      if (ordem === "preco") return a.tarifaHora - b.tarifaHora;
      if (ordem === "vagas") return (b.vagasLivres ?? -1) - (a.vagasLivres ?? -1);

      const pontosA = (a.disponivel ? 4 : 0) + (a.online ? 2 : 0);
      const pontosB = (b.disponivel ? 4 : 0) + (b.online ? 2 : 0);
      return pontosB - pontosA || String(a.nome).localeCompare(String(b.nome));
    });
  }, [preparados, termo, filtro, ordem]);

  if (userData?.role === "operador") {
    return <Navigate to="/dashboard" replace />;
  }

  const disponiveisAgora = preparados.filter((item) => item.disponivel).length;

  return (
    <main className="page container marketplace-page">
      <section className="marketplace-hero">
        <div>
          <span className="marketplace-sobrelinha">Rede ParaAí</span>
          <h1>Encontre onde parar</h1>
          <p>
            Compare tarifa e vagas disponíveis antes de sair. Ao chegar, basta
            digitar sua placa para iniciar o acesso.
          </p>
        </div>
        <div className="marketplace-resumo" aria-label="Resumo da rede">
          <strong>{disponiveisAgora}</strong>
          <span>
            {disponiveisAgora === 1
              ? "local com vagas agora"
              : "locais com vagas agora"}
          </span>
        </div>
      </section>

      <section className="marketplace-controles" aria-label="Buscar estacionamentos">
        <label className="marketplace-busca">
          <span className="sr-only">Buscar por nome, bairro ou cidade</span>
          <IconeBusca />
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Busque por nome, bairro, cidade ou CEP"
          />
        </label>

        <div className="marketplace-filtros" role="group" aria-label="Filtros">
          {FILTROS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filtro === item.id ? "ativo" : ""}
              aria-pressed={filtro === item.id}
              onClick={() => setFiltro(item.id)}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        <label className="marketplace-ordem">
          <span>Ordenar por</span>
          <select value={ordem} onChange={(event) => setOrdem(event.target.value)}>
            <option value="relevancia">Disponibilidade</option>
            <option value="preco">Menor tarifa</option>
            <option value="vagas">Mais vagas livres</option>
          </select>
        </label>
      </section>

      {erro && <p className="error-text marketplace-mensagem">{erro}</p>}

      {loading ? (
        <div className="marketplace-carregando" role="status">
          <span className="spinner" aria-hidden="true" />
          Carregando estacionamentos…
        </div>
      ) : resultados.length === 0 ? (
        <div className="card marketplace-vazio">
          <span aria-hidden="true">P</span>
          <h2>Nenhum estacionamento encontrado</h2>
          <p>
            {estacionamentos.length
              ? "Tente mudar a busca ou remover um dos filtros."
              : "Os estacionamentos parceiros aparecerão aqui assim que forem publicados na rede."}
          </p>
          {(busca || filtro !== "todos") && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setBusca("");
                setFiltro("todos");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="marketplace-lista-topo">
            <p>
              <strong>{resultados.length}</strong>{" "}
              {resultados.length === 1
                ? "estacionamento encontrado"
                : "estacionamentos encontrados"}
            </p>
            <span>Disponibilidade atualizada automaticamente</span>
          </div>

          <section className="marketplace-grid" aria-label="Estacionamentos disponíveis">
            {resultados.map((item) => {
              const rota = item.endereco
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.endereco)}`
                : null;
              const classeStatus = item.disponivel
                ? "disponivel"
                : item.temLeitura
                  ? "lotado"
                  : "indisponivel";

              return (
                <article className="card marketplace-card" key={item.id}>
                  <div className="marketplace-card-visual" aria-hidden="true">
                    <span>P</span>
                  </div>

                  <div className="marketplace-card-corpo">
                    <div className="marketplace-card-titulo">
                      <div>
                        <span className="marketplace-localidade">
                          {[item.bairro, item.cidade, item.uf]
                            .filter(Boolean)
                            .join(" · ") || "Rede ParaAí"}
                        </span>
                        <h2>{item.nome || "Estacionamento ParaAí"}</h2>
                      </div>
                      <span className={`marketplace-status ${classeStatus}`}>
                        {item.disponivel
                          ? `${item.vagasLivres} ${item.vagasLivres === 1 ? "vaga" : "vagas"}`
                          : item.temLeitura
                            ? "Lotado"
                            : "Sem leitura"}
                      </span>
                    </div>

                    <p className="marketplace-endereco">
                      {item.endereco || "Endereço aguardando confirmação"}
                    </p>

                    <div className="marketplace-card-dados">
                      <div>
                        <span>Tarifa</span>
                        <strong>
                          {formatarMoeda(item.tarifaHora)}<small>/hora</small>
                        </strong>
                      </div>
                      <div>
                        <span>Capacidade</span>
                        <strong>
                          {Number(item.numVagas) || "—"}<small> vagas</small>
                        </strong>
                      </div>
                    </div>

                    <div className="marketplace-card-acoes">
                      {item.disponibilidadePeloMapa && (
                        <button
                          className="btn btn-primary btn-block"
                          type="button"
                          aria-expanded={mapaAberto === item.id}
                          onClick={() =>
                            setMapaAberto((atual) =>
                              atual === item.id ? null : item.id
                            )
                          }
                        >
                          {mapaAberto === item.id ? "Fechar vagas" : "Ver e escolher vaga"}
                        </button>
                      )}
                      {rota ? (
                        <a
                          className={`btn btn-block ${
                            item.disponibilidadePeloMapa ? "btn-outline" : "btn-primary"
                          }`}
                          href={rota}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Como chegar
                        </a>
                      ) : (
                        <button className="btn btn-outline btn-block" type="button" disabled>
                          Rota indisponível
                        </button>
                      )}
                    </div>
                    {mapaAberto === item.id && item.disponibilidadePeloMapa && (
                      <MapaVagasPublico estacionamento={item} rota={rota} />
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
