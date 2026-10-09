import { useCallback, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEstacionamento, useVagas, useVagasPublicas } from "../hooks/useParkingData";
import { useTelaCheia } from "../hooks/useTelaCheia";
import { combinarVagasAdmin, resumirVagas } from "../utils/mapaVagas";
import Maquete from "../components/maquete/Maquete";
import "./Pages.css";
import "./MaqueteVirtual.css";

// Maquete virtual do pátio, para acompanhar (e apresentar) as entradas e
// saídas registradas no totem. Mesmos dados e mesma permissão do mapa de
// vagas do administrador; só leitura.

const MOVIMENTOS_NA_LISTA = 8;
const dois = (n) => String(n).padStart(2, "0");

function horaDoMovimento(quando) {
  return new Date(quando).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function MaqueteVirtual() {
  const { estId: rotaEstId } = useParams();
  const { userData } = useAuth();
  const admin = userData?.role === "admin";
  const estId = admin ? rotaEstId : null;
  const { estacionamento, online, loading: carregandoLocal } = useEstacionamento(estId);
  const { vagas: operacionais, loading: carregandoOcupacao } = useVagas(
    estId,
    estacionamento?.numVagas
  );
  const {
    vagas: publicas,
    loading: carregandoReservas,
    erro: erroReservas,
  } = useVagasPublicas(estId, estacionamento?.numVagas);

  const vagas = useMemo(() => combinarVagasAdmin(operacionais, publicas), [operacionais, publicas]);
  const resumo = useMemo(() => resumirVagas(vagas), [vagas]);
  const [movimentos, setMovimentos] = useState([]);
  const palcoRef = useRef(null);
  const { ativa: telaCheia, alternativa, alternar } = useTelaCheia(palcoRef);

  const registrarMovimento = useCallback((movimento) => {
    setMovimentos((lista) =>
      [
        { ...movimento, id: `${movimento.quando}-${movimento.tipo}-${movimento.numero}` },
        ...lista,
      ].slice(0, MOVIMENTOS_NA_LISTA)
    );
  }, []);

  const carregando = carregandoLocal || carregandoOcupacao || carregandoReservas;
  const mapaDeVagas = `/admin/estacionamentos/${rotaEstId}/vagas`;

  if (!admin) return <Navigate to="/dashboard" replace />;

  if (!carregandoLocal && !estacionamento) {
    return (
      <main className="page container maquete-pagina">
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

  return (
    <main className="page container maquete-pagina">
      <Link className="maquete-voltar" to={mapaDeVagas}>
        <span aria-hidden="true">←</span> Mapa de vagas
      </Link>

      <header className="maquete-cabecalho">
        <div>
          <span className="maquete-sobrelinha">Maquete virtual</span>
          <h1>{estacionamento?.nome || "Estacionamento"}</h1>
          <p>Os carros entram e saem da maquete conforme os registros feitos no totem.</p>
        </div>
        <div className="maquete-status">
          <span className="live-dot">
            <span className="status-dot online pulsa" /> DADOS AO VIVO
          </span>
          <span className={`maquete-equipamento ${online ? "online" : "offline"}`}>
            Equipamento {online ? "online" : "sem sinal recente"}
          </span>
        </div>
      </header>

      {erroReservas && (
        <p className="error-text" role="alert">{erroReservas}</p>
      )}

      <section
        ref={palcoRef}
        className={`card maquete-palco ${alternativa ? "expandido" : ""}`}
        aria-label="Maquete do pátio"
      >
        <div className="maquete-palco-topo">
          <ul className="maquete-contagem" aria-label="Situação das vagas">
            <li className="livres"><strong>{resumo.livres}</strong> livres</li>
            <li className="ocupadas"><strong>{resumo.ocupadas}</strong> ocupadas</li>
            <li className="reservadas"><strong>{resumo.reservadas}</strong> reservadas</li>
          </ul>
          <div className="maquete-acoes">
            {telaCheia && <span>Pressione Esc para sair</span>}
            <button
              className="btn btn-outline btn-sm"
              type="button"
              aria-pressed={telaCheia}
              onClick={alternar}
            >
              <span aria-hidden="true">{telaCheia ? "↙" : "⛶"}</span>
              {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </div>
        </div>

        {carregando ? (
          <div className="maquete-carregando" role="status">
            <span className="spinner" aria-hidden="true" />
            Montando a maquete…
          </div>
        ) : (
          <div className="maquete-conteudo">
            <Maquete
              vagas={vagas}
              online={online}
              telaCheia={telaCheia}
              aoMovimentar={registrarMovimento}
            />
            <aside className="maquete-movimentos" aria-labelledby="maquete-movimentos-titulo">
              <h2 id="maquete-movimentos-titulo">Últimos movimentos</h2>
              {movimentos.length === 0 ? (
                <p>
                  Assim que o totem registrar uma entrada ou saída, o carro anda na maquete e o
                  registro aparece aqui.
                </p>
              ) : (
                <ol aria-live="polite">
                  {movimentos.map((m) => (
                    <li key={m.id} className={`maquete-movimento ${m.tipo}`}>
                      <time dateTime={new Date(m.quando).toISOString()}>
                        {horaDoMovimento(m.quando)}
                      </time>
                      <span className="placa-tag placa-tag-sm">{m.placa || "SEM PLACA"}</span>
                      <span>
                        {m.tipo === "entrada" ? "entrou na vaga" : "saiu da vaga"} {dois(m.numero)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
