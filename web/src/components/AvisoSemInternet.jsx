import { useConexao } from "../conexao";
import "./AvisoSemInternet.css";

// Faixa presa embaixo do menu enquanto o aparelho está sem internet, e um
// "Conexão de volta" curto quando ela volta. A região fica sempre na página
// (vazia com a conexão normal) para o leitor de tela anunciar as mudanças.
// Também no aviso do totem (StatusTotem), para os dois falarem igual.
export function IconeConexao({ cortada }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 16a5 5 0 0 1 7 0" />
      <path d="M1.5 9a15 15 0 0 1 21 0" />
      <circle cx="12" cy="19.5" r="0.6" fill="currentColor" />
      {cortada && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function AvisoSemInternet() {
  const conexao = useConexao();
  const semInternet = conexao === "sem";

  return (
    <div className="aviso-conexao-regiao" role="status" aria-live="polite">
      {conexao !== "ok" && (
        <div className={`aviso-conexao ${semInternet ? "sem" : "voltou"}`}>
          <div className="container aviso-conexao-inner">
            <IconeConexao cortada={semInternet} />
            {semInternet ? (
              <p>
                <strong>Sem internet neste aparelho.</strong>{" "}
                <span className="aviso-conexao-detalhe">
                  A tela mostra os últimos dados recebidos e se atualiza sozinha
                  quando a conexão voltar.
                </span>
              </p>
            ) : (
              <p>
                <strong>Conexão de volta.</strong> Atualizando os dados.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
