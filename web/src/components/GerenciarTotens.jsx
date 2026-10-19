import { useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import {
  cancelarCodigoInstalacao,
  criarCodigoInstalacao,
  criarCredencialTotem,
  definirTotemAtivo,
  observarCodigosInstalacao,
} from "../services/totems";
import { formatarCodigoInstalacao, restanteDoCodigo } from "../utils/codigoInstalacao";

function formatarRestante(ms) {
  const segundos = Math.ceil(ms / 1000);
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

// Totens de um estacionamento: lista, bloqueio e instalação de um totem novo.
// O caminho principal é o código de instalação, digitado na tela do totem; o
// acesso com e-mail e senha fica como alternativa, e a senha dele aparece uma
// única vez. Usado pelo dono no Perfil e pelo administrador no painel da rede;
// quem chama escuta a lista (totens) e passa aqui. Com titulo nulo, o
// cabeçalho mostra só a descrição.
export default function GerenciarTotens({
  estId,
  nomeEstacionamento = "",
  totens,
  carregando,
  erroLista = "",
  titulo = "Segurança do totem",
  descricao = "Cada totem usa um acesso exclusivo e pode ser bloqueado sem afetar a sua conta.",
  Titulo = "h2",
}) {
  const toast = useToast();
  const [gerando, setGerando] = useState(false);
  const [credencial, setCredencial] = useState(null);
  const [erro, setErro] = useState("");
  const [estadoCodigos, setEstadoCodigos] = useState({ estId: null, itens: [] });
  const [gerandoCodigo, setGerandoCodigo] = useState(false);
  // Código mostrado nesta tela: some quando o totem o usa (ou quando vence).
  const [acompanhado, setAcompanhado] = useState(null);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  const ativos = totens.filter((item) => item.ativo).length;

  useEffect(() => {
    if (!estId) return undefined;
    return observarCodigosInstalacao(
      estId,
      (itens) => {
        const agora = Date.now();
        // Código vencido não serve para nada: sai do banco quando aparece.
        itens
          .filter((item) => restanteDoCodigo(item.criadoEmMs, agora) === 0)
          .forEach((item) => cancelarCodigoInstalacao(item.codigo).catch(() => {}));
        setEstadoCodigos({ estId, itens });
      },
      (falha) => {
        console.error("Falha ao consultar os códigos de instalação:", falha);
        setEstadoCodigos({ estId, itens: [] });
      }
    );
  }, [estId]);

  const codigos = estadoCodigos.estId === estId ? estadoCodigos.itens : [];
  const codigoAtivo =
    codigos
      .filter((item) => restanteDoCodigo(item.criadoEmMs, agoraMs) > 0)
      .sort((a, b) => b.criadoEmMs - a.criadoEmMs)[0] || null;
  const instalado = acompanhado
    ? totens.find((item) => item.codigoInstalacao === acompanhado)
    : null;
  const restante = codigoAtivo ? restanteDoCodigo(codigoAtivo.criadoEmMs, agoraMs) : 0;

  // Contagem regressiva só enquanto há um código na tela.
  const contando = Boolean(codigoAtivo);
  useEffect(() => {
    if (!contando) return undefined;
    const id = setInterval(() => setAgoraMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [contando]);

  async function gerarCodigo() {
    setErro("");
    setGerandoCodigo(true);
    try {
      const codigo = await criarCodigoInstalacao({
        estId,
        nome: totens.length === 0 ? "Totem principal" : `Totem ${totens.length + 1}`,
        nomeEstacionamento,
        anteriores: codigos.map((item) => item.codigo),
      });
      setAgoraMs(Date.now());
      setAcompanhado(codigo);
    } catch (falha) {
      console.error("Falha ao gerar o código de instalação:", falha);
      setErro("Não foi possível gerar o código. Confira a conexão e tente novamente.");
    } finally {
      setGerandoCodigo(false);
    }
  }

  async function cancelarCodigo() {
    if (!codigoAtivo) return;
    setErro("");
    try {
      await cancelarCodigoInstalacao(codigoAtivo.codigo);
      setAcompanhado(null);
    } catch (falha) {
      console.error("Falha ao cancelar o código de instalação:", falha);
      setErro("Não foi possível cancelar o código. Tente novamente.");
    }
  }

  async function gerar() {
    setErro("");
    setCredencial(null);
    setGerando(true);
    try {
      setCredencial(await criarCredencialTotem({ estId }));
      toast.sucesso("Acesso seguro do totem criado.");
    } catch (falha) {
      console.error("Falha ao criar credencial do totem:", falha);
      setErro(
        falha?.code === "auth/operation-not-allowed"
          ? "Ative o provedor E-mail/senha no Firebase Authentication."
          : "Não foi possível criar o acesso do totem. Tente novamente."
      );
    } finally {
      setGerando(false);
    }
  }

  async function alternar(totem) {
    setErro("");
    try {
      await definirTotemAtivo(totem.id, !totem.ativo);
      toast.sucesso(totem.ativo ? "Totem bloqueado." : "Totem reativado.");
    } catch (falha) {
      console.error("Falha ao alterar o totem:", falha);
      setErro("Não foi possível alterar o totem.");
    }
  }

  async function copiar() {
    if (!credencial) return;
    const texto = [
      `#define TOTEM_EMAIL "${credencial.email}"`,
      `#define TOTEM_PASSWORD "${credencial.senha}"`,
      `#define ESTACIONAMENTO_ID "${estId}"`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.sucesso("Credenciais copiadas.");
    } catch (falha) {
      console.error("Falha ao copiar a credencial do totem:", falha);
      setErro("Não foi possível copiar. Selecione o e-mail e a senha e copie manualmente.");
    }
  }

  return (
    <>
      <div className="card-head-row">
        <div>
          {titulo && <Titulo>{titulo}</Titulo>}
          <p className="muted-note" style={{ margin: 0 }}>
            {descricao}
          </p>
        </div>
        <span className={`status-pill ${ativos > 0 ? "success" : "warning"}`}>
          {ativos} {ativos === 1 ? "ativo" : "ativos"}
        </span>
      </div>

      {(erro || erroLista) && <p className="error-text">{erro || erroLista}</p>}

      {instalado ? (
        <div className="totem-instalacao concluida" role="status">
          <strong className="totem-instalacao-titulo">{instalado.nome || "Totem"} instalado</strong>
          <p>Ele já aparece na lista abaixo e está pronto para atender os motoristas.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAcompanhado(null)}>
            Fechar
          </button>
        </div>
      ) : codigoAtivo?.pendente ? (
        <div className="totem-instalacao" role="status" aria-live="polite">
          <span className="totem-instalacao-rotulo">Código de instalação</span>
          <span className="totem-instalacao-prazo">Gerando o código…</span>
        </div>
      ) : codigoAtivo ? (
        <div className="totem-instalacao" role="status" aria-live="polite">
          <span className="totem-instalacao-rotulo">Código de instalação</span>
          <strong className="totem-instalacao-codigo" aria-label={codigoAtivo.codigo.split("").join(" ")}>
            {formatarCodigoInstalacao(codigoAtivo.codigo)}
          </strong>
          <span className="totem-instalacao-prazo">
            Vale por mais {formatarRestante(restante)} e serve para um totem só.
          </span>
          <ol className="totem-instalacao-passos">
            <li>Ligue o totem e conecte o Wi-Fi pela tela dele.</li>
            <li>Quando ele pedir o código de instalação, digite este código.</li>
            <li>Em instantes ele aparece na lista abaixo, pronto para atender.</li>
          </ol>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarCodigo}>
            Cancelar código
          </button>
        </div>
      ) : acompanhado ? (
        <p className="totem-instalacao-aviso" role="status">
          O código não vale mais. Gere outro quando o totem estiver ligado e conectado.
        </p>
      ) : null}

      {carregando ? (
        <p className="empty-state">Consultando os totens…</p>
      ) : totens.length === 0 ? (
        <p className="empty-state">Nenhum totem instalado ainda.</p>
      ) : (
        <div className="totem-list">
          {totens.map((totem) => (
            <div className="totem-list-item" key={totem.id}>
              <div>
                <strong>{totem.nome || "Totem"}</strong>
                <span>
                  {totem.email}
                  {totem.ativo ? "" : " · bloqueado"}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => alternar(totem)}
              >
                {totem.ativo ? "Bloquear" : "Reativar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`btn ${codigoAtivo ? "btn-outline" : "btn-primary"}`}
        onClick={gerarCodigo}
        disabled={gerandoCodigo}
      >
        {gerandoCodigo
          ? "Gerando código..."
          : codigoAtivo
            ? "Gerar outro código"
            : totens.length === 0
              ? "Instalar um totem"
              : "Instalar outro totem"}
      </button>

      <details className="totem-manual">
        <summary>Prefere configurar com e-mail e senha?</summary>
        <div className="totem-manual-conteudo">
          <p className="muted-note">
            Para quem instala o totem pelo computador: um e-mail e uma senha
            exclusivos deste totem, com o ID do estacionamento.
          </p>
          {credencial && (
            <div className="totem-credential" role="status">
              <strong>Copie agora — a senha não será exibida novamente</strong>
              <div className="totem-credential-row">
                <span>E-mail do totem</span>
                <code>{credencial.email}</code>
              </div>
              <div className="totem-credential-row">
                <span>Senha do totem</span>
                <code>{credencial.senha}</code>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={copiar}>
                Copiar configuração
              </button>
            </div>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando acesso..." : "Gerar acesso com e-mail e senha"}
          </button>
        </div>
      </details>
    </>
  );
}
