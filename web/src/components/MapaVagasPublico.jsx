import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useReserva, useVagasPublicas } from "../hooks/useParkingData";
import { useFocoNoModal } from "../hooks/useFocoNoModal";
import { obterTipoVaga } from "../utils/mapaVagas";
import { formatarMoeda, saldoEmPendencia } from "../utils/format";
import {
  cancelarReserva,
  DURACAO_RESERVA_S,
  reservaAtiva,
  reservarVaga,
} from "../services/reservas";

function horaCurta(segundos) {
  return new Date(segundos * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function numeroVaga(numero) {
  return String(numero).padStart(2, "0");
}

// Mapa do estacionamento para o motorista. Reservar é gratuito e segura a
// vaga por 30 minutos; ao chegar, o totem usa a vaga reservada e a cobrança
// começa na entrada. Sem reserva, o totem escolhe a vaga.
export default function MapaVagasPublico({ estacionamento, rota, motorista, onFechar }) {
  const { vagas, loading, erro } = useVagasPublicas(
    estacionamento.id,
    estacionamento.numVagas
  );
  const { reserva } = useReserva(motorista?.uid);
  const [vagaSelecionada, setVagaSelecionada] = useState(null);
  const [etapa, setEtapa] = useState("mapa");
  const [processando, setProcessando] = useState(false);
  const [erroReserva, setErroReserva] = useState("");
  const [resultado, setResultado] = useState(null);
  const [saindo, setSaindo] = useState(false);
  const modalRef = useRef(null);
  useFocoNoModal(modalRef);
  const tarifaHora = Number(estacionamento.tarifaHora) || 0;
  const minutosReserva = DURACAO_RESERVA_S / 60;
  const temReserva = reservaAtiva(reserva);

  const metade = Math.ceil(vagas.length / 2);
  const selecionada = vagas.find((vaga) => vaga.numero === vagaSelecionada);
  const tipoSelecionada = selecionada
    ? obterTipoVaga(selecionada.tipo, selecionada.numero)
    : null;
  // Vaga especial só para quem declarou o mesmo direito (as regras do banco
  // conferem o mesmo).
  const especialSelecionada =
    tipoSelecionada && tipoSelecionada.tipo !== "comum" ? tipoSelecionada : null;
  const semDireito =
    Boolean(especialSelecionada) && motorista?.vagaEspecial !== especialSelecionada.tipo;

  // O que impede a reserva, explicado antes do clique.
  const impedimento = !motorista?.placa
    ? "Cadastre a placa do veículo em Perfil para reservar."
    : motorista.estacionado
      ? "Seu veículo já está estacionado. Registre a saída no totem antes de reservar outra vaga."
      : saldoEmPendencia(motorista.saldo)
        ? "Há um saldo pendente. Regularize em Perfil para reservar."
        : semDireito
          ? `Vaga para ${especialSelecionada.rotulo}: só para quem declarou esse direito em Perfil.`
          : temReserva
            ? `Você já reservou a vaga ${numeroVaga(reserva.vaga)} até ${horaCurta(reserva.expiraEm)}. Cancele para escolher outra.`
            : "";

  // Sai pelo mesmo caminho por onde entrou; com movimento reduzido, fecha na hora.
  const fechar = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onFechar();
      return;
    }
    setSaindo(true);
    setTimeout(onFechar, 180);
  }, [onFechar]);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function fecharComEsc(event) {
      if (event.key === "Escape") fechar();
    }
    window.addEventListener("keydown", fecharComEsc);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEsc);
    };
  }, [fechar]);

  function renderizarVaga(vaga) {
    const classificacao = obterTipoVaga(vaga.tipo, vaga.numero);
    const especial = classificacao.tipo === "comum" ? null : classificacao;
    const escolhida = vagaSelecionada === vaga.numero;
    const estado = vaga.ocupadaFisica
      ? "Ocupada"
      : vaga.reservada
        ? "Reservada"
        : !vaga.publicada
          ? "Indisponível"
          : "Livre";
    const classes = [
      "mapa-publico-vaga",
      vaga.ocupadaFisica ? "ocupada" : vaga.reservada ? "reservada" : "livre",
      !vaga.publicada ? "sem-mapa" : "",
      especial ? especial.tipo : "",
      escolhida ? "selecionada" : "",
    ];
    return (
      <button
        key={vaga.id}
        type="button"
        className={classes.filter(Boolean).join(" ")}
        disabled={vaga.ocupada || !vaga.publicada}
        aria-pressed={escolhida}
        aria-label={`Vaga ${vaga.numero}, ${estado.toLowerCase()}${
          especial ? `, para ${especial.rotulo}` : ""
        }`}
        onClick={() => {
          setVagaSelecionada(vaga.numero);
          setErroReserva("");
          setEtapa("reserva");
        }}
      >
        {/* O tipo vai num selo ao lado do número: o estado ("Livre") nunca
            some, nem nas vagas especiais. */}
        <span>
          {numeroVaga(vaga.numero)}
          {especial && (
            <i className="mapa-publico-tipo" aria-hidden="true">
              {especial.icone}
            </i>
          )}
        </span>
        <small>{estado}</small>
      </button>
    );
  }

  async function confirmarReserva() {
    setErroReserva("");
    setProcessando(true);
    try {
      const reservada = await reservarVaga({
        uid: motorista.uid,
        placa: motorista.placa,
        estacionamentoId: estacionamento.id,
        vaga: vagaSelecionada,
      });
      setResultado(reservada);
      setEtapa("sucesso");
    } catch (err) {
      setErroReserva(err.message);
    } finally {
      setProcessando(false);
    }
  }

  async function cancelarAtual() {
    setErroReserva("");
    setProcessando(true);
    try {
      await cancelarReserva({ uid: motorista.uid, reserva });
    } catch (err) {
      setErroReserva(err.message);
    } finally {
      setProcessando(false);
    }
  }

  return createPortal(
    <div
      className={`mapa-publico-overlay${saindo ? " saindo" : ""}`}
      role="presentation"
      onMouseDown={fechar}
    >
      <section
        ref={modalRef}
        tabIndex={-1}
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
            onClick={fechar}
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
                <span>Toque em uma vaga livre para reservar por {minutosReserva} minutos.</span>
              </div>
            </div>

            <div className="mapa-publico-legenda" aria-label="Legenda das vagas">
              <span><i className="livre" />Livre</span>
              <span><i className="reservada" />Reservada</span>
              <span><i className="ocupada" />Ocupada</span>
              <span><i className="pcd" />PCD</span>
              <span><i className="idoso" />60+</span>
              <span><i className="gestante" />Gestante</span>
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
                Reservar é opcional: sem reserva, o totem escolhe a vaga quando você chegar.
              </p>
            </footer>
          </div>
        ) : etapa === "reserva" ? (
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
                <strong>{numeroVaga(vagaSelecionada)}</strong>
              </div>
              <div>
                <span>Tarifa</span>
                <strong>{formatarMoeda(tarifaHora)}/h</strong>
              </div>
              <div>
                <span>Reserva</span>
                <strong>{minutosReserva} min</strong>
              </div>
            </div>

            {especialSelecionada && !semDireito && (
              <p className="checkout-aviso">
                Vaga para {especialSelecionada.rotulo}, conforme o direito declarado no
                seu Perfil.
              </p>
            )}

            <div className="checkout-explicacao">
              <strong>A reserva é gratuita.</strong>
              <p>
                Ela segura a vaga por {minutosReserva} minutos. Ao chegar, digite a
                placa {motorista?.placa || "do veículo"} no totem: ele usa esta vaga e
                a cobrança começa na entrada, a {formatarMoeda(tarifaHora)} por hora.
              </p>
            </div>

            {impedimento && <p className="checkout-aviso">{impedimento}</p>}
            {temReserva && (
              <button
                className="btn btn-outline btn-block"
                type="button"
                disabled={processando}
                onClick={cancelarAtual}
              >
                Cancelar reserva da vaga {numeroVaga(reserva.vaga)}
              </button>
            )}
            {erroReserva && <p className="error-text">{erroReserva}</p>}
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={processando || Boolean(impedimento)}
              onClick={confirmarReserva}
            >
              {processando ? "Reservando…" : `Reservar vaga ${numeroVaga(vagaSelecionada)}`}
            </button>
            <p className="muted-note">
              Projeto acadêmico: a cobrança é simulada com o saldo da carteira ParaAí.
            </p>
          </div>
        ) : (
          <div className="checkout-sucesso">
            <span aria-hidden="true">✓</span>
            <h3>Vaga {numeroVaga(resultado?.vaga ?? vagaSelecionada)} reservada</h3>
            <p>
              Válida até {resultado ? horaCurta(resultado.expiraEm) : "—"}. Ao chegar,
              digite a placa {motorista?.placa} no totem; a cobrança começa na entrada.
            </p>
            <div className="checkout-sucesso-acoes">
              {rota && (
                <a className="btn btn-primary" href={rota} target="_blank" rel="noreferrer">
                  Abrir rota
                </a>
              )}
              <Link className="btn btn-outline" to="/dashboard" onClick={onFechar}>
                Ver no meu painel
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
