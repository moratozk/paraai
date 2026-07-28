import { TOTEM_OFFLINE_APOS_SEGUNDOS } from "../utils/constants";
import "./StatusTotem.css";

/**
 * Situação do totem, em três estados que pedem respostas diferentes:
 *
 *  - nunca conectou  → o equipamento ainda não foi ligado. Mostra o passo a
 *                      passo da primeira conexão, com o ID que precisa ser
 *                      colado no Credenciais.h.
 *  - online          → recebeu heartbeat há pouco. Discreto, só confirma.
 *  - offline         → já funcionou antes, mas parou de responder. Precisa
 *                      chamar atenção e sugerir o que verificar.
 */
export default function StatusTotem({ estacionamento, online, onCopiarId }) {
  const ultimaAtualizacao = Number(estacionamento?.ultimaAtualizacao) || 0;
  const nuncaConectou = ultimaAtualizacao === 0;

  const vagasConfiguradas = Number(estacionamento?.numVagas) || 0;
  const vagasSuportadas = Number(estacionamento?.vagasSuportadasTotem) || 0;
  const excedeHardware =
    vagasSuportadas > 0 && vagasConfiguradas > vagasSuportadas;

  /* ---------------- nunca conectou: primeira instalação ---------------- */
  if (nuncaConectou) {
    return (
      <section className="totem-aviso totem-aviso-primeiro" aria-live="polite">
        <div className="totem-aviso-topo">
          <span className="totem-aviso-icone" aria-hidden="true">
            🔌
          </span>
          <div>
            <h3>Seu totem ainda não se conectou</h3>
            <p>
              Assim que o ESP32 ligar e alcançar a internet, este painel passa a
              mostrar as vagas em tempo real.
            </p>
          </div>
        </div>

        <ol className="totem-passos">
          <li>
            <strong>Abra</strong> <code>Main/Credenciais.h</code> no Arduino IDE
            (copie de <code>Credenciais.example.h</code> se ainda não existir).
          </li>
          <li>
            <strong>Preencha</strong> o nome e a senha do Wi-Fi do
            estabelecimento.
          </li>
          <li>
            <strong>Cole o identificador</strong> deste estacionamento em{" "}
            <code>ESTACIONAMENTO_ID</code>:
            <span className="totem-id-linha">
              <code className="totem-id">{estacionamento?.id}</code>
              {onCopiarId && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={onCopiarId}
                >
                  Copiar
                </button>
              )}
            </span>
          </li>
          <li>
            <strong>Grave</strong> o firmware e ligue o equipamento. A conexão
            aparece aqui em menos de um minuto.
          </li>
        </ol>

        <p className="totem-nota">
          O Wi-Fi precisa ser de 2,4 GHz — o ESP32 não enxerga redes de 5 GHz.
        </p>
      </section>
    );
  }

  /* ---------------- offline: já funcionou e parou ---------------- */
  if (!online) {
    return (
      <section className="totem-aviso totem-aviso-offline" role="alert">
        <div className="totem-aviso-topo">
          <span className="totem-aviso-icone" aria-hidden="true">
            ⚠️
          </span>
          <div>
            <h3>Totem sem resposta</h3>
            <p>
              Sem sinal há mais de {Math.round(TOTEM_OFFLINE_APOS_SEGUNDOS / 60)}{" "}
              minutos. Último contato {formatarQuando(ultimaAtualizacao)}. As
              vagas abaixo podem estar desatualizadas.
            </p>
          </div>
        </div>
        <ul className="totem-checklist">
          <li>O equipamento está ligado na tomada?</li>
          <li>O Wi-Fi do local está funcionando?</li>
          <li>Reiniciar o totem costuma resolver.</li>
        </ul>
      </section>
    );
  }

  /* ---------------- online ---------------- */
  return (
    <div className="totem-online-linha">
      <span className="status-pill online">
        <span className="status-dot online pulsa" />
        Totem online
      </span>
      <span className="totem-online-detalhe">
        Última leitura {formatarQuando(ultimaAtualizacao)}
        {vagasSuportadas > 0 && ` · ${vagasSuportadas} sensores instalados`}
      </span>

      {excedeHardware && (
        <span className="totem-alerta-vagas" role="status">
          Você configurou {vagasConfiguradas} vagas, mas o totem tem apenas{" "}
          {vagasSuportadas} sensores — ele está monitorando {vagasSuportadas}.
        </span>
      )}
    </div>
  );
}

/** "há 2 min", "há 1 h" — mais legível que um horário cru numa linha de status */
function formatarQuando(timestampSegundos) {
  if (!timestampSegundos) return "—";
  const segundos = Math.max(0, Math.floor(Date.now() / 1000) - timestampSegundos);
  if (segundos < 60) return "agora há pouco";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
