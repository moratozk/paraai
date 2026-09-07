import { useState } from "react";
import { useVagasPublicas } from "../hooks/useParkingData";
import { VAGAS_ESPECIAIS } from "../utils/mapaVagas";

export default function MapaVagasPublico({ estacionamento, rota }) {
  const { vagas, loading, erro } = useVagasPublicas(
    estacionamento.id,
    estacionamento.numVagas
  );
  const [vagaSelecionada, setVagaSelecionada] = useState(null);

  const metade = Math.ceil(vagas.length / 2);

  function renderizarVaga(vaga) {
    const especial = VAGAS_ESPECIAIS[vaga.numero];
    const selecionada = vagaSelecionada === vaga.numero;
    return (
      <button
        key={vaga.id}
        type="button"
        className={`mapa-publico-vaga ${vaga.ocupada ? "ocupada" : "livre"} ${
          especial ? especial.tipo : ""
        } ${selecionada ? "selecionada" : ""}`}
        disabled={vaga.ocupada}
        aria-pressed={selecionada}
        aria-label={`Vaga ${vaga.numero}, ${
          vaga.ocupada ? "ocupada" : "livre"
        }${especial ? `, reservada para ${especial.rotulo}` : ""}`}
        onClick={() => setVagaSelecionada(vaga.numero)}
      >
        <span>{String(vaga.numero).padStart(2, "0")}</span>
        <small>{vaga.ocupada ? "Ocupada" : especial?.icone || "Livre"}</small>
      </button>
    );
  }

  if (loading) {
    return <p className="mapa-publico-carregando">Carregando mapa de vagas…</p>;
  }

  if (erro) {
    return <p className="error-text mapa-publico-carregando">{erro}</p>;
  }

  return (
    <div className="mapa-publico" aria-label="Escolha visual de vaga">
      <div className="mapa-publico-topo">
        <div>
          <strong>Escolha uma vaga</strong>
          <span>Como em uma sala de cinema: toque em uma posição livre.</span>
        </div>
        {vagaSelecionada && (
          <span className="mapa-publico-escolhida">
            Vaga {String(vagaSelecionada).padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="mapa-publico-legenda" aria-label="Legenda das vagas">
        <span><i className="livre" />Livre</span>
        <span><i className="ocupada" />Ocupada</span>
        <span><i className="especial" />Preferencial</span>
      </div>

      <div className="mapa-publico-fileira">
        {vagas.slice(0, metade).map(renderizarVaga)}
      </div>
      <div className="mapa-publico-corredor">
        <span>ENTRADA</span>
        <b>→ circulação →</b>
        <span>SAÍDA</span>
      </div>
      <div className="mapa-publico-fileira">
        {vagas.slice(metade).map(renderizarVaga)}
      </div>

      <p className="mapa-publico-aviso">
        A vaga escolhida orienta sua chegada. A ocupação é confirmada quando
        você informa a placa no acesso.
      </p>
      {rota && vagaSelecionada && (
        <a
          className="btn btn-primary btn-block"
          href={rota}
          target="_blank"
          rel="noreferrer"
        >
          Ir para a vaga {String(vagaSelecionada).padStart(2, "0")}
        </a>
      )}
    </div>
  );
}
