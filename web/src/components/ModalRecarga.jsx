import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { adicionarSaldo } from "../services/veiculos";
import { formatarMoeda } from "../utils/format";
import { useFocoNoModal } from "../hooks/useFocoNoModal";
import "./ModalRecarga.css";

const VALORES = [10, 25, 50, 100];

function IconeQr() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18v2M18 14h2" />
    </svg>
  );
}

function IconeCartao() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

// Fluxo de recarga em 3 etapas: valor → pagamento → confirmação.
// ATENÇÃO (TCC): não há cobrança real. O "pagamento" é simulado e o saldo
// é creditado direto no Firestore ao final — o objetivo é demonstrar a
// experiência completa, não integrar um gateway.
export default function ModalRecarga({ placa, saldoAtual, aoFechar, aoConcluir }) {
  const [etapa, setEtapa] = useState("valor"); // valor | pagamento | processando | ok
  const [valor, setValor] = useState(25);
  const [valorLivre, setValorLivre] = useState("");
  const [metodo, setMetodo] = useState("pix");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [erroQr, setErroQr] = useState("");
  const modalRef = useRef(null);
  const [saindo, setSaindo] = useState(false);
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

  // fecha com ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && etapa !== "processando" && fechar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar, etapa]);

  const valorFinal = valorLivre ? Number(valorLivre.replace(",", ".")) : valor;
  const valorValido = valorFinal > 0 && valorFinal <= 1000;
  const valorParaQr = Number.isFinite(valorFinal) ? valorFinal.toFixed(2) : "0.00";
  const codigoDemonstracao = `PARAAI|RECARGA_SIMULADA|PLACA=${placa}|VALOR=${valorParaQr}`;

  useEffect(() => {
    let ativo = true;

    QRCode.toDataURL(codigoDemonstracao, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 180,
      color: { dark: "#05060a", light: "#ffffff" },
    })
      .then((url) => {
        if (ativo) {
          setQrCode(url);
          setErroQr("");
        }
      })
      .catch((err) => {
        console.error("Falha ao gerar QR Code:", err);
        if (ativo) setErroQr("Não foi possível gerar o QR Code da demonstração.");
      });

    return () => {
      ativo = false;
    };
  }, [codigoDemonstracao]);

  async function confirmarPagamento() {
    setErro("");
    setEtapa("processando");
    try {
      // simula o tempo de processamento de um gateway real
      await new Promise((r) => setTimeout(r, 1800));
      await adicionarSaldo(placa, valorFinal);
      setEtapa("ok");
      aoConcluir?.(valorFinal);
    } catch (err) {
      // O detalhe técnico (ex.: permission-denied das regras) fica no
      // console; na tela, só o que o motorista pode fazer.
      console.error("Falha ao creditar saldo:", err);
      setErro(
        !err?.code && err?.message
          ? err.message
          : err?.code === "unavailable"
            ? "Sem conexão com o ParaAí. Confira sua internet e tente de novo."
            : "Não foi possível adicionar o saldo agora. Tente de novo em instantes."
      );
      setEtapa("pagamento");
    }
  }

  async function copiarCodigoDemonstracao() {
    try {
      if (!navigator.clipboard) throw new Error("Área de transferência indisponível");
      await navigator.clipboard.writeText(codigoDemonstracao);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error("Falha ao copiar código da demonstração:", err);
      setErro("Não foi possível copiar o código. Selecione-o e copie manualmente.");
    }
  }

  return (
    <div
      className={`modal-overlay${saindo ? " saindo" : ""}`}
      onClick={() => etapa !== "processando" && fechar()}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-recarga card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar saldo"
      >
        {etapa !== "processando" && etapa !== "ok" && (
          <button className="modal-fechar" onClick={fechar} aria-label="Fechar">
            ×
          </button>
        )}

        {/* trilha de progresso */}
        {etapa !== "ok" && (
          <div className="recarga-passos">
            <span className={`passo ${etapa === "valor" ? "ativo" : "feito"}`}>
              1. Valor
            </span>
            <span className="passo-linha" />
            <span
              className={`passo ${
                etapa === "valor" ? "" : etapa === "pagamento" ? "ativo" : "feito"
              }`}
            >
              2. Pagamento
            </span>
            <span className="passo-linha" />
            <span className="passo">3. Pronto</span>
          </div>
        )}

        {/* ---------- ETAPA 1: VALOR ---------- */}
        {etapa === "valor" && (
          <>
            <h2 className="modal-titulo">Adicionar saldo</h2>
            <p className="modal-sub">
              Saldo atual: <strong>{formatarMoeda(saldoAtual)}</strong> · Placa{" "}
              <span className="placa-tag placa-tag-sm">{placa}</span>
            </p>

            <div className="valores-grid">
              {VALORES.map((v) => (
                <button
                  key={v}
                  className={`valor-op ${!valorLivre && valor === v ? "ativo" : ""}`}
                  onClick={() => {
                    setValor(v);
                    setValorLivre("");
                  }}
                >
                  <span className="valor-cifra">R$</span>
                  <span className="valor-num">{v}</span>
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="valorLivre">Ou digite outro valor</label>
              <input
                id="valorLivre"
                type="text"
                inputMode="decimal"
                value={valorLivre}
                onChange={(e) =>
                  setValorLivre(e.target.value.replace(/[^0-9,.]/g, ""))
                }
                placeholder="Ex.: 35,00"
              />
              {valorLivre && !valorValido && (
                <span className="field-hint erro">
                  Informe um valor entre R$ 0,01 e R$ 1.000,00
                </span>
              )}
            </div>

            <div className="recarga-resumo">
              <span>Total a adicionar</span>
              <strong>{valorValido ? formatarMoeda(valorFinal) : "—"}</strong>
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              disabled={!valorValido}
              onClick={() => setEtapa("pagamento")}
            >
              Continuar
            </button>
          </>
        )}

        {/* ---------- ETAPA 2: PAGAMENTO ---------- */}
        {etapa === "pagamento" && (
          <>
            <h2 className="modal-titulo">Forma de pagamento</h2>
            <p className="modal-sub">
              Adicionando <strong>{formatarMoeda(valorFinal)}</strong> à carteira
            </p>

            {erro && <p className="error-text">{erro}</p>}

            <div className="metodos">
              <button
                className={`metodo ${metodo === "pix" ? "ativo" : ""}`}
                onClick={() => setMetodo("pix")}
              >
                <span className="metodo-icone">
                  <IconeQr />
                </span>
                <span>
                  <strong>PIX</strong>
                  <small>Demonstração com QR escaneável</small>
                </span>
              </button>
              <button
                className={`metodo ${metodo === "cartao" ? "ativo" : ""}`}
                onClick={() => setMetodo("cartao")}
              >
                <span className="metodo-icone">
                  <IconeCartao />
                </span>
                <span>
                  <strong>Cartão de crédito</strong>
                  <small>Em até 1x sem juros</small>
                </span>
              </button>
            </div>

            {metodo === "pix" ? (
              <div className="pix-area">
                <div className="pix-qr">
                  {qrCode ? (
                    <img src={qrCode} alt="QR Code da recarga simulada" />
                  ) : (
                    <span className="qr-carregando">Gerando QR…</span>
                  )}
                </div>
                <div className="pix-codigo">
                  <span className="field-hint">Código da demonstração</span>
                  <code>{codigoDemonstracao}</code>
                  <button
                    className="btn btn-outline btn-sm btn-block"
                    onClick={copiarCodigoDemonstracao}
                  >
                    {copiado ? "✓ Copiado" : "Copiar código"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="cartao-form">
                <div className="field">
                  <label>Número do cartão</label>
                  <input type="text" placeholder="0000 0000 0000 0000" disabled />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Validade</label>
                    <input type="text" placeholder="MM/AA" disabled />
                  </div>
                  <div className="field">
                    <label>CVV</label>
                    <input type="text" placeholder="123" disabled />
                  </div>
                </div>
              </div>
            )}

            <div className="aviso-simulado">
              <strong>Ambiente de demonstração.</strong> O QR Code é escaneável,
              mas não é um PIX de cobrança. Ao confirmar, o saldo é creditado
              automaticamente apenas para fins acadêmicos.
            </div>

            {erroQr && <p className="error-text">{erroQr}</p>}

            <div className="modal-acoes">
              <button className="btn btn-ghost" onClick={() => setEtapa("valor")}>
                Voltar
              </button>
              <button className="btn btn-primary" onClick={confirmarPagamento}>
                {metodo === "pix" ? "Confirmar recarga simulada" : "Simular recarga"}
              </button>
            </div>
          </>
        )}

        {/* ---------- PROCESSANDO ---------- */}
        {etapa === "processando" && (
          <div className="estado-central">
            <div className="spinner-grande" aria-hidden="true" />
            <h2 className="modal-titulo">Confirmando pagamento…</h2>
            <p className="modal-sub">Não feche esta janela.</p>
          </div>
        )}

        {/* ---------- SUCESSO ---------- */}
        {etapa === "ok" && (
          <div className="estado-central">
            <div className="check-sucesso" aria-hidden="true">
              ✓
            </div>
            <h2 className="modal-titulo">Saldo adicionado!</h2>
            <p className="modal-sub">
              <strong className="valor-destaque">
                +{formatarMoeda(valorFinal)}
              </strong>
              <br />
              Novo saldo: {formatarMoeda((Number(saldoAtual) || 0) + valorFinal)}
            </p>
            <button className="btn btn-primary btn-block" onClick={fechar}>
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
