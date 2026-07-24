import { useAuth } from "../context/AuthContext";
import { useEstacionamento, useVagas } from "../hooks/useParkingData";
import "./Pages.css";

// Mapa de vagas do estacionamento do OPERADOR logado.
export default function MapaVagas() {
  const { userData } = useAuth();
  const estId = userData?.estacionamentoId || null;

  const { estacionamento, online } = useEstacionamento(estId);
  const { vagas, loading } = useVagas(estId, estacionamento?.numVagas);

  const livres = vagas.filter((v) => !v.ocupada).length;

  if (!estId) {
    return (
      <div className="page container">
        <div className="card empty-state">
          O mapa de vagas é exclusivo para contas de estacionamento.
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Mapa de Vagas</h1>
        <p>
          {estacionamento?.nome || "Seu pátio"} — ocupação em tempo real.{" "}
          {online ? (
            <span className="inline-status online">● Totem online</span>
          ) : (
            <span className="inline-status offline">● Totem offline</span>
          )}
        </p>
      </div>

      <div className="vagas-legend">
        <span><span className="legend-dot free"></span>Livre</span>
        <span><span className="legend-dot occupied"></span>Ocupada</span>
      </div>

      <div className="card">
        {loading ? (
          <p className="empty-state">Carregando vagas...</p>
        ) : (
          <>
            <div className="vagas-grid">
              {vagas.map((v) => (
                <div
                  key={v.id}
                  className={`vaga-slot ${v.ocupada ? "occupied" : "free"}`}
                  title={v.ocupada ? "Vaga ocupada" : "Vaga livre"}
                >
                  <span className="vaga-numero">VAGA {v.numero}</span>
                  {v.ocupada ? (
                    <>
                      <span className="vaga-icon">🚗</span>
                      {v.placa ? (
                        <span className="placa-tag placa-tag-sm">{v.placa}</span>
                      ) : (
                        <span className="vaga-placa">Ocupada</span>
                      )}
                    </>
                  ) : (
                    <span className="vaga-free">LIVRE</span>
                  )}
                </div>
              ))}
            </div>

            <p className="muted-note">
              {livres === 0
                ? "Pátio lotado no momento."
                : `${livres} de ${vagas.length} vagas livres agora.`}{" "}
              A vaga é atribuída automaticamente pelo totem na entrada.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
