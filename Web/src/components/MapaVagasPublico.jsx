import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useVagasPublicas } from "../hooks/useParkingData";
import { VAGAS_ESPECIAIS } from "../utils/mapaVagas";
import { formatarMoeda } from "../utils/format";
import {
  iniciarEstadiaApp,
  TARIFA_MINUTO_FATEC,
} from "../services/estadiasApp";

export default function MapaVagasPublico({ estacionamento, rota, motorista, onFechar }) {
  const { vagas, loading, erro } = useVagasPublicas(
    estacionamento.id,
    estacionamento.numVagas
  );
  const [vagaSelecionada, setVagaSelecionada] = useState(null);
  const [etapa, setEtapa] = useState("mapa");
  const [modoPagamento, setModoPagamento] = useState("agora");
  const [processando, setProcessando] = useState(false);
  const [erroPagamento, setErroPagamento] = useState("");
  const [resultado, setResultado] = useState(null);
  const tarifaMinuto =
    Number(estacionamento.tarifaMinuto) || TARIFA_MINUTO_FATEC;

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
        onClick={() => {
          setVagaSelecionada(vaga.numero);
          setErroPagamento("");
          setEtapa("pagamento");
        }}
      >
        <span>{String(vaga.numero).padStart(2, "0")}</span>
        <small>{vaga.ocupada ? "Ocupada" : especial?.icone || "Livre"}</small>
      </button>
    );
  }

  async function confirmarPagamento() {
    setErroPagamento("");
    if (!motorista?.placa) {
      setErroPagamento("Cadastre a placa do veículo antes de escolher uma vaga.");
      return;
    }
    setProcessando(true);
    try {
      const iniciado = await iniciarEstadiaApp({
        uid: motorista.uid,
        placa: motorista.placa,
        estacionamentoId: estacionamento.id,
        vaga: vagaSelecionada,
        modoPagamento,
        tarifaMinuto,
      });
      setResultado(iniciado);
      setEtapa("sucesso");
    } catch (err) {
      setErroPagamento(err.message || "Não foi possível iniciar o estacionamento.");
    } finally {
      setProcessando(false);
    }
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
        ) : etapa === "mapa" ? (
          <div className="mapa-publico" aria-label="Escolha visual de vaga">
            <div className="mapa-publico-topo">
              <div>
                <strong>Escolha uma vaga</strong>
                <span>Como em uma sala de cinema: toque em uma posição livre.</span>
              </div>
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
                Selecione uma vaga livre para continuar ao pagamento.
              </p>
            </footer>
          </div>
        ) : etapa === "pagamento" ? (
          <div className="checkout-vaga">
            <button
              className="checkout-voltar"
              type="button"
              onClick={() => setEtapa("mapa")}
            >
              ← Trocar vaga
            </button>
            <div className="checkout-resumo-topo">
              <div>
                <span>Vaga escolhida</span>
                <strong>{String(vagaSelecionada).padStart(2, "0")}</strong>
              </div>
              <div>
                <span>Tarifa por minuto</span>
                <strong>{formatarMoeda(tarifaMinuto)}</strong>
              </div>
              <div>
                <span>Saldo na carteira</span>
                <strong>{formatarMoeda(motorista?.saldo)}</strong>
              </div>
            </div>

            <div className="checkout-explicacao">
              <strong>Você não precisa escolher o tempo.</strong>
              <p>
                O cronômetro começa ao confirmar. Cada minuto iniciado acrescenta
                {` ${formatarMoeda(tarifaMinuto)}`} e o total é fechado ao
                encerrar a permanência.
              </p>
            </div>

            <fieldset className="checkout-opcoes">
              <legend>Quando deseja pagar?</legend>
              <label className={modoPagamento === "agora" ? "selecionada" : ""}>
                <input
                  type="radio"
                  name="modoPagamento"
                  value="agora"
                  checked={modoPagamento === "agora"}
                  onChange={() => setModoPagamento("agora")}
                />
                <span>
                  <strong>Pagar agora pelo aplicativo</strong>
                  <small>
                    Debita o primeiro minuto agora e o restante ao encerrar.
                  </small>
                </span>
                <b>{formatarMoeda(tarifaMinuto)}</b>
              </label>
              <label className={modoPagamento === "depois" ? "selecionada" : ""}>
                <input
                  type="radio"
                  name="modoPagamento"
                  value="depois"
                  checked={modoPagamento === "depois"}
                  onChange={() => setModoPagamento("depois")}
                />
                <span>
                  <strong>Pagar depois</strong>
                  <small>O valor completo será descontado ao encerrar.</small>
                </span>
                <b>R$ 0,00 agora</b>
              </label>
            </fieldset>

            {!motorista?.placa && (
              <p className="checkout-aviso">
                Cadastre uma placa em Perfil para usar o estacionamento.
              </p>
            )}
            {erroPagamento && <p className="error-text">{erroPagamento}</p>}
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={processando || !motorista?.placa}
              onClick={confirmarPagamento}
            >
              {processando
                ? "Confirmando…"
                : modoPagamento === "agora"
                  ? "Pagar agora e iniciar"
                  : "Iniciar e pagar depois"}
            </button>
            <p className="muted-note">
              Cobrança simulada para demonstração acadêmica, usando o saldo da carteira ParaAí.
            </p>
          </div>
        ) : (
          <div className="checkout-sucesso">
            <span aria-hidden="true">✓</span>
            <h3>Vaga {String(vagaSelecionada).padStart(2, "0")} confirmada</h3>
            <p>
              {resultado?.valorAntecipado > 0
                ? `${formatarMoeda(resultado.valorAntecipado)} foi descontado da carteira. `
                : "Nenhum valor foi descontado agora. "}
              O total continuará aumentando em {formatarMoeda(tarifaMinuto)} por minuto.
            </p>
            <div className="checkout-sucesso-acoes">
              {rota && (
                <a className="btn btn-primary" href={rota} target="_blank" rel="noreferrer">
                  Abrir rota
                </a>
              )}
              <Link className="btn btn-outline" to="/historico" onClick={onFechar}>
                Acompanhar em Meus acessos
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
