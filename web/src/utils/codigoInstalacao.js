// Código de instalação do totem. O site gera, o totem recebe pelo teclado da
// tela e as regras conferem o mesmo formato (contratos/codigos-instalacao.csv):
// oito caracteres sem I, O, 0 e 1, que se confundem na tela pequena.
export const ALFABETO_CODIGO_INSTALACAO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TAMANHO_CODIGO_INSTALACAO = 8;
// Prazo do código, o mesmo das regras.
export const VALIDADE_CODIGO_MINUTOS = 15;

const FORMATO = /^[A-HJ-NP-Z2-9]{8}$/;

export function codigoInstalacaoValido(codigo) {
  return typeof codigo === "string" && FORMATO.test(codigo);
}

// 32 caracteres: o resto de um byte aleatório por 32 não favorece nenhum.
export function gerarCodigoInstalacao() {
  const bytes = new Uint8Array(TAMANHO_CODIGO_INSTALACAO);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALFABETO_CODIGO_INSTALACAO[byte % 32]).join("");
}

// "K7M2 Q9XZ": em duas partes, mais fácil de ler e de digitar no totem.
export function formatarCodigoInstalacao(codigo) {
  return `${codigo.slice(0, 4)} ${codigo.slice(4)}`;
}

// Milissegundos que faltam para o código vencer (0 se já venceu).
export function restanteDoCodigo(criadoEmMs, agoraMs) {
  return Math.max(0, criadoEmMs + VALIDADE_CODIGO_MINUTOS * 60000 - agoraMs);
}
