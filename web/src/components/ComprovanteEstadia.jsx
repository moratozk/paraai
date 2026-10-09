import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Logo from "./Logo";
import { useFocoNoModal } from "../hooks/useFocoNoModal";
import {
  formatarDataHora,
  formatarDuracao,
  formatarMoeda,
  valorPendente,
  valorRecebido,
} from "../utils/format";
import "./ModalRecarga.css";
import "./ComprovanteEstadia.css";

function tarifaDoRecibo(estadia) {
  const tarifa = Number(estadia.tarifaHora);
  return estadia.tarifaHora === undefined || !Number.isFinite(tarifa)
    ? "—"
    : `${formatarMoeda(tarifa)}/hora`;
}

// Comprovante de uma estadia encerrada, a partir do recibo que o totem grava
// em historico na saída. As regras conferem esse recibo contra a estadia
// (tarifa congelada na entrada, valor pelo tempo exato) e ninguém o altera
// depois. A janela vai direto no body: na impressão, o resto da página some
// e sobra só a folha, que o navegador também salva em PDF.
export default function ComprovanteEstadia({ estadia, estacionamento, aoFechar }) {
  const modalRef = useRef(null);
  const tituloId = useId();
  const [saindo, setSaindo] = useState(false);
  const [emitidoEm] = useState(() => Math.floor(Date.now() / 1000));
  useFocoNoModal(modalRef);

  // Sai pelo mesmo caminho por onde entrou; com movimento reduzido, fecha na hora.
  const fechar = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      aoFechar();
      return;
    }
    setSaindo(true);
    setTimeout(aoFechar, 180);
  }, [aoFechar]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && fechar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar]);

  const pendente = valorPendente(estadia);
  const endereco = [estacionamento?.logradouro, estacionamento?.numero, estacionamento?.bairro]
    .filter(Boolean)
    .join(", ");
  const cidade = [estacionamento?.cidade, estacionamento?.uf].filter(Boolean).join(" · ");

  return createPortal(
    <div className={`modal-overlay comprovante-raiz ${saindo ? "saindo" : ""}`} onClick={fechar}>
      <div
        ref={modalRef}
        className="modal-recarga card comprovante"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-fechar" onClick={fechar} aria-label="Fechar">
          ×
        </button>

        <div className="comprovante-marca">
          <Logo size={30} />
        </div>

        <div className="comprovante-cabecalho">
          <div className="comprovante-situacao">
            <span className="comprovante-eyebrow">Comprovante de estadia</span>
            <span className={`status-pill ${pendente > 0 ? "warning" : "success"}`}>
              {pendente > 0 ? "Pendente" : "Quitada"}
            </span>
          </div>
          <h2 id={tituloId} className="modal-titulo">
            {estacionamento?.nome || "Rede ParaAí"}
          </h2>
          {(endereco || cidade) && (
            <p className="comprovante-endereco">
              {[endereco, cidade].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <dl className="comprovante-linhas">
          <div>
            <dt>Placa</dt>
            <dd>
              <span className="placa-tag placa-tag-sm">{estadia.placa}</span>
            </dd>
          </div>
          <div>
            <dt>Vaga</dt>
            <dd>{estadia.vaga}</dd>
          </div>
          <div>
            <dt>Entrada</dt>
            <dd>{formatarDataHora(estadia.entrada)}</dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>{formatarDataHora(estadia.saida)}</dd>
          </div>
          <div>
            <dt>Permanência</dt>
            <dd>{formatarDuracao(estadia.duracaoMinutos)}</dd>
          </div>
          <div>
            <dt>Tarifa na entrada</dt>
            <dd>{tarifaDoRecibo(estadia)}</dd>
          </div>
        </dl>

        <dl className="comprovante-linhas">
          <div className="comprovante-total">
            <dt>Valor da estadia</dt>
            <dd className="money">{formatarMoeda(estadia.valorCobrado)}</dd>
          </div>
          <div>
            <dt>Debitado da carteira</dt>
            <dd className="money">{formatarMoeda(valorRecebido(estadia))}</dd>
          </div>
          {pendente > 0 && (
            <div className="comprovante-pendente">
              <dt>Pendente, sai da próxima recarga</dt>
              <dd className="money">{formatarMoeda(pendente)}</dd>
            </div>
          )}
        </dl>

        <div className="comprovante-rodape">
          <p>
            Código da estadia <code>{estadia.id}</code>
          </p>
          <p>
            Valor pelo tempo exato entre a entrada e a saída, com a tarifa vigente na
            entrada. Carteira e recargas simuladas para fins acadêmicos, sem valor
            fiscal. Emitido em {formatarDataHora(emitidoEm)}.
          </p>
        </div>

        <div className="modal-acoes comprovante-acoes">
          <button type="button" className="btn btn-outline" onClick={fechar}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Imprimir ou salvar PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
