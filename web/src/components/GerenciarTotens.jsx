import { useState } from "react";
import { useToast } from "../context/ToastContext";
import { criarCredencialTotem, definirTotemAtivo } from "../services/totems";

// Acessos dos totens de um estacionamento: lista, bloqueio e criação de um
// acesso novo. A senha da credencial nova fica só em memória e aparece uma
// única vez. Usado pelo dono no Perfil e pelo administrador no painel da rede;
// quem chama escuta a lista (totens) e passa aqui. Com titulo nulo, o
// cabeçalho mostra só a descrição.
export default function GerenciarTotens({
  estId,
  totens,
  carregando,
  erroLista = "",
  titulo = "Segurança do totem",
  descricao = "Cada equipamento usa um acesso exclusivo e pode ser bloqueado sem afetar sua conta de operador.",
  Titulo = "h2",
}) {
  const toast = useToast();
  const [gerando, setGerando] = useState(false);
  const [credencial, setCredencial] = useState(null);
  const [erro, setErro] = useState("");
  const ativos = totens.filter((item) => item.ativo).length;

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
      setErro("Não foi possível alterar o equipamento.");
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

      {credencial && (
        <div className="totem-credential" role="status">
          <strong>Copie agora — a senha não será exibida novamente</strong>
          <div className="totem-credential-row">
            <span>E-mail do dispositivo</span>
            <code>{credencial.email}</code>
          </div>
          <div className="totem-credential-row">
            <span>Senha do dispositivo</span>
            <code>{credencial.senha}</code>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={copiar}>
            Copiar configuração
          </button>
        </div>
      )}

      {carregando ? (
        <p className="empty-state">Consultando equipamentos...</p>
      ) : totens.length === 0 ? (
        <p className="empty-state">Nenhum equipamento seguro foi vinculado ainda.</p>
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
                className={`btn btn-sm ${totem.ativo ? "btn-ghost" : "btn-outline"}`}
                onClick={() => alternar(totem)}
              >
                {totem.ativo ? "Bloquear" : "Reativar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-primary" onClick={gerar} disabled={gerando}>
        {gerando ? "Gerando acesso..." : "Gerar novo acesso de totem"}
      </button>
    </>
  );
}
