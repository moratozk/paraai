// Tipos compartilhados pelos mapas administrativo, operacional e público.
// "idoso" permanece como identificador interno para compatibilidade, mas a
// interface usa a sinalização mais direta "60+".
export const TIPOS_VAGA = {
  comum: { tipo: "comum", rotulo: "Comum", icone: "P" },
  pcd: { tipo: "pcd", rotulo: "PCD", icone: "♿" },
  idoso: { tipo: "idoso", rotulo: "60+", icone: "60+" },
  gestante: { tipo: "gestante", rotulo: "Gestante", icone: "G" },
};

export const TIPOS_VAGA_EDITAVEIS = Object.values(TIPOS_VAGA);

// Distribuição original da demonstração FATEC. É usada como fallback enquanto
// uma vaga ainda não possui o campo "tipo" persistido no Firestore. A mesma
// tabela está em firmware/totem/LogicaTotem.h (tipoVagaPorPadrao) e em
// firebase/firestore.rules (tipoDaVaga): mude as três juntas, senão o totem
// entrega como comum uma vaga especial ou a reserva valida outro tipo.
export const VAGAS_ESPECIAIS = {
  1: TIPOS_VAGA.pcd,
  2: TIPOS_VAGA.pcd,
  9: TIPOS_VAGA.idoso,
  10: TIPOS_VAGA.gestante,
  11: TIPOS_VAGA.idoso,
};

export function tipoVagaValido(tipo) {
  return Object.prototype.hasOwnProperty.call(TIPOS_VAGA, tipo);
}

export function obterTipoVaga(tipo, numero) {
  if (tipoVagaValido(tipo)) return TIPOS_VAGA[tipo];
  return VAGAS_ESPECIAIS[Number(numero)] || TIPOS_VAGA.comum;
}

// Direito a vaga especial que o motorista declara no cadastro ou no Perfil
// (autodeclaração). Vai para a conta e para o veículo, que é o que o totem
// lê para escolher a vaga. "" = não precisa de vaga especial.
export const DIREITOS_VAGA = [
  { valor: "", rotulo: "Não preciso" },
  { valor: "pcd", rotulo: "PCD (pessoa com deficiência)" },
  { valor: "idoso", rotulo: "60+ (pessoa idosa)" },
  { valor: "gestante", rotulo: "Gestante" },
];

export function direitoVagaValido(valor) {
  return DIREITOS_VAGA.some((direito) => direito.valor === valor);
}

export function rotuloDireito(valor) {
  return DIREITOS_VAGA.find((direito) => direito.valor === (valor || ""))?.rotulo || "Não preciso";
}
