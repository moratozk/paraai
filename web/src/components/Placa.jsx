import { placaParaExibir, tipoPlaca } from "../utils/format";
import "./Placa.css";

// Placa do carro desenhada como a de verdade, escolhida pelo formato:
// Mercosul (ABC1D23) branca, com a faixa azul em cima; antiga (ABC1234)
// cinza, com o hífen. Na grande, a Mercosul leva "BRASIL" na faixa, e a
// antiga fica com a tarja da cidade em branco, porque o site não sabe de onde
// é o carro. Tamanhos: "pequena" (listas), "media" e "grande" (perfil e
// comprovante).
export default function Placa({ placa, tamanho = "media" }) {
  const tipo = tipoPlaca(placa) || "sem-formato";
  return (
    <span className={`placa-carro ${tipo} ${tamanho}`}>
      <span className="placa-carro-faixa" aria-hidden="true">
        {tamanho === "grande" && tipo === "mercosul" ? "BRASIL" : null}
      </span>
      <span className="placa-carro-letras">{placaParaExibir(placa)}</span>
    </span>
  );
}
