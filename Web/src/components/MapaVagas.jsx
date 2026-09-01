import { useState } from "react";
import { useToast } from "../context/ToastContext";
import { atualizarVagaManual } from "../services/estacionamentos";
import { normalizarPlaca, placaValida } from "../utils/format";
import "./MapaVagas.css";

// Distribuição fixa para a apresentação: o tipo de uma vaga não muda a cada
// recarregamento e continua fácil de reconhecer no mapa do pátio.
const VAGAS_ESPECIAIS = {
  1: { tipo: "pcd", rotulo: "PCD", icone: "♿" },
  2: { tipo: "pcd", rotulo: "PCD", icone: "♿" },
  9: { tipo: "idoso", rotulo: "Idoso", icone: "60+" },
  10: { tipo: "gestante", rotulo: "Gestante", icone: "G" },
  11: { tipo: "idoso", rotulo: "Idoso", icone: "60+" },
};

function Vaga({ vaga, selecionada, onSelecionar }) {
  const especial = VAGAS_ESPECIAIS[vaga.numero];
  const descricao = vaga.ocupada
    ? `Vaga ${vaga.numero} ocupada${vaga.placa ? ` pela placa ${vaga.placa}` : ""}`
    : `Vaga ${vaga.numero} livre`;

  return (
    <button
      type="button"
      className={`mapa-vaga ${vaga.ocupada ? "ocupada" : "livre"} ${
        especial ? `especial ${especial.tipo}` : ""
      } ${selecionada ? "selecionada" : ""}`}
      onClick={() => onSelecionar(vaga)}
      aria-label={`${descricao}${especial ? `, reservada para ${especial.rotulo}` : ""}`}
      aria-pressed={selecionada}
    >
      <span className="mapa-vaga-topo">
        <strong>{String(vaga.numero).padStart(2, "0")}</strong>
        {especial && (
          <span className="mapa-vaga-tipo" title={`Vaga para ${especial.rotulo}`}>
            <span aria-hidden="true">{especial.icone}</span>
            {especial.rotulo}
          </span>
        )}
      </span>
      <span className="mapa-vaga-corpo" aria-hidden="true">
        {vaga.ocupada ? <span className="mapa-carro">CARRO</span> : <span className="mapa-livre">LIVRE</span>}
      </span>
      <span className="mapa-vaga-rodape">
        {vaga.ocupada ? vaga.placa || "OCUPADA" : "Disponível"}
      </span>
    </button>
  );
}

