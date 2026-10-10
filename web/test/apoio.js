// Leitura dos arquivos do repositório para os testes do site: os casos de
// contratos/ e as fontes do totem e das regras, que os contratos comparam.
import { readFileSync } from "node:fs";

const RAIZ = new URL("../../", import.meta.url);

export function lerArquivo(caminho) {
  return readFileSync(new URL(caminho, RAIZ), "utf8");
}

// CSV simples (vírgula, sem aspas), com cabeçalho e comentários em "#".
export function lerCsv(nome) {
  const linhas = lerArquivo(`contratos/${nome}`)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith("#"));
  const [cabecalho, ...dados] = linhas;
  const campos = cabecalho.split(",");
  return dados.map((linha) =>
    Object.fromEntries(linha.split(",").map((valor, i) => [campos[i], valor]))
  );
}
