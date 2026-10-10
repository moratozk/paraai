// =========================================================================
// Estadias de uma placa para quem é dono dela agora. Quando um dono anterior
// exclui a conta, a placa fica livre e guarda o momento da liberação
// (veiculos/{placa}.historicoDesde). Quem cadastra a placa depois só lê as
// estadias a partir dali: as regras do Firestore exigem esse limite na
// consulta, que usa o índice placa + entrada (firebase/firestore.indexes.json).
// =========================================================================

import { collection, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// Primeiro segundo que a conta atual pode ver (0 = sem limite). Arredonda
// para cima, como as regras: nada de antes da liberação entra.
export function inicioDoHistorico(veiculo) {
  const desde = veiculo?.historicoDesde;
  if (!desde || typeof desde.seconds !== "number") return 0;
  return desde.seconds + (desde.nanoseconds > 0 ? 1 : 0);
}

export function consultaHistoricoDaPlaca(placa, desde = 0) {
  const filtros = [where("placa", "==", placa)];
  if (desde > 0) filtros.push(where("entrada", ">=", desde));
  return query(collection(db, "historico"), ...filtros);
}
