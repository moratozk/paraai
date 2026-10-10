import { formatarMoeda } from "../utils/format";

// Barras da receita por dia (série de calcularSerieDiaria, em
// utils/relatorios.js). Só o maior valor ganha rótulo fixo; os outros
// aparecem na dica ao passar o mouse.
export default function GraficoReceita({ serie, rotulo, vazio }) {
  const maximo = Math.max(...serie.map((dia) => dia.valor), 0);
  if (maximo <= 0) return <p className="empty-state">{vazio}</p>;

  return (
    <div className="chart-bars" role="img" aria-label={rotulo}>
      {serie.map((dia, i) => (
        <div className="chart-col" key={i}>
          <div className="chart-bar-track">
            <div
              className={`chart-bar ${dia.hoje ? "hoje" : ""}`}
              style={{ height: `${Math.round((dia.valor / maximo) * 100)}%` }}
            >
              <span className="chart-tooltip">
                {dia.dataCurta} · {formatarMoeda(dia.valor)} · {dia.acessos}{" "}
                {dia.acessos === 1 ? "carro" : "carros"}
              </span>
              {dia.valor === maximo && (
                <span className="chart-bar-value">{formatarMoeda(dia.valor)}</span>
              )}
            </div>
          </div>
          <span className="chart-col-label">{dia.rotulo}</span>
        </div>
      ))}
    </div>
  );
}
