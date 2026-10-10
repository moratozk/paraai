import { useState } from "react";
import { iconeAoLadoDoRotulo, obterTipoVaga } from "../utils/mapaVagas";
import { descreverVeiculo } from "../utils/veiculo";
import { formatarHora } from "../utils/format";
import RolagemLateral from "./RolagemLateral";
import "./MapaVagas.css";

function situacaoDaVaga(vaga) {
  if (vaga.ocupada) return "ocupada";
  if (vaga.reservada) return "reservada";
  return "livre";
}

function Vaga({ vaga, selecionada, onSelecionar }) {
  const classificacao = obterTipoVaga(vaga.tipo, vaga.numero);
  const especial = classificacao.tipo === "comum" ? null : classificacao;
  const icone = especial ? iconeAoLadoDoRotulo(especial) : "";
  const situacao = situacaoDaVaga(vaga);
  const carro = descreverVeiculo(vaga);
  const descricao =
    situacao === "ocupada"
      ? `Vaga ${vaga.numero} ocupada${vaga.placa ? ` pela placa ${vaga.placa}` : ""}${carro ? `, ${carro}` : ""}`
      : situacao === "reservada"
        ? `Vaga ${vaga.numero} reservada pelo app até ${formatarHora(vaga.reservadaAte)}`
        : `Vaga ${vaga.numero} livre`;

  return (
    <button
      type="button"
      className={`mapa-vaga ${situacao} ${especial ? `especial ${especial.tipo}` : ""} ${
        selecionada ? "selecionada" : ""
      }`}
      onClick={() => onSelecionar(vaga)}
      aria-label={`${descricao}${especial ? `, destinada a ${especial.rotulo}` : ""}`}
      aria-pressed={selecionada}
    >
      <span className="mapa-vaga-topo">
        <strong>{String(vaga.numero).padStart(2, "0")}</strong>
        {especial && (
          <span className="mapa-vaga-tipo" title={`Vaga para ${especial.rotulo}`}>
            {icone && <span aria-hidden="true">{icone}</span>}
            {especial.rotulo}
          </span>
        )}
      </span>
      <span className="mapa-vaga-corpo" aria-hidden="true">
        {situacao === "ocupada" ? (
          <span className="mapa-carro">CARRO</span>
        ) : situacao === "reservada" ? (
          <span className="mapa-reservada">Reserva</span>
        ) : (
          <span className="mapa-livre">Livre</span>
        )}
      </span>
      {/* Só o que o estado não diz: a placa, ou até quando vale a reserva. */}
      <span className="mapa-vaga-rodape" aria-hidden="true">
        {situacao === "ocupada"
          ? vaga.placa || "OCUPADA"
          : situacao === "reservada"
            ? `até ${formatarHora(vaga.reservadaAte)}`
            : ""}
      </span>
    </button>
  );
}

// Mapa do operador. Só leitura: a ocupação é registrada pelo totem na
// entrada e na saída da placa, e a reserva, pelo app do motorista. Marcar uma
// vaga à mão deixaria vaga e estadia incoerentes (liberar uma vaga com carro
// dentro travaria a saída).
export default function MapaVagas({ vagas, nomeEstacionamento }) {
  const [vagaSelecionada, setVagaSelecionada] = useState(null);

  const vagaAtual = vagaSelecionada
    ? vagas.find((vaga) => vaga.id === vagaSelecionada) || null
    : null;
  const tipoAtual = vagaAtual ? obterTipoVaga(vagaAtual.tipo, vagaAtual.numero) : null;
  const situacaoAtual = vagaAtual ? situacaoDaVaga(vagaAtual) : null;
  const metade = Math.ceil(vagas.length / 2);
  const fileiraSuperior = vagas.slice(0, metade);
  const fileiraInferior = vagas.slice(metade);

  function selecionarVaga(vaga) {
    setVagaSelecionada((atual) => (atual === vaga.id ? null : vaga.id));
  }

  return (
    <div className="card mapa-vagas-card">
      <div className="card-head-row mapa-vagas-cabecalho">
        <div>
          <h2>Mapa de vagas</h2>
          <p>{nomeEstacionamento || "Estacionamento"} · atualizado pelo totem a cada entrada e saída</p>
        </div>
        <span className="live-dot" title="Atualiza em tempo real">
          <span className="status-dot online pulsa" />AO VIVO
        </span>
      </div>

      <div className="mapa-legenda" aria-label="Legenda do mapa">
        <span><i className="legenda-cor livre" />Livre</span>
        <span><i className="legenda-cor ocupada" />Ocupada</span>
        <span><i className="legenda-cor reservada" />Reservada no app</span>
        <span><i className="legenda-cor pcd" />PCD</span>
        <span><i className="legenda-cor idoso" />60+</span>
        <span><i className="legenda-cor gestante" />Gestante</span>
      </div>

      <RolagemLateral
        className="mapa-vagas-scroll"
        aviso="Role para o lado para ver todas as vagas."
      >
        <div
          className="mapa-patio"
          role="region"
          aria-label="Mapa visual das vagas do estacionamento"
          style={{ "--vagas-na-fileira": Math.max(metade, 1) }}
        >
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
      </RolagemLateral>

      {vagaAtual && (
        <div className="mapa-vaga-editor" role="status" aria-live="polite">
          <div className="mapa-editor-resumo">
            <span className="stat-label">Vaga selecionada</span>
            <strong>Vaga {String(vagaAtual.numero).padStart(2, "0")}</strong>
            <span
              className={`status-pill ${
                { ocupada: "danger", reservada: "warning", livre: "success" }[situacaoAtual]
              }`}
            >
              {{ ocupada: "Ocupada", reservada: "Reservada", livre: "Livre" }[situacaoAtual]}
            </span>
          </div>
          <p className="mapa-editor-nota">
            {situacaoAtual === "ocupada"
              ? `Placa ${vagaAtual.placa || "não informada"}${
                  descreverVeiculo(vagaAtual) ? ` · ${descreverVeiculo(vagaAtual)}` : ""
                }.`
              : situacaoAtual === "reservada"
                ? `Reservada pelo app até ${formatarHora(vagaAtual.reservadaAte)}: o totem guarda a vaga para a placa de quem reservou.`
                : "Sem veículo registrado."}
            {tipoAtual && tipoAtual.tipo !== "comum" && ` Vaga para ${tipoAtual.rotulo}.`}
          </p>
          <p className="muted-note mapa-editor-nota">
            A ocupação é registrada pelo totem na entrada e na saída da placa.
          </p>
        </div>
      )}
    </div>
  );
}
