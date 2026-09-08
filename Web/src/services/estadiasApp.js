import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export const TARIFA_MINUTO_FATEC = 0.22;

function arredondarCentavos(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

export function calcularCobrancaEstadiaApp(
  estadia,
  agora = Math.floor(Date.now() / 1000)
) {
  const inicio = Number(estadia?.inicio ?? estadia?.entrada) || agora;
  const ativa = estadia?.status === "ativa";
  const fim = ativa ? agora : Number(estadia?.fim ?? estadia?.saida) || inicio;
  const segundos = Math.max(0, fim - inicio);
  const minutos = ativa
    ? Math.max(1, Math.ceil(segundos / 60))
    : Math.max(0, Number(estadia?.minutosCobrados ?? estadia?.duracaoMinutos) || 0);
  const tarifaMinuto = Number(estadia?.tarifaMinuto) || TARIFA_MINUTO_FATEC;
  const valorTotal = ativa
    ? arredondarCentavos(minutos * tarifaMinuto)
    : arredondarCentavos(estadia?.valorCobrado);
  const valorAntecipado = arredondarCentavos(estadia?.valorAntecipado);
  const valorDescontado = ativa ? valorAntecipado : valorTotal;

  return {
    segundos,
    minutos,
    tarifaMinuto,
    valorTotal,
    valorDescontado,
    valorPendente: arredondarCentavos(
      ativa ? Math.max(0, valorTotal - valorAntecipado) : 0
    ),
  };
}

export async function iniciarEstadiaApp({
  uid,
  placa,
  estacionamentoId,
  vaga,
  modoPagamento,
  tarifaMinuto = TARIFA_MINUTO_FATEC,
}) {
  const numeroVaga = Number(vaga);
  const tarifa = Number(tarifaMinuto);
  if (!uid || !placa || !estacionamentoId || !Number.isInteger(numeroVaga)) {
    throw new Error("Dados da vaga ou do motorista estão incompletos.");
  }
  if (!["agora", "depois"].includes(modoPagamento)) {
    throw new Error("Escolha quando deseja pagar.");
  }
  if (!Number.isFinite(tarifa) || tarifa <= 0) {
    throw new Error("A tarifa por minuto deste estacionamento é inválida.");
  }

  const veiculoRef = doc(db, "veiculos", placa);
  const estadiaRef = doc(db, "estadiasApp", uid);
  const historicoRef = doc(collection(db, "historico"));
  const vagaRef = doc(
    db,
    "catalogoEstacionamentos",
    estacionamentoId,
    "vagas",
    String(numeroVaga)
  );
  const inicio = Math.floor(Date.now() / 1000);
  const antecipado = modoPagamento === "agora" ? tarifa : 0;

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
    if (saldo < tarifa) {
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
      historicoId: historicoRef.id,
      inicio,
      tarifaMinuto: tarifa,
      modoPagamento,
      valorAntecipado: antecipado,
      status: "ativa",
      criadoEm: serverTimestamp(),
    });
    transacao.set(historicoRef, {
      origem: "aplicativo",
      ownerUid: uid,
      placa,
      estacionamentoId,
      vaga: numeroVaga,
      entrada: inicio,
      saida: 0,
      duracaoMinutos: 0,
      tarifaMinuto: tarifa,
      modoPagamento,
      valorAntecipado: antecipado,
      valorCobrado: antecipado,
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
    if (estadia.historicoId) {
      const historicoRef = doc(db, "historico", estadia.historicoId);
      transacao.update(historicoRef, {
        status: "finalizada",
        saida: fim,
        duracaoMinutos: minutos,
        valorCobrado: valorTotal,
        valorDebitadoNaSaida: valorRestante,
        finalizadoEm: serverTimestamp(),
      });
    }
    transacao.set(vagaRef, { reservada: false }, { merge: true });
    resumo = { minutos, valorTotal, saldoFinal: arredondarCentavos(saldo - valorRestante) };
  });

  return resumo;
}
