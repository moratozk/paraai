import { Fragment, useMemo, useState } from "react";
import {
  useCatalogoEstacionamentos,
  useHistoricoPlaca,
  useRecargas,
} from "../hooks/useParkingData";
import {
  formatarDataHora,
  formatarDuracao,
  formatarMoeda,
  valorPendente,
} from "../utils/format";
import "./ExtratoCarteira.css";

const ITENS_INICIAIS = 6;
// Meio centavo, a mesma folga do totem e das regras.
const TOLERANCIA = 0.005;

function IconeRecarga() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconeEstadia() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 19V5h4.5a4 4 0 0 1 0 8H9" />
    </svg>
  );
}

// Extrato da carteira: as recargas simuladas entram como crédito e cada
// estadia encerrada como débito, da mais recente para a mais antiga. As
// regras garantem que o saldo só sobe com uma recarga registrada e só desce
// com o recibo de uma saída, então a soma bate com o saldo. A exceção são as
// recargas feitas antes de o extrato existir, que não têm registro.
export default function ExtratoCarteira({ uid, placa, saldo }) {
  const { recargas, loading: carregandoRecargas, erro: erroRecargas } = useRecargas(uid, placa);
  const { historico, loading: carregandoHistorico } = useHistoricoPlaca(placa);
  const { estacionamentos } = useCatalogoEstacionamentos();
  const [completo, setCompleto] = useState(false);

  const nomesPorEstacionamento = useMemo(
    () => Object.fromEntries(estacionamentos.map((item) => [item.id, item.nome || item.id])),
    [estacionamentos]
  );

  const movimentos = useMemo(() => {
    const creditos = recargas.map((item) => ({
      id: `recarga-${item.id}`,
      tipo: "credito",
      quando: item.quando,
      valor: Number(item.valor) || 0,
      titulo: item.forma === "cartao" ? "Recarga no cartão" : "Recarga via Pix",
      detalhes: ["simulada"],
      pendente: 0,
    }));
    const debitos = historico
      .filter((item) => Number(item.saida) > 0)
      .map((item) => ({
        id: `estadia-${item.id}`,
        tipo: "debito",
        quando: Number(item.saida),
        valor: Number(item.valorCobrado) || 0,
        titulo: nomesPorEstacionamento[item.estacionamentoId] || "Rede ParaAí",
        detalhes: [`Vaga ${item.vaga}`, formatarDuracao(item.duracaoMinutos)],
        pendente: valorPendente(item),
      }));
    return [...creditos, ...debitos].sort((a, b) => b.quando - a.quando);
  }, [recargas, historico, nomesPorEstacionamento]);

  const carregando = carregandoRecargas || carregandoHistorico;
  const soma = movimentos.reduce(
    (total, item) => total + (item.tipo === "credito" ? item.valor : -item.valor),
    0
  );
  const temRecargaAntiga =
    !carregando && !erroRecargas && (Number(saldo) || 0) - soma >= TOLERANCIA;
  const visiveis = completo ? movimentos : movimentos.slice(0, ITENS_INICIAIS);

  return (
    <div className="card vehicle-card extrato-card">
      <h2>Extrato da carteira</h2>

      {erroRecargas && <p className="error-text">{erroRecargas}</p>}

      {carregando ? (
        <p className="empty-state">Carregando extrato...</p>
      ) : movimentos.length === 0 ? (
        <p className="empty-state">
          Nenhuma movimentação ainda. Suas recargas e estadias aparecem aqui.
        </p>
      ) : (
        <ul className="extrato-lista">
          {visiveis.map((item) => (
            <li className="extrato-item" key={item.id}>
              <span className={`extrato-icone ${item.tipo}`} aria-hidden="true">
                {item.tipo === "credito" ? <IconeRecarga /> : <IconeEstadia />}
              </span>
              <div className="extrato-texto">
                <strong>{item.titulo}</strong>
                {/* Quebra de linha só entre as partes: "3h 55min" não se separa. */}
                <span className="extrato-detalhe">
                  {[formatarDataHora(item.quando), ...item.detalhes].map((parte, indice) => (
                    <Fragment key={indice}>
                      {indice > 0 && " · "}
                      <span>{parte}</span>
                    </Fragment>
                  ))}
                </span>
                {item.pendente > 0 && (
                  <span className="extrato-pendente">
                    {formatarMoeda(item.pendente)} não coberto pelo saldo
                  </span>
                )}
              </div>
              <span className={`extrato-valor money ${item.tipo}`}>
                <span className="sr-only">
                  {item.tipo === "credito" ? "Crédito de " : "Débito de "}
                </span>
                <span aria-hidden="true">{item.tipo === "credito" ? "+" : "−"}</span>
                {formatarMoeda(item.valor)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {movimentos.length > ITENS_INICIAIS && (
        <button
          type="button"
          className="btn btn-outline btn-block"
          aria-expanded={completo}
          onClick={() => setCompleto((atual) => !atual)}
        >
          {completo ? "Mostrar menos" : `Ver extrato completo (${movimentos.length})`}
        </button>
      )}

      {temRecargaAntiga && (
        <p className="muted-note">
          Recargas feitas antes de o extrato existir não aparecem aqui.
        </p>
      )}
    </div>
  );
}
