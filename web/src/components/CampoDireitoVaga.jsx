import { DIREITOS_VAGA } from "../utils/mapaVagas";

// Pergunta do direito a vaga especial, usada no cadastro e no Perfil. Quem
// escolhe um tipo precisa confirmar a autodeclaração antes de salvar.
export default function CampoDireitoVaga({ id, valor, onValor, declarado, onDeclarado }) {
  return (
    <div className="field">
      <label htmlFor={id}>Precisa de vaga especial?</label>
      <select
        id={id}
        value={valor}
        onChange={(event) => {
          onValor(event.target.value);
          onDeclarado(false);
        }}
      >
        {DIREITOS_VAGA.map((direito) => (
          <option key={direito.valor} value={direito.valor}>
            {direito.rotulo}
          </option>
        ))}
      </select>
      <span className="field-hint">
        Na entrada, o totem reserva para você uma vaga do seu tipo quando houver.
      </span>
      {valor && (
        <label className="declaracao" htmlFor={`${id}-declaro`}>
          <input
            id={`${id}-declaro`}
            type="checkbox"
            checked={declarado}
            onChange={(event) => onDeclarado(event.target.checked)}
          />
          <span>
            Declaro que tenho direito a essa vaga e apresento a credencial quando
            for exigida.
          </span>
        </label>
      )}
    </div>
  );
}
