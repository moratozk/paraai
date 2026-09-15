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
// uma vaga ainda não possui o campo "tipo" persistido no Firestore.
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
