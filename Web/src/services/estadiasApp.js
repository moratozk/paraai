import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export const TARIFA_MINUTO_FATEC = 0.22;

function arredondarCentavos(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

export async function iniciarEstadiaApp({
  uid,
  placa,
  estacionamentoId,
  vaga,
  modoPagamento,
}) {
  const numeroVaga = Number(vaga);
  if (!uid || !placa || !estacionamentoId || !Number.isInteger(numeroVaga)) {
    throw new Error("Dados da vaga ou do motorista estão incompletos.");
  }
  if (!["agora", "depois"].includes(modoPagamento)) {
    throw new Error("Escolha quando deseja pagar.");
  }

  const veiculoRef = doc(db, "veiculos", placa);
  const estadiaRef = doc(db, "estadiasApp", uid);
  const vagaRef = doc(
    db,
    "catalogoEstacionamentos",
    estacionamentoId,
    "vagas",
    String(numeroVaga)
  );
  const inicio = Math.floor(Date.now() / 1000);
  const antecipado = modoPagamento === "agora" ? TARIFA_MINUTO_FATEC : 0;

  await runTransaction(db, async (transacao) => {
    const [veiculoSnap, estadiaSnap, vagaSnap] = await Promise.all([
      transacao.get(veiculoRef),
      transacao.get(estadiaRef),
      transacao.get(vagaRef),
    ]);

    if (!veiculoSnap.exists() || veiculoSnap.data().ownerUid !== uid) {
      throw new Error("Cadastre uma placa antes de iniciar o estacionamento.");
    }
    if (Number(veiculoSnap.data().vagaAtual) > 0) {
      throw new Error("Seu veículo já possui uma entrada registrada pelo totem.");
    }
    if (estadiaSnap.exists() && estadiaSnap.data().status === "ativa") {
      throw new Error("Você já possui um estacionamento em andamento.");
    }
    if (!vagaSnap.exists() || vagaSnap.data().ocupada || vagaSnap.data().reservada) {
      throw new Error("Esta vaga acabou de ficar indisponível. Escolha outra.");
    }

    const saldo = Number(veiculoSnap.data().saldo) || 0;
    if (saldo < TARIFA_MINUTO_FATEC) {
      throw new Error(
        "Saldo insuficiente. Recarregue ao menos o valor do primeiro minuto."
      );
    }

    transacao.set(estadiaRef, {
      ownerUid: uid,
      placa,
      estacionamentoId,
      vaga: numeroVaga,
      vagaId: String(numeroVaga),
      inicio,
      tarifaMinuto: TARIFA_MINUTO_FATEC,
      modoPagamento,
      valorAntecipado: antecipado,
      status: "ativa",
      criadoEm: serverTimestamp(),
    });
    transacao.set(vagaRef, { reservada: true }, { merge: true });
    if (antecipado > 0) {
      transacao.update(veiculoRef, {
        saldo: arredondarCentavos(saldo - antecipado),
        atualizadoEm: serverTimestamp(),
      });
    }
  });

  return { inicio, valorAntecipado: antecipado };
}

export async function finalizarEstadiaApp({ uid, placa }) {
  if (!uid || !placa) throw new Error("Sessão do motorista inválida.");

  const estadiaRef = doc(db, "estadiasApp", uid);
  const veiculoRef = doc(db, "veiculos", placa);
  const fim = Math.floor(Date.now() / 1000);
  let resumo = null;

  await runTransaction(db, async (transacao) => {
    const [estadiaSnap, veiculoSnap] = await Promise.all([
      transacao.get(estadiaRef),
      transacao.get(veiculoRef),
    ]);
    if (!estadiaSnap.exists() || estadiaSnap.data().status !== "ativa") {
      throw new Error("Nenhum estacionamento pelo aplicativo está em andamento.");
    }
    const estadia = estadiaSnap.data();
    if (estadia.ownerUid !== uid || estadia.placa !== placa) {
      throw new Error("Esta permanência pertence a outra conta.");
    }
    if (!veiculoSnap.exists() || veiculoSnap.data().ownerUid !== uid) {
      throw new Error("Veículo não encontrado para concluir o pagamento.");
    }

    const minutos = Math.max(1, Math.ceil((fim - Number(estadia.inicio)) / 60));
    const valorTotal = arredondarCentavos(
      minutos * Number(estadia.tarifaMinuto || TARIFA_MINUTO_FATEC)
    );
    const valorRestante = arredondarCentavos(
      Math.max(0, valorTotal - Number(estadia.valorAntecipado || 0))
    );
    const saldo = Number(veiculoSnap.data().saldo) || 0;
    if (saldo < valorRestante) {
      throw new Error("Saldo insuficiente. Recarregue para encerrar a permanência.");
    }

    const vagaRef = doc(
      db,
      "catalogoEstacionamentos",
      estadia.estacionamentoId,
      "vagas",
      String(estadia.vaga)
    );
    transacao.update(veiculoRef, {
      saldo: arredondarCentavos(saldo - valorRestante),
      atualizadoEm: serverTimestamp(),
    });
    transacao.update(estadiaRef, {
      status: "finalizada",
      fim,
      minutosCobrados: minutos,
      valorCobrado: valorTotal,
      valorDebitadoNaSaida: valorRestante,
      finalizadoEm: serverTimestamp(),
    });
    transacao.set(vagaRef, { reservada: false }, { merge: true });
    resumo = { minutos, valorTotal, saldoFinal: arredondarCentavos(saldo - valorRestante) };
  });

  return resumo;
}
