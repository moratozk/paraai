import { useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import {
  aprovarPedido,
  LIMITE_MOTIVO,
  observarPedidosPendentes,
  recusarPedido,
} from "../services/pedidos";
import { montarEnderecoLinha } from "../services/cep";
import { formatarMoeda } from "../utils/format";
import "./PedidosEstacionamento.css";

// Pedidos de quem quer pôr um estacionamento na rede, no painel da rede.
// Só aparece quando há pedido esperando resposta. Aprovar cria o pátio no
// nome de quem pediu (já publicado) e libera o painel de dono na conta dela;
// recusar pede o motivo, que a pessoa vê para corrigir e reenviar.

function dataDoPedido(pedido) {
  const ms = pedido.atualizadoEm?.toMillis?.() || pedido.criadoEm?.toMillis?.();
  return ms ? new Date(ms).toLocaleDateString("pt-BR") : "hoje";
}

function linkDoWhatsApp(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  return digitos.length >= 10 ? `https://wa.me/55${digitos}` : null;
}

export default function PedidosEstacionamento({ adminUid }) {
  const toast = useToast();
  const [estado, setEstado] = useState({ carregado: false, itens: [], erro: "" });
  // Um cartão por vez em confirmação: { id, acao: "aprovar" | "recusar" }.
  const [confirmando, setConfirmando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState("");
  const [processando, setProcessando] = useState(null);

  useEffect(
    () =>
      observarPedidosPendentes(
        (itens) => setEstado({ carregado: true, itens, erro: "" }),
        (err) => {
          console.error("Falha ao carregar os pedidos de estacionamento:", err);
          setEstado({
            carregado: true,
            itens: [],
            erro: "Não foi possível carregar os pedidos de estacionamento.",
          });
        }
      ),
    []
  );

  function abrir(id, acao) {
    setConfirmando({ id, acao });
    setMotivo("");
    setErroMotivo("");
  }

  async function aprovar(pedido) {
    setProcessando(pedido.id);
    try {
      await aprovarPedido(adminUid, pedido);
      setConfirmando(null);
      toast.sucesso(`${pedido.nomeEstacionamento} entrou na rede e já aparece no mapa.`);
    } catch (err) {
      console.error("Falha ao aprovar o pedido:", err);
      toast.erro("Não foi possível aprovar agora. Tente de novo.");
    } finally {
      setProcessando(null);
    }
  }

  async function recusar(event, pedido) {
    event.preventDefault();
    setErroMotivo("");
    setProcessando(pedido.id);
    try {
      await recusarPedido(pedido.id, motivo);
      setConfirmando(null);
      toast.info(`Pedido do ${pedido.nomeEstacionamento} recusado. A pessoa vê o motivo.`);
    } catch (err) {
      if (!err?.code) {
        setErroMotivo(err.message);
      } else {
        console.error("Falha ao recusar o pedido:", err);
        setErroMotivo("Não foi possível recusar agora. Tente de novo.");
      }
    } finally {
      setProcessando(null);
    }
  }

  if (!estado.carregado) return null;
  if (estado.erro) return <p className="error-text">{estado.erro}</p>;
  if (estado.itens.length === 0) return null;

  const total = estado.itens.length;

  return (
    <section className="pedidos-rede" aria-labelledby="pedidos-rede-titulo">
      <div className="pedidos-rede-cabeca">
        <h2 className="admin-secao" id="pedidos-rede-titulo">
          Pedidos para entrar na rede
        </h2>
        <span className="status-pill warning">{total} esperando resposta</span>
      </div>

      <div className="pedidos-rede-lista">
        {estado.itens.map((pedido) => {
          const emConfirmacao = confirmando?.id === pedido.id ? confirmando.acao : null;
          const ocupado = processando === pedido.id;
          const whatsapp = linkDoWhatsApp(pedido.telefone);
          return (
            <article className="card admin-estacionamento pedido-rede" key={pedido.id}>
              <div>
                <span className="admin-localidade">
                  {[pedido.cidade, pedido.uf].filter(Boolean).join(" · ")}
                </span>
                <h3>{pedido.nomeEstacionamento}</h3>
                <p className="admin-endereco">{montarEnderecoLinha(pedido)}</p>
              </div>

              <div className="admin-estacionamento-dados">
                <div>
                  <span>Vagas</span>
                  <strong>{pedido.numVagas}</strong>
                </div>
                <div>
                  <span>Preço da hora</span>
                  <strong>{formatarMoeda(pedido.tarifaHora)}</strong>
                </div>
                <div>
                  <span>Pedido em</span>
                  <strong>{dataDoPedido(pedido)}</strong>
                </div>
              </div>

              <div className="pedido-rede-contato">
                <span className="stat-label">Quem pediu</span>
                <strong>{pedido.nome}</strong>
                <div className="pedido-rede-canais">
                  <a className="btn btn-outline btn-sm" href={`mailto:${pedido.email}`}>
                    E-mail
                  </a>
                  {whatsapp && (
                    <a className="btn btn-outline btn-sm" href={whatsapp} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  )}
                  <span className="pedido-rede-telefone">{pedido.telefone}</span>
                </div>
              </div>

              {pedido.mensagem && (
                <blockquote className="pedido-rede-recado">
                  <span className="stat-label">Recado</span>
                  <p>{pedido.mensagem}</p>
                </blockquote>
              )}

              {emConfirmacao === "aprovar" ? (
                <div className="pedido-rede-confirmacao">
                  <p>
                    Cria o {pedido.nomeEstacionamento} no nome de {pedido.nome}, publica no
                    mapa dos motoristas e libera o painel de dono nessa conta.
                  </p>
                  <div className="acoes-form">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={ocupado}
                      onClick={() => aprovar(pedido)}
                    >
                      {ocupado ? "Aprovando..." : "Confirmar aprovação"}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={ocupado}
                      onClick={() => setConfirmando(null)}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : emConfirmacao === "recusar" ? (
                <form className="pedido-rede-confirmacao" onSubmit={(e) => recusar(e, pedido)}>
                  <div className="field">
                    <label htmlFor={`motivo-${pedido.id}`}>Motivo da recusa</label>
                    <textarea
                      id={`motivo-${pedido.id}`}
                      rows={3}
                      maxLength={LIMITE_MOTIVO}
                      autoFocus
                      value={motivo}
                      onChange={(e) => {
                        setMotivo(e.target.value);
                        setErroMotivo("");
                      }}
                      placeholder="Ex.: o endereço não confere com o CEP. Corrija e reenvie."
                      aria-invalid={erroMotivo ? "true" : undefined}
                      aria-describedby={`motivo-ajuda-${pedido.id}`}
                    />
                    <span
                      className={`field-hint${erroMotivo ? " erro" : ""}`}
                      id={`motivo-ajuda-${pedido.id}`}
                    >
                      {erroMotivo || "Quem pediu vê este texto no painel e pode corrigir e reenviar."}
                    </span>
                  </div>
                  <div className="acoes-form">
                    <button className="btn btn-danger-solido" type="submit" disabled={ocupado}>
                      {ocupado ? "Recusando..." : "Recusar pedido"}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={ocupado}
                      onClick={() => setConfirmando(null)}
                    >
                      Voltar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="acoes-form pedido-rede-acoes">
                  <button className="btn btn-primary" type="button" onClick={() => abrir(pedido.id, "aprovar")}>
                    Aprovar e publicar
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => abrir(pedido.id, "recusar")}>
                    Recusar
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
