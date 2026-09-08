import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useEstacionamentosAdmin } from "../hooks/useParkingData";
import {
  atualizarEstacionamentoAdmin,
  criarEstacionamentoAdmin,
} from "../services/estacionamentos";
import { buscarCep, cepCompleto, formatarCep } from "../services/cep";
import { formatarMoeda } from "../utils/format";
import "./Pages.css";
import "./Admin.css";

const FORM_VAZIO = {
  nome: "",
  numVagas: 20,
  tarifaHora: 5,
  tarifaMinuto: "",
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "SP",
};

function dadosFormulario(estacionamento) {
  return {
    nome: estacionamento.nome || "",
    numVagas: estacionamento.numVagas || 1,
    tarifaHora: estacionamento.tarifaHora ?? 0,
    tarifaMinuto: estacionamento.tarifaMinuto ?? "",
    cep: estacionamento.cep || "",
    logradouro: estacionamento.logradouro || "",
    numero: estacionamento.numero || "",
    bairro: estacionamento.bairro || "",
    cidade: estacionamento.cidade || "",
    uf: estacionamento.uf || "",
  };
}

export default function PainelAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const { estacionamentos, loading, erro } = useEstacionamentosAdmin();
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroForm, setErroForm] = useState("");

  const resumo = useMemo(
    () => ({
      total: estacionamentos.length,
      ativos: estacionamentos.filter((item) => item.ativo !== false).length,
      vagas: estacionamentos.reduce(
        (total, item) => total + (Number(item.numVagas) || 0),
        0
      ),
    }),
    [estacionamentos]
  );

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function abrirNovo() {
    setForm({ ...FORM_VAZIO });
    setEditandoId(null);
    setErroForm("");
    setFormAberto(true);
  }

  function abrirEdicao(estacionamento) {
    setForm(dadosFormulario(estacionamento));
    setEditandoId(estacionamento.id);
    setErroForm("");
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function atualizarCep(valor) {
    const cep = formatarCep(valor);
    atualizarCampo("cep", cep);
    if (!cepCompleto(cep)) return;
    setBuscandoCep(true);
    try {
      const endereco = await buscarCep(cep);
      setForm((atual) => ({
        ...atual,
        cep,
        logradouro: endereco.logradouro || atual.logradouro,
        bairro: endereco.bairro || atual.bairro,
        cidade: endereco.cidade || atual.cidade,
        uf: endereco.uf || atual.uf,
      }));
    } catch (err) {
      setErroForm(err.message || "Não foi possível localizar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function salvar(event) {
    event.preventDefault();
    setErroForm("");
    setSalvando(true);
    try {
      if (editandoId) {
        await atualizarEstacionamentoAdmin(editandoId, form);
        toast.sucesso("Estacionamento atualizado.");
      } else {
        const id = await criarEstacionamentoAdmin({ uid: user.uid, ...form });
        toast.sucesso(`Estacionamento ${id} criado e publicado.`);
      }
      setFormAberto(false);
      setEditandoId(null);
      setForm({ ...FORM_VAZIO });
    } catch (err) {
      setErroForm(err.message || "Não foi possível salvar o estacionamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(estacionamento) {
    try {
      await atualizarEstacionamentoAdmin(estacionamento.id, {
        ativo: estacionamento.ativo === false,
      });
      toast.sucesso(
        estacionamento.ativo === false
          ? "Estacionamento publicado para os motoristas."
          : "Estacionamento retirado da lista pública."
      );
    } catch (err) {
      toast.erro(err.message || "Não foi possível alterar a publicação.");
    }
  }

  return (
    <main className="page container admin-page">
      <div className="page-header header-row">
        <div>
          <span className="admin-eyebrow">Administração do sistema</span>
          <h1>Estacionamentos da rede</h1>
          <p>Cadastre, edite e controle quais locais aparecem para os motoristas.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={abrirNovo}>
          Novo estacionamento
        </button>
      </div>

      <div className="stats-grid three">
        <div className="card stat-card">
          <span className="stat-label">Cadastrados</span>
          <span className="stat-value">{resumo.total}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Publicados</span>
          <span className="stat-value accent">{resumo.ativos}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Vagas na rede</span>
          <span className="stat-value">{resumo.vagas}</span>
        </div>
      </div>

      {formAberto && (
        <form className="card admin-form" onSubmit={salvar}>
          <div className="card-head-row">
            <div>
              <h2>{editandoId ? "Editar estacionamento" : "Novo estacionamento"}</h2>
              {editandoId && <code className="est-id">{editandoId}</code>}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setFormAberto(false)}
            >
              Cancelar
            </button>
          </div>

          <div className="admin-form-grid">
            <label className="field admin-span-2">
              <span>Nome do estacionamento</span>
              <input
                required
                value={form.nome}
                onChange={(event) => atualizarCampo("nome", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Número de vagas</span>
              <input
                required
                type="number"
                min="1"
                max="200"
                value={form.numVagas}
                onChange={(event) => atualizarCampo("numVagas", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Tarifa por hora</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.tarifaHora}
                onChange={(event) => atualizarCampo("tarifaHora", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Tarifa por minuto (opcional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.tarifaMinuto}
                onChange={(event) => atualizarCampo("tarifaMinuto", event.target.value)}
                placeholder="Ex.: 0,22"
              />
            </label>
            <label className="field">
              <span>CEP</span>
              <div className="input-com-acao">
                <input
                  value={form.cep}
                  onChange={(event) => atualizarCep(event.target.value)}
                  maxLength="9"
                  placeholder="00000-000"
                />
                {buscandoCep && <span className="input-spinner" />}
              </div>
            </label>
            <label className="field admin-span-2">
              <span>Logradouro</span>
              <input
                value={form.logradouro}
                onChange={(event) => atualizarCampo("logradouro", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Número</span>
              <input
                value={form.numero}
                onChange={(event) => atualizarCampo("numero", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Bairro</span>
              <input
                value={form.bairro}
                onChange={(event) => atualizarCampo("bairro", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Cidade</span>
              <input
                value={form.cidade}
                onChange={(event) => atualizarCampo("cidade", event.target.value)}
              />
            </label>
            <label className="field">
              <span>UF</span>
              <input
                value={form.uf}
                maxLength="2"
                onChange={(event) => atualizarCampo("uf", event.target.value.toUpperCase())}
              />
            </label>
          </div>
          {erroForm && <p className="error-text">{erroForm}</p>}
          <button className="btn btn-primary" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Criar e publicar"}
          </button>
        </form>
      )}

      {erro && <p className="error-text">{erro}</p>}
      {loading ? (
        <div className="card empty-state">Carregando estacionamentos…</div>
      ) : estacionamentos.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum estacionamento cadastrado.</p>
          <button className="btn btn-primary" type="button" onClick={abrirNovo}>
            Cadastrar o primeiro
          </button>
        </div>
      ) : (
        <section className="admin-estacionamentos" aria-label="Estacionamentos cadastrados">
          {estacionamentos.map((item) => (
            <article className="card admin-estacionamento" key={item.id}>
              <div className="admin-estacionamento-topo">
                <div>
                  <span className="admin-localidade">
                    {[item.cidade, item.uf].filter(Boolean).join(" · ") || "Rede ParaAí"}
                  </span>
                  <h2>{item.nome || "Estacionamento sem nome"}</h2>
                  <code className="est-id">{item.id}</code>
                </div>
                <span className={`status-pill ${item.ativo === false ? "offline" : "success"}`}>
                  {item.ativo === false ? "Oculto" : "Publicado"}
                </span>
              </div>
              <div className="admin-estacionamento-dados">
                <div><span>Vagas</span><strong>{Number(item.numVagas) || 0}</strong></div>
                <div>
                  <span>Tarifa</span>
                  <strong>
                    {item.tarifaMinuto !== undefined
                      ? `${formatarMoeda(item.tarifaMinuto)}/min`
                      : `${formatarMoeda(item.tarifaHora)}/h`}
                  </strong>
                </div>
                <div>
                  <span>Mapa livre</span>
                  <strong>{item.vagasLivresMapeadas ?? "—"}</strong>
                </div>
              </div>
              <p className="admin-endereco">
                {[item.logradouro, item.numero, item.bairro].filter(Boolean).join(", ") ||
                  "Endereço não informado"}
              </p>
              <div className="admin-estacionamento-acoes">
                <Link
                  className="btn btn-primary btn-sm"
                  to={`/admin/estacionamentos/${item.id}/vagas`}
                >
                  Ver vagas ao vivo
                </Link>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => abrirEdicao(item)}>
                  Editar
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => alternarAtivo(item)}>
                  {item.ativo === false ? "Publicar" : "Ocultar dos motoristas"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
