import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  corrigirPedido,
  desistirDoPedido,
  enviarPedido,
  LIMITE_MENSAGEM,
  observarPedido,
  problemaNoPedido,
} from "../services/pedidos";
import { buscarCep, cepCompleto, formatarCep, montarEnderecoLinha } from "../services/cep";
import { formatarMoeda, telefoneValido } from "../utils/format";
import "./Pages.css";
import "./PainelPedido.css";

// Painel de quem pediu para pôr um estacionamento na rede (conta
// "candidato"): acompanha o pedido, corrige, reenvia se foi recusado ou
// desiste. Com a aprovação, a conta vira dona e o Dashboard troca sozinho
// para o painel do estacionamento (PainelOperador).

// "11/10/2026 às 14:30". Logo depois de gravar, o horário do servidor ainda
// não voltou: "agora".
function quando(carimbo) {
  const ms = carimbo?.toMillis?.();
  if (!ms) return "agora";
  const data = new Date(ms);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `em ${data.toLocaleDateString("pt-BR")} às ${hora}`;
}

function tarifaParaCampo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2).replace(".", ",") : "";
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function IconeX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
         strokeLinecap="round" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

// As três etapas do pedido, da mais antiga para a mais nova.
function TrilhaDoPedido({ pedido }) {
  const recusado = pedido.status === "recusado";
  const passos = [
    {
      classe: "feito",
      marca: <IconeCheck />,
      titulo: "Pedido enviado",
      texto: `Enviado ${quando(pedido.atualizadoEm || pedido.criadoEm)}`,
    },
    recusado
      ? {
          classe: "recusado",
          marca: <IconeX />,
          titulo: "Não aprovado",
          texto: `Respondido ${quando(pedido.analisadoEm)}`,
        }
      : {
          classe: "atual",
          marca: "2",
          titulo: "Análise da equipe",
          texto: "A equipe do ParaAí confere os dados",
        },
    {
      classe: "",
      marca: "3",
      titulo: "Painel do estacionamento",
      texto: "Liberado assim que o pedido for aprovado",
    },
  ];

  return (
    <ol className="pedido-trilha">
      {passos.map((passo) => (
        <li
          key={passo.titulo}
          className={`pedido-passo ${passo.classe}`}
          aria-current={passo.classe === "atual" ? "step" : undefined}
        >
          <span className="pedido-marca">{passo.marca}</span>
          <strong>{passo.titulo}</strong>
          <span>{passo.texto}</span>
        </li>
      ))}
    </ol>
  );
}

