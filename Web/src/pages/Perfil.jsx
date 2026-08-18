import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useVeiculo, useEstacionamento } from "../hooks/useParkingData";
import { Link } from "react-router-dom";
import { registrarVeiculo } from "../services/veiculos";
import { criarEstacionamento } from "../services/estacionamentos";
import {
  criarCredencialTotem,
  definirTotemAtivo,
  observarTotems,
} from "../services/totems";
import { buscarCep, cepCompleto, formatarCep } from "../services/cep";
import ModalRecarga from "../components/ModalRecarga";
import { normalizarPlaca, placaValida, formatarMoeda } from "../utils/format";
import "./Pages.css";

export default function Perfil() {
  const { user, userData } = useAuth();
  const toast = useToast();
  const role = userData?.role || "motorista";

  const name = userData?.name || user?.displayName || "Usuário";
  const email = user?.email || "";
  const placa = userData?.placa || null;
  const estId = userData?.estacionamentoId || null;

  const { veiculo } = useVeiculo(role === "motorista" ? placa : null);
  const { estacionamento, loading: carregandoEstacionamento } = useEstacionamento(
    role === "operador" ? estId : null
  );

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [placaInput, setPlacaInput] = useState("");
  const [mensagem, setMensagem] = useState(null); // { tipo: "erro"|"ok", texto }
  const [processando, setProcessando] = useState(false);

  // Modal de recarga (fluxo PIX/cartão simulado)
  const [recargaAberta, setRecargaAberta] = useState(false);

  // Promoção motorista -> operador (também é o caminho de recuperação para
  // cadastros de operador que falharam no meio)
  const [estNome, setEstNome] = useState("");
  const [estVagas, setEstVagas] = useState(4);
  const [msgEst, setMsgEst] = useState(null);
  const [estCep, setEstCep] = useState("");
  const [estEndereco, setEstEndereco] = useState(null);
  const [estNumero, setEstNumero] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");

  // Equipamentos vinculados ao estacionamento. A senha de uma credencial
  // nova fica apenas em memória e é mostrada uma única vez ao operador.
  const [totemState, setTotemState] = useState({ estId: null, itens: [] });
  const [gerandoTotem, setGerandoTotem] = useState(false);
  const [credencialTotem, setCredencialTotem] = useState(null);
  const [erroTotem, setErroTotem] = useState("");

  useEffect(() => {
    if (role !== "operador" || !estId) {
      return undefined;
    }

    return observarTotems(
      estId,
      (itens) => {
        setTotemState({ estId, itens });
      },
      (erro) => {
        console.error("Falha ao carregar totens:", erro);
        setErroTotem("Não foi possível consultar os equipamentos vinculados.");
        setTotemState({ estId, itens: [] });
      }
    );
  }, [role, estId]);

  const totems = totemState.estId === estId ? totemState.itens : [];
  const carregandoTotems = Boolean(estId) && totemState.estId !== estId;

  async function handleGerarTotem() {
    setErroTotem("");
    setCredencialTotem(null);
    setGerandoTotem(true);
    try {
      const credencial = await criarCredencialTotem({ estId });
      setCredencialTotem(credencial);
      toast.sucesso("Acesso seguro do totem criado.");
    } catch (erro) {
      console.error("Falha ao criar credencial do totem:", erro);
      setErroTotem(
        erro?.code === "auth/operation-not-allowed"
          ? "Ative o provedor E-mail/senha no Firebase Authentication."
          : "Não foi possível criar o acesso do totem. Tente novamente."
      );
    } finally {
      setGerandoTotem(false);
    }
  }

  async function handleAlternarTotem(totem) {
    setErroTotem("");
    try {
      await definirTotemAtivo(totem.id, !totem.ativo);
      toast.sucesso(totem.ativo ? "Totem bloqueado." : "Totem reativado.");
    } catch (erro) {
      console.error("Falha ao alterar o totem:", erro);
      setErroTotem("Não foi possível alterar o equipamento.");
    }
  }

  async function copiarCredencialTotem() {
    if (!credencialTotem) return;
    const texto = [
      `#define TOTEM_EMAIL "${credencialTotem.email}"`,
      `#define TOTEM_PASSWORD "${credencialTotem.senha}"`,
      `#define ESTACIONAMENTO_ID "${estId}"`,
    ].join("\n");
    await navigator.clipboard.writeText(texto);
    toast.sucesso("Credenciais copiadas.");
  }

  async function handleCepChange(valor) {
    setEstCep(formatarCep(valor));
    setErroCep("");
    if (!cepCompleto(valor)) {
      setEstEndereco(null);
      return;
    }
    setBuscandoCep(true);
    try {
      const dados = await buscarCep(valor);
      setEstEndereco(dados);
    } catch (err) {
      setEstEndereco(null);
      setErroCep(err.message);
    } finally {
      setBuscandoCep(false);
    }
  }

  async function handleCriarEstacionamento(e) {
    e.preventDefault();
    setMsgEst(null);
    if (!estNome.trim()) {
      setMsgEst({ tipo: "erro", texto: "Informe o nome do estacionamento." });
      return;
    }
    if (!estEndereco || !estNumero.trim()) {
      setMsgEst({ tipo: "erro", texto: "Informe o CEP e o número do endereço." });
      return;
    }
    setProcessando(true);
    try {
      await criarEstacionamento({
        uid: user.uid,
        nome: estNome.trim(),
        numVagas: estVagas,
        cep: estCep,
        logradouro: estEndereco.logradouro,
        numero: estNumero.trim(),
        bairro: estEndereco.bairro,
        cidade: estEndereco.cidade,
        uf: estEndereco.uf,
      });
      // o papel troca sozinho via onSnapshot do AuthContext
      toast.sucesso("Estacionamento cadastrado! Seu painel foi atualizado.");
    } catch (err) {
      const texto = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();
      setMsgEst({
        tipo: "erro",
        texto: texto.includes("permission")
          ? "O banco recusou a escrita (permission-denied). Publique as regras do arquivo firestore.rules no Console do Firebase e tente de novo."
          : err.message || "Erro ao cadastrar o estacionamento.",
      });
    } finally {
      setProcessando(false);
    }
  }

  async function handleCadastrarPlaca(e) {
    e.preventDefault();
    setMensagem(null);

    const placaNova = normalizarPlaca(placaInput);
    if (!placaValida(placaNova)) {
      setMensagem({
        tipo: "erro",
        texto:
          "Placa inválida. Aceitamos o padrão antigo (ABC1234) e o Mercosul (ABC1D23).",
      });
      return;
    }

    setProcessando(true);
    try {
      await registrarVeiculo({ uid: user.uid, nome: name, placa: placaNova });
      setPlacaInput("");
      setMensagem({ tipo: "ok", texto: "Veículo cadastrado com sucesso!" });
      toast.sucesso(`Placa ${placaNova} cadastrada!`);
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: err.message || "Erro ao cadastrar o veículo. Tente novamente.",
      });
    } finally {
      setProcessando(false);
    }
  }


  return (
    <div className="page container">
      <div className="page-header">
        <h1>Perfil</h1>
        <p>
          {role === "operador"
            ? "Sua conta e seu estacionamento no ParaAí."
            : "Sua conta e seu veículo no ParaAí."}
        </p>
      </div>

      <div className="profile-grid">
        <div className="card profile-summary">
          <div className="profile-avatar">{initials}</div>
          <h3>{name}</h3>
          <p>{email}</p>
          {role === "operador" ? (
            <span className="status-pill warning">Operador</span>
          ) : (
            placa && <span className="placa-tag">{placa}</span>
          )}
        </div>

        <div className="card">
          <div className="card-head-row">
            <h2 style={{ marginBottom: 0, background: "none", paddingBottom: 0 }}>
              Dados da conta
            </h2>
            <Link to="/configuracoes" className="btn btn-outline btn-sm">
              Editar
            </Link>
          </div>

          <div className="field">
            <label>Nome completo</label>
            <input type="text" value={name} disabled />
          </div>

          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} disabled />
          </div>

          <div className="field">
            <label>Tipo de conta</label>
            <input
              type="text"
              value={role === "operador" ? "Dono de estacionamento" : "Motorista"}
              disabled
            />
          </div>
        </div>
      </div>

      {role === "operador" ? (
        estId ? (
        <>
        <div className="card vehicle-card">
          <h2>Meu estacionamento</h2>

          {carregandoEstacionamento ? (
            <p className="empty-state">Carregando dados do estacionamento...</p>
          ) : !estacionamento ? (
            <p className="empty-state">
              Não foi possível localizar este estacionamento. Confira sua
              conexão e tente novamente.
            </p>
          ) : (
            <>
              <div className="info-row">
                <span className="label">Nome</span>
                <strong>{estacionamento.nome}</strong>
              </div>
              {estacionamento.logradouro && (
                <div className="info-row">
                  <span className="label">Endereço</span>
                  <span style={{ textAlign: "right" }}>
                    {estacionamento.logradouro}
                    {estacionamento.numero ? `, ${estacionamento.numero}` : ""}
                    {estacionamento.bairro ? ` — ${estacionamento.bairro}` : ""}
                  </span>
                </div>
              )}
              <div className="info-row">
                <span className="label">Cidade</span>
                <span>
                  {estacionamento.cidade}
                  {estacionamento.uf ? ` - ${estacionamento.uf}` : ""}
                </span>
              </div>
              {estacionamento.cep && (
                <div className="info-row">
                  <span className="label">CEP</span>
                  <span>{estacionamento.cep}</span>
                </div>
              )}
              <div className="info-row">
                <span className="label">Vagas</span>
                <span>{estacionamento.numVagas}</span>
              </div>
              <div className="info-row">
                <span className="label">Tarifa</span>
                <strong className="money">
                  {formatarMoeda(estacionamento.tarifaHora)}/hora
                </strong>
              </div>
              <div className="info-row">
                <span className="label">ID do estacionamento</span>
                <code className="est-id">{estId}</code>
              </div>
              <p className="muted-note">
                Este ID identifica o pátio. Gere abaixo um acesso seguro para
                cada equipamento e copie e-mail, senha e ID para o arquivo{" "}
                <code>Credenciais.h</code>. Tarifa e vagas são sincronizadas
                automaticamente com o painel.
              </p>
            </>
          )}
        </div>
        <div className="card totem-security-card">
          <div className="card-head-row">
            <div>
              <h2>Segurança do totem</h2>
              <p className="muted-note" style={{ margin: 0 }}>
                Cada equipamento usa um acesso exclusivo e pode ser bloqueado
                sem afetar sua conta de operador.
              </p>
            </div>
            <span className={`status-pill ${totems.some((item) => item.ativo) ? "success" : "warning"}`}>
              {totems.filter((item) => item.ativo).length} ativo(s)
            </span>
          </div>

          {erroTotem && <p className="error-text">{erroTotem}</p>}

          {credencialTotem && (
            <div className="totem-credential" role="status">
              <strong>Copie agora — a senha não será exibida novamente</strong>
              <div className="totem-credential-row">
                <span>E-mail do dispositivo</span>
                <code>{credencialTotem.email}</code>
              </div>
              <div className="totem-credential-row">
                <span>Senha do dispositivo</span>
                <code>{credencialTotem.senha}</code>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={copiarCredencialTotem}>
                Copiar configuração
              </button>
            </div>
          )}

          {carregandoTotems ? (
            <p className="empty-state">Consultando equipamentos...</p>
          ) : totems.length === 0 ? (
            <p className="empty-state">
              Nenhum equipamento seguro foi vinculado ainda.
            </p>
          ) : (
            <div className="totem-list">
              {totems.map((totem) => (
                <div className="totem-list-item" key={totem.id}>
                  <div>
                    <strong>{totem.nome || "Totem"}</strong>
                    <span>{totem.email}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm ${totem.ativo ? "btn-ghost" : "btn-outline"}`}
                    onClick={() => handleAlternarTotem(totem)}
                  >
                    {totem.ativo ? "Bloquear" : "Reativar"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGerarTotem}
            disabled={gerandoTotem}
          >
            {gerandoTotem ? "Gerando acesso..." : "Gerar novo acesso de totem"}
          </button>
        </div>
        </>
        ) : null
      ) : (
        <div className="card vehicle-card">
          <h2>Meu veículo</h2>

          {mensagem && (
            <p className={mensagem.tipo === "erro" ? "error-text" : "success-text"}>
              {mensagem.texto}
            </p>
          )}

          {!placa ? (
            <>
              <p className="muted-note" style={{ marginTop: 0 }}>
                Cadastre a placa do seu veículo para usar a rede ParaAí. É essa
                placa que você digita no totem na entrada e na saída. Aceitamos
                o padrão antigo (ABC1234) e o Mercosul (ABC1D23).
              </p>
              <form onSubmit={handleCadastrarPlaca} className="placa-form">
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label htmlFor="placa">Placa do veículo</label>
                  <input
                    id="placa"
                    type="text"
                    value={placaInput}
                    onChange={(e) => setPlacaInput(normalizarPlaca(e.target.value))}
                    placeholder="ABC1234 ou ABC1D23"
                    maxLength={7}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={processando}
                >
                  {processando ? "Cadastrando..." : "Cadastrar"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="info-row">
                <span className="label">Placa</span>
                <span className="placa-tag">{placa}</span>
              </div>
              <div className="info-row">
                <span className="label">Cadastro</span>
                {veiculo?.ativo ? (
                  <span className="status-pill success">Ativo</span>
                ) : (
                  <span className="status-pill danger">Inativo</span>
                )}
              </div>
              <div className="info-row">
                <span className="label">Situação</span>
                <span>
                  {Number(veiculo?.vagaAtual) > 0
                    ? `Estacionado — Vaga ${veiculo.vagaAtual}`
                    : "Fora do estacionamento"}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Saldo</span>
                <strong className="money">{formatarMoeda(veiculo?.saldo)}</strong>
              </div>

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                onClick={() => setRecargaAberta(true)}
              >
                Adicionar saldo
              </button>
              <p className="muted-note">
                Recarga simulada, sem pagamento real — recurso de demonstração
                do projeto acadêmico.
              </p>
            </>
          )}
        </div>
      )}

      {(role === "motorista" || (role === "operador" && !estId)) && (
        <div className="card vehicle-card">
          <h2>
            {role === "operador"
              ? "Concluir cadastro do estacionamento"
              : "Tenho um estacionamento"}
          </h2>
          <p className="muted-note" style={{ marginTop: 0 }}>
            {role === "operador"
              ? "Sua conta já é de operador. Falta apenas vincular o estacionamento para liberar o painel."
              : "Cadastre seu estacionamento para automatizar o pátio e acompanhar faturamento, acessos e ocupação. Sua conta passará a ser de operador."}
          </p>

          {msgEst && (
            <p className={msgEst.tipo === "erro" ? "error-text" : "success-text"}>
              {msgEst.texto}
            </p>
          )}

          <form onSubmit={handleCriarEstacionamento}>
            <div className="field">
              <label htmlFor="estNome">Nome do estacionamento</label>
              <input
                id="estNome"
                type="text"
                value={estNome}
                onChange={(e) => setEstNome(e.target.value)}
                placeholder="Ex.: Estacionamento Central"
              />
            </div>

            <div className="field-row cep-row">
              <div className="field">
                <label htmlFor="estCep">CEP</label>
                <div className="input-com-acao">
                  <input
                    id="estCep"
                    type="text"
                    inputMode="numeric"
                    value={estCep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {buscandoCep && <span className="input-spinner" />}
                </div>
                {erroCep ? (
                  <span className="field-hint erro">{erroCep}</span>
                ) : estEndereco ? (
                  <span className="field-hint ok">
                    ✓ {estEndereco.logradouro}, {estEndereco.cidade}-{estEndereco.uf}
                  </span>
                ) : (
                  <span className="field-hint">Preenche o endereço sozinho</span>
                )}
              </div>
              <div className="field">
                <label htmlFor="estNumero">Número</label>
                <input
                  id="estNumero"
                  type="text"
                  value={estNumero}
                  onChange={(e) => setEstNumero(e.target.value)}
                  placeholder="123"
                  disabled={!estEndereco}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="estVagas">Nº de vagas</label>
              <input
                id="estVagas"
                type="number"
                min={1}
                max={200}
                value={estVagas}
                onChange={(e) => setEstVagas(e.target.value)}
              />
              <span className="field-hint">
                A tarifa por hora você define depois, no painel.
              </span>
            </div>
            <button type="submit" className="btn btn-outline" disabled={processando}>
              {processando ? "Cadastrando..." : "Cadastrar estacionamento"}
            </button>
          </form>
        </div>
      )}

      {recargaAberta && placa && (
        <ModalRecarga
          placa={placa}
          saldoAtual={veiculo?.saldo}
          aoFechar={() => setRecargaAberta(false)}
          aoConcluir={(v) => toast.sucesso(`+${formatarMoeda(v)} na sua carteira!`)}
        />
      )}
    </div>
  );
}
