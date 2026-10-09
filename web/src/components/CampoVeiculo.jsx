import {
  CORES_VEICULO,
  MARCAS_VEICULO,
  OUTRA_MARCA,
  TAMANHO_NOME_VEICULO,
  dadosDaCor,
  modelosDaMarca,
  normalizarNomeVeiculo,
} from "../utils/veiculo";
import "./CampoVeiculo.css";

// Marca, modelo e cor do carro, usados no cadastro da placa e no Perfil.
// valor = { marca, modelo, cor }, tudo opcional. O modelo aceita qualquer nome
// no formato do documento do carro; a lista da marca só sugere.
export default function CampoVeiculo({ id, valor, onValor, desabilitado = false }) {
  const modelos = modelosDaMarca(valor.marca);
  const marcaForaDaLista =
    valor.marca && valor.marca !== OUTRA_MARCA && !MARCAS_VEICULO.some((item) => item.nome === valor.marca);
  const corAtual = dadosDaCor(valor.cor);
  const mudar = (campo, novo) => onValor({ ...valor, [campo]: novo });

  return (
    <fieldset className="campo-veiculo" disabled={desabilitado}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-marca`}>Marca</label>
          <select id={`${id}-marca`} value={valor.marca} onChange={(event) => mudar("marca", event.target.value)}>
            <option value="">Selecione</option>
            {MARCAS_VEICULO.map((marca) => (
              <option key={marca.nome} value={marca.nome}>
                {marca.nome}
              </option>
            ))}
            {marcaForaDaLista && <option value={valor.marca}>{valor.marca}</option>}
            <option value={OUTRA_MARCA}>Outra marca</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-modelo`}>Modelo</label>
          <input
            id={`${id}-modelo`}
            type="text"
            list={modelos.length ? `${id}-modelos` : undefined}
            value={valor.modelo}
            onChange={(event) => mudar("modelo", normalizarNomeVeiculo(event.target.value))}
            placeholder={modelos.length ? `Ex.: ${modelos[0]}` : "Digite o modelo"}
            maxLength={TAMANHO_NOME_VEICULO}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
          />
          {modelos.length > 0 && (
            <datalist id={`${id}-modelos`}>
              {modelos.map((modelo) => (
                <option key={modelo} value={modelo} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      <div className="campo-cor" role="radiogroup" aria-labelledby={`${id}-cor-rotulo`}>
        <p className="campo-cor-rotulo" id={`${id}-cor-rotulo`}>
          Cor <span>{corAtual ? corAtual.rotulo : "Toque para escolher"}</span>
        </p>
        <div className="campo-cor-opcoes">
          {CORES_VEICULO.map((cor) => (
            <label key={cor.valor} className="campo-cor-opcao" title={cor.rotulo}>
              <input
                type="radio"
                name={`${id}-cor`}
                value={cor.valor}
                checked={valor.cor === cor.valor}
                onChange={() => mudar("cor", cor.valor)}
              />
              {/* A amostra é a cor da pintura, não um token do tema. */}
              <span className="campo-cor-amostra" style={{ "--amostra": cor.amostra }} aria-hidden="true" />
              <span className="sr-only">{cor.rotulo}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