function FormPedido({ inicial, contato, rotuloEnviar, onEnviar, onCancelar }) {
  const [nomeEstacionamento, setNomeEstacionamento] = useState(inicial?.nomeEstacionamento || "");
  const [cep, setCep] = useState(inicial?.cep || "");
  const [endereco, setEndereco] = useState(
    inicial
      ? {
          logradouro: inicial.logradouro || "",
          bairro: inicial.bairro || "",
          cidade: inicial.cidade || "",
          uf: inicial.uf || "",
        }
      : null
  );
  const [numero, setNumero] = useState(inicial?.numero || "");
  const [numVagas, setNumVagas] = useState(inicial?.numVagas ? String(inicial.numVagas) : "");
  const [tarifa, setTarifa] = useState(inicial ? tarifaParaCampo(inicial.tarifaHora) : "");
  const [mensagem, setMensagem] = useState(inicial?.mensagem || "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function trocarCep(valor) {
    setCep(formatarCep(valor));
    setErroCep("");
    if (!cepCompleto(valor)) {
      setEndereco(null);
      return;
    }
    setBuscandoCep(true);
    try {
      setEndereco(await buscarCep(valor));
    } catch (err) {
      setEndereco(null);
      setErroCep(err.message);
    } finally {
      setBuscandoCep(false);
    }
  }

  async function enviar(event) {
    event.preventDefault();
    setErro("");
    if (!telefoneValido(contato.telefone)) {
      setErro("Cadastre um celular com DDD em Configurações, para a equipe falar com você.");
      return;
    }
    const dados = {
      nome: contato.nome,
      telefone: contato.telefone,
      nomeEstacionamento,
      cep,
      endereco,
      numero,
      numVagas,
      tarifaHora: tarifa,
      mensagem,
    };
    const problema = problemaNoPedido(dados);
    if (problema) {
      setErro(problema);
      return;
    }
    setEnviando(true);
    try {
      await onEnviar(dados);
    } catch (err) {
      console.error("Falha ao enviar o pedido:", err);
      setErro("Não foi possível enviar agora. Confira a internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form className="card pedido-form" onSubmit={enviar}>
      <h2>{inicial ? "Corrigir o pedido" : "Pedido para entrar na rede"}</h2>

      <div className="field">
        <label htmlFor="pedidoNome">Nome do estacionamento</label>
        <input
          id="pedidoNome"
          type="text"
          maxLength={60}
          value={nomeEstacionamento}
          onChange={(e) => setNomeEstacionamento(e.target.value)}
          placeholder="Ex.: Estacionamento Central"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="pedidoCep">CEP</label>
          <div className="input-com-acao">
            <input
              id="pedidoCep"
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={cep}
              onChange={(e) => trocarCep(e.target.value)}
              placeholder="00000-000"
            />
            {buscandoCep && <span className="input-spinner" />}
          </div>
          <span className={`field-hint${erroCep ? " erro" : ""}`}>
            {erroCep || (endereco ? montarEnderecoLinha(endereco) : "Preenche o endereço sozinho")}
          </span>
        </div>
        <div className="field">
          <label htmlFor="pedidoNumero">Número</label>
          <input
            id="pedidoNumero"
            type="text"
            maxLength={10}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="123"
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="pedidoVagas">Quantas vagas?</label>
          <input
            id="pedidoVagas"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={numVagas}
            onChange={(e) => setNumVagas(e.target.value)}
            placeholder="Ex.: 20"
          />
        </div>
        <div className="field">
          <label htmlFor="pedidoTarifa">Preço da hora (R$)</label>
          <input
            id="pedidoTarifa"
            type="text"
            inputMode="decimal"
            value={tarifa}
            onChange={(e) => setTarifa(e.target.value)}
            placeholder="Ex.: 8,00"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="pedidoMensagem">Recado para a equipe (opcional)</label>
        <textarea
          id="pedidoMensagem"
          rows={3}
          maxLength={LIMITE_MENSAGEM}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Ex.: horário de funcionamento, se o pátio é coberto, melhor horário para falar com você."
        />
      </div>

      {erro && <p className="error-text">{erro}</p>}

      <div className="acoes-form">
        <button className="btn btn-primary" type="submit" disabled={enviando || buscandoCep}>
          {enviando ? "Enviando..." : rotuloEnviar}
        </button>
        {onCancelar && (
          <button className="btn btn-outline" type="button" disabled={enviando} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export default function PainelPedido() {
  const { user, userData } = useAuth();
  const toast = useToast();
  const uid = user?.uid || null;
  const [estado, setEstado] = useState({ uid: null, pedido: null, erro: "" });
  const [editando, setEditando] = useState(false);
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false);
  const [desistindo, setDesistindo] = useState(false);

  useEffect(() => {
    if (!uid) return undefined;
    return observarPedido(
      uid,
      (pedido) => setEstado({ uid, pedido, erro: "" }),
      (err) => {
        console.error("Falha ao acompanhar o pedido:", err);
        setEstado({
          uid,
          pedido: null,
          erro: "Não foi possível carregar o seu pedido. Recarregue a página.",
        });
      }
    );
  }, [uid]);

  const carregando = estado.uid !== uid;
  const { pedido } = estado;
  const recusado = pedido?.status === "recusado";
  const contato = {
    nome: userData?.name || user?.displayName || "",
    telefone: userData?.telefone || "",
    email: user?.email || "",
  };
  const primeiroNome = (contato.nome || "").split(" ")[0];

  async function enviar(dados) {
    if (pedido) {
      await corrigirPedido(uid, dados);
      toast.sucesso(recusado ? "Pedido reenviado para a equipe." : "Pedido atualizado.");
    } else {
      await enviarPedido(uid, dados);
      toast.sucesso("Pedido enviado! A equipe do ParaAí vai analisar.");
    }
    setEditando(false);
  }

  async function desistir() {
    setDesistindo(true);
    try {
      await desistirDoPedido(uid);
      setConfirmandoDesistencia(false);
      toast.info("Pedido cancelado. Você pode mandar outro quando quiser.");
    } catch (err) {
      console.error("Falha ao cancelar o pedido:", err);
      toast.erro("Não foi possível cancelar o pedido agora. Tente de novo.");
    } finally {
      setDesistindo(false);
    }
  }

  if (carregando) {
    return (
      <div className="page container">
        <div className="card empty-state">Carregando o seu pedido…</div>
      </div>
    );
  }

  const cabecalho = !pedido
    ? {
        titulo: primeiroNome ? `Olá, ${primeiroNome}` : "Seu estacionamento",
        texto: "Mande o pedido para pôr o seu pátio na rede ParaAí.",
      }
    : recusado
      ? { titulo: "Pedido não aprovado", texto: "Veja o motivo, corrija e reenvie quando quiser." }
      : {
          titulo: "Pedido em análise",
          texto: "Esta página muda sozinha quando a equipe responder.",
        };

  return (
    <div className="page container pedido-pagina">
      <div className="page-header">
        <div>
          <span className="rotulo">Estacionamento na rede</span>
          <h1>{cabecalho.titulo}</h1>
          <p>{cabecalho.texto}</p>
        </div>
      </div>

      {estado.erro && <p className="error-text">{estado.erro}</p>}

      <div className="dashboard-grid">
        <div className="dashboard-col">
          {pedido && (
            <div className="card pedido-status">
              <TrilhaDoPedido pedido={pedido} />
            </div>
          )}

          {/* O motivo fica à vista também durante a correção. */}
          {recusado && (
            <div className="pedido-recusa" role="status">
              <span className="stat-label">Motivo da equipe</span>
              <p>{pedido.motivoRecusa}</p>
              {!editando && (
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setEditando(true)}>
                  Corrigir e reenviar
                </button>
              )}
            </div>
          )}

          {!pedido || editando ? (
            <FormPedido
              key={pedido ? "corrigir" : "novo"}
              inicial={pedido}
              contato={contato}
              rotuloEnviar={!pedido ? "Enviar pedido" : recusado ? "Reenviar pedido" : "Salvar correção"}
              onEnviar={enviar}
              onCancelar={pedido ? () => setEditando(false) : null}
            />
          ) : (
            <article className="card pedido-resumo">
              <span className="stat-label">Seu pedido</span>
              <h2>{pedido.nomeEstacionamento}</h2>
              <p className="pedido-endereco">{montarEnderecoLinha(pedido)}</p>
              <div className="pedido-chips">
                <span className="chip">
                  {pedido.numVagas} {pedido.numVagas === 1 ? "vaga" : "vagas"}
                </span>
                <span className="chip chip-accent">{formatarMoeda(pedido.tarifaHora)}/hora</span>
              </div>
              {pedido.mensagem && (
                <blockquote className="pedido-recado">
                  <span className="stat-label">Seu recado</span>
                  <p>{pedido.mensagem}</p>
                </blockquote>
              )}

              {confirmandoDesistencia ? (
                <div className="pedido-desistencia">
                  <p>
                    Cancelar o pedido do {pedido.nomeEstacionamento}? A equipe deixa de ver
                    os dados, e você pode mandar outro depois.
                  </p>
                  <div className="acoes-form">
                    <button
                      className="btn btn-danger-solido"
                      type="button"
                      disabled={desistindo}
                      onClick={desistir}
                    >
                      {desistindo ? "Cancelando..." : "Cancelar pedido"}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={desistindo}
                      onClick={() => setConfirmandoDesistencia(false)}
                    >
                      Manter pedido
                    </button>
                  </div>
                </div>
              ) : (
                <div className="acoes-form">
                  {!recusado && (
                    <button className="btn btn-outline" type="button" onClick={() => setEditando(true)}>
                      Corrigir dados
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setConfirmandoDesistencia(true)}
                  >
                    Desistir do pedido
                  </button>
                </div>
              )}
            </article>
          )}
        </div>

        <div className="dashboard-col">
          <div className="card pedido-depois">
            <h2>Com o pedido aprovado</h2>
            <ol>
              <li>
                <strong>Seu pátio entra no mapa.</strong> Os motoristas da rede
                veem o preço e as vagas livres antes de sair de casa.
              </li>
              <li>
                <strong>Você ganha o painel.</strong> Vagas ao vivo, entradas,
                saídas e quanto entrou no dia, nesta mesma conta.
              </li>
              <li>
                <strong>O totem é ligado ao seu pátio.</strong> O motorista
                digita a placa na entrada e na saída, sem ticket de papel.
              </li>
            </ol>
          </div>

          {/* O contato que a equipe vê é o do pedido; muda em Configurações e
              vale no próximo envio ou correção. */}
          <div className="card pedido-contato">
            <h2>A equipe fala com você por aqui</h2>
            <dl>
              <div>
                <dt>Nome</dt>
                <dd>{(pedido || contato).nome || "—"}</dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>{(pedido || contato).telefone || "—"}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{(pedido || contato).email || "—"}</dd>
              </div>
            </dl>
            <Link to="/configuracoes" className="link-texto">
              Mudar em Configurações
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
