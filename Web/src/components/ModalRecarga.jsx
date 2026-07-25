import { useEffect, useState } from "react";
import { adicionarSaldo } from "../services/veiculos";
import { formatarMoeda } from "../utils/format";
import "./ModalRecarga.css";

const VALORES = [10, 25, 50, 100];

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

  // fecha com ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && etapa !== "processando" && aoFechar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aoFechar, etapa]);

  const valorFinal = valorLivre ? Number(valorLivre.replace(",", ".")) : valor;
  const valorValido = valorFinal > 0 && valorFinal <= 1000;

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
      console.error("Falha ao creditar saldo:", err);
      setErro(
        `${err?.code || ""}`.includes("permission")
          ? "O banco recusou a escrita. Verifique as regras do Firestore."
          : err.message || "Não foi possível concluir a recarga."
      );
      setEtapa("pagamento");
    }
  }

  // código PIX fictício, só para a demonstração visual
  const codigoPix = `00020126580014BR.GOV.BCB.PIX0136paraai-${placa}-${valorFinal}5204000053039865802BR5910PARAAI TCC6009SAO PAULO62070503***6304DEMO`;

  return (
    <div className="modal-overlay" onClick={() => etapa !== "processando" && aoFechar()}>
      <div
        className="modal-recarga card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar saldo"
      >
        {etapa !== "processando" && etapa !== "ok" && (
          <button className="modal-fechar" onClick={aoFechar} aria-label="Fechar">
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
                <span className="metodo-icone">⚡</span>
                <span>
                  <strong>PIX</strong>
                  <small>Aprovação imediata</small>
                </span>
              </button>
              <button
                className={`metodo ${metodo === "cartao" ? "ativo" : ""}`}
                onClick={() => setMetodo("cartao")}
              >
                <span className="metodo-icone">💳</span>
                <span>
                  <strong>Cartão de crédito</strong>
                  <small>Em até 1x sem juros</small>
                </span>
              </button>
            </div>

            {metodo === "pix" ? (
              <div className="pix-area">
                <div className="pix-qr" aria-hidden="true">
                  <QrFake />
                </div>
                <div className="pix-codigo">
                  <span className="field-hint">PIX copia e cola</span>
                  <code>{codigoPix.slice(0, 42)}…</code>
                  <button
                    className="btn btn-outline btn-sm btn-block"
                    onClick={() => {
                      navigator.clipboard?.writeText(codigoPix);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2000);
                    }}
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
              <strong>Ambiente de demonstração.</strong> Nenhuma cobrança é
              feita — ao confirmar, o saldo é creditado automaticamente para
              fins acadêmicos.
            </div>

            <div className="modal-acoes">
              <button className="btn btn-ghost" onClick={() => setEtapa("valor")}>
                Voltar
              </button>
              <button className="btn btn-primary" onClick={confirmarPagamento}>
                {metodo === "pix" ? "Já paguei" : "Pagar agora"}
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
            <button className="btn btn-primary btn-block" onClick={aoFechar}>
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// QR decorativo (padrão fixo) — apenas ilustrativo para a demonstração
function QrFake() {
  const celulas = [];
  const semente = 0b1011010011100101101;
  for (let i = 0; i < 169; i++) {
    const linha = Math.floor(i / 13);
    const col = i % 13;
    const cantoTL = linha < 3 && col < 3;
    const cantoTR = linha < 3 && col > 9;
    const cantoBL = linha > 9 && col < 3;
    const preto =
      cantoTL || cantoTR || cantoBL
        ? !(linha === 1 && col % 12 === 1)
        : ((semente >> (i % 19)) & 1) === 1 && (i * 7) % 3 !== 0;
    celulas.push(<span key={i} className={preto ? "qr-on" : ""} />);
  }
  return <div className="qr-grid">{celulas}</div>;
}
