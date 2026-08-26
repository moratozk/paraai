// =========================================================================
// Serviços de veículo: ligação entre a conta do usuário (Firebase Auth)
// e o documento veiculos/{PLACA} que o totem ESP32 consulta.
// =========================================================================

import {
  doc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// Cadastra (ou reivindica) a placa para o usuário logado.
// Cria o documento no formato exato que o firmware espera encontrar:
// ativo/vagaAtual/horaEntrada/saldo. Campos extras (ownerUid etc.) são
// ignorados pelo totem, servem só ao painel.
export async function registrarVeiculo({ uid, nome, placa }) {
  const ref = doc(db, "veiculos", placa);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data() : {};

  if (atual.ownerUid && atual.ownerUid !== uid) {
    throw new Error("Esta placa já está vinculada a outra conta.");
  }

  // As duas referências precisam ficar consistentes: o veículo aponta para
  // o dono e o perfil aponta para a placa. Um batch evita salvar só metade
  // do vínculo se a rede cair entre uma escrita e outra.
  const batch = writeBatch(db);

  if (!snap.exists()) {
    batch.set(ref, {
      ativo: atual.ativo ?? true,
      vagaAtual: atual.vagaAtual ?? 0,
      horaEntrada: atual.horaEntrada ?? 0,
      saldo: atual.saldo ?? 0,
      estacionamentoId: "",
      tarifaHoraEntrada: 0,
      ownerUid: uid,
      ownerNome: String(nome || ""),
      atualizadoEm: serverTimestamp(),
    });
  } else {
    // Veículos criados pelo totem ainda não têm ownerUid. Ao reivindicá-los,
    // alteramos somente os campos que as regras permitem para esse caso.
    // Também não reescrevemos os dados de uma estadia que possa estar aberta.
    batch.update(ref, {
      ownerUid: uid,
      ownerNome: String(nome || ""),
      atualizadoEm: serverTimestamp(),
    });
  }

  batch.set(doc(db, "users", uid), { placa }, { merge: true });
  await batch.commit();
}

// Recarga de saldo (simulada - não há gateway de pagamento; o valor é
// creditado diretamente, para fins de demonstração do TCC).
export async function adicionarSaldo(placa, valor) {
  if (!(valor > 0)) throw new Error("Valor de recarga inválido.");
  await updateDoc(doc(db, "veiculos", placa), {
    saldo: increment(valor),
    atualizadoEm: serverTimestamp(),
  });
}