export default function MapaVagas({ estId, vagas, nomeEstacionamento }) {
  const toast = useToast();
  const [vagaSelecionada, setVagaSelecionada] = useState(null);
  const [placa, setPlaca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const vagaAtual = vagaSelecionada
    ? vagas.find((vaga) => vaga.id === vagaSelecionada) || null
    : null;
  const metade = Math.ceil(vagas.length / 2);
  const fileiraSuperior = vagas.slice(0, metade);
  const fileiraInferior = vagas.slice(metade);

  function selecionarVaga(vaga) {
    setVagaSelecionada(vaga.id);
    setPlaca(vaga.placa || "");
    setErro("");
  }

  async function salvarOcupacao(event) {
    event.preventDefault();
    if (!vagaAtual) return;

    const placaNormalizada = normalizarPlaca(placa);
    if (placaNormalizada && !placaValida(placaNormalizada)) {
      setErro("Informe uma placa válida, como ABC1D23, ou deixe o campo vazio.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      await atualizarVagaManual({
        estId,
        numero: vagaAtual.numero,
        ocupada: true,
        placa: placaNormalizada,
      });
      toast.sucesso(`Vaga ${vagaAtual.numero} marcada como ocupada.`);
      setVagaSelecionada(null);
    } catch (err) {
      console.error("Falha ao atualizar a vaga:", err);
      setErro(
        `${err?.code || ""}`.includes("permission")
          ? "As regras publicadas ainda não permitem a operação manual."
          : err.message || "Não foi possível atualizar a vaga."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function liberarVaga() {
    if (!vagaAtual) return;
    setSalvando(true);
    setErro("");
    try {
      await atualizarVagaManual({
        estId,
        numero: vagaAtual.numero,
        ocupada: false,
        placa: "",
      });
      toast.sucesso(`Vaga ${vagaAtual.numero} liberada.`);
      setVagaSelecionada(null);
    } catch (err) {
      console.error("Falha ao liberar a vaga:", err);
      setErro(err.message || "Não foi possível liberar a vaga.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card mapa-vagas-card">
      <div className="card-head-row mapa-vagas-cabecalho">
        <div>
          <h2>Mapa de vagas</h2>
          <p>{nomeEstacionamento || "Estacionamento"} · clique em uma vaga para atualizar</p>
        </div>
        <span className="live-dot" title="Atualiza em tempo real">
          <span className="status-dot online pulsa" />AO VIVO
        </span>
      </div>

      <div className="mapa-legenda" aria-label="Legenda do mapa">
        <span><i className="legenda-cor livre" />Livre</span>
        <span><i className="legenda-cor ocupada" />Ocupada</span>
        <span><i className="legenda-cor pcd" />PCD</span>
        <span><i className="legenda-cor idoso" />Idoso</span>
        <span><i className="legenda-cor gestante" />Gestante</span>
      </div>

      <div className="mapa-vagas-scroll">
        <div className="mapa-patio" role="region" aria-label="Mapa visual das vagas do estacionamento">
          <div className="mapa-fileira superior">
            {fileiraSuperior.map((vaga) => (
              <Vaga key={vaga.id} vaga={vaga} selecionada={vaga.id === vagaSelecionada} onSelecionar={selecionarVaga} />
            ))}
          </div>

          <div className="mapa-corredor" aria-hidden="true">
            <span className="mapa-portao entrada">ENTRADA</span>
            <span className="mapa-setas">→ &nbsp; circulação &nbsp; →</span>
            <span className="mapa-portao saida">SAÍDA</span>
          </div>

          <div className="mapa-fileira inferior">
            {fileiraInferior.map((vaga) => (
              <Vaga key={vaga.id} vaga={vaga} selecionada={vaga.id === vagaSelecionada} onSelecionar={selecionarVaga} />
            ))}
          </div>
        </div>
      </div>

      {vagaAtual && (
        <form className="mapa-vaga-editor" onSubmit={salvarOcupacao} aria-label={`Editar vaga ${vagaAtual.numero}`}>
          <div className="mapa-editor-resumo">
            <span className="stat-label">Vaga selecionada</span>
            <strong>Vaga {String(vagaAtual.numero).padStart(2, "0")}</strong>
            <span className={`status-pill ${vagaAtual.ocupada ? "danger" : "success"}`}>
              {vagaAtual.ocupada ? "Ocupada" : "Livre"}
            </span>
          </div>
          <div className="field mapa-editor-placa">
            <label htmlFor="placa-vaga">Placa do veículo (opcional)</label>
            <input
              id="placa-vaga"
              type="text"
              placeholder="ABC1D23"
              value={placa}
              maxLength={8}
              onChange={(event) => setPlaca(event.target.value.toUpperCase())}
              autoFocus
            />
          </div>
          <div className="mapa-editor-acoes">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVagaSelecionada(null)}>
              Cancelar
            </button>
            {vagaAtual.ocupada && (
              <button type="button" className="btn btn-danger btn-sm" onClick={liberarVaga} disabled={salvando}>
                Liberar vaga
              </button>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
              {salvando ? "Salvando..." : vagaAtual.ocupada ? "Atualizar placa" : "Ocupar vaga"}
            </button>
          </div>
          {erro && <p className="error-text mapa-editor-erro">{erro}</p>}
          <p className="muted-note mapa-editor-nota">
            Esta alteração é sincronizada em tempo real. Se os sensores estiverem ligados, eles continuam sendo a fonte física da ocupação.
          </p>
        </form>
      )}
    </div>
  );
}
