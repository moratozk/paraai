import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useVagasPublicas } from "../hooks/useParkingData";
import { VAGAS_ESPECIAIS } from "../utils/mapaVagas";

export default function MapaVagasPublico({ estacionamento, rota, onFechar }) {
  const { vagas, loading, erro } = useVagasPublicas(
    estacionamento.id,
    estacionamento.numVagas
  );
  const [vagaSelecionada, setVagaSelecionada] = useState(null);

  const metade = Math.ceil(vagas.length / 2);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function fecharComEsc(event) {
      if (event.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", fecharComEsc);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEsc);
    };
  }, [onFechar]);

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

  return createPortal(
    <div className="mapa-publico-overlay" role="presentation" onMouseDown={onFechar}>
      <section
        className="mapa-publico-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapa-publico-titulo"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mapa-publico-modal-header">
          <div>
            <span className="marketplace-sobrelinha">Mapa do estacionamento</span>
            <h2 id="mapa-publico-titulo">{estacionamento.nome}</h2>
            <p>{estacionamento.endereco}</p>
          </div>
          <button
            className="mapa-publico-fechar"
            type="button"
            aria-label="Fechar mapa de vagas"
            onClick={onFechar}
            autoFocus
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="mapa-publico-carregando">Carregando mapa de vagas…</p>
        ) : erro ? (
          <p className="error-text mapa-publico-carregando">{erro}</p>
        ) : (
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

            <div className="mapa-publico-patio">
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
            </div>

            <footer className="mapa-publico-rodape">
              <p className="mapa-publico-aviso">
                A vaga escolhida orienta sua chegada. A ocupação é confirmada
                quando você informa a placa no acesso.
              </p>
              {rota && vagaSelecionada && (
                <a
                  className="btn btn-primary"
                  href={rota}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir para a vaga {String(vagaSelecionada).padStart(2, "0")}
                </a>
              )}
            </footer>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
