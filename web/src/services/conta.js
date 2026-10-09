// =========================================================================
// Privacidade (LGPD): cópia dos dados da conta e exclusão pelo motorista.
// A política fica em pages/Privacidade.jsx; o que as regras deixam apagar,
// em firebase/firestore.rules (liberacaoDaPlacaValida e vizinhas).
// =========================================================================

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { consultaHistoricoDaPlaca, inicioDoHistorico } from "./historico";
import { cancelarReserva } from "./reservas";

// Data da versão da política. Mudou o texto de um jeito que importa para quem
// já tem conta? Troque a data: o cadastro grava a versão aceita.
export const VERSAO_PRIVACIDADE = "2026-10-09";

// O que impede excluir a conta agora. Estadia aberta e dívida não somem com
// a conta (as regras recusam), então a tela explica antes de pedir a senha.
export function impedimentoParaExcluir(veiculo) {
  if (!veiculo) return null;
  if (Number(veiculo.vagaAtual) > 0 || veiculo.estacionamentoId) return "estacionado";
  if (Number(veiculo.saldo) <= -0.005) return "pendencia";
  return null;
}

// Veículo da placa, só se for desta conta. Placa de outra conta não é lida
// (as regras recusam) e conta como "sem veículo".
async function veiculoDaConta(placa, uid) {
  try {
    const snap = await getDoc(doc(db, "veiculos", placa));
    return snap.exists() && snap.data().ownerUid === uid ? snap.data() : null;
  } catch (err) {
    console.error("Falha ao ler o veículo da conta:", err);
    return null;
  }
}

// Folga abaixo do limite de escritas de um lote: o extrato inteiro costuma
// caber no primeiro, junto com o perfil, a placa e a reserva.
const ESCRITAS_POR_LOTE = 450;

// Apaga do Firestore o que é do motorista. A placa fica livre (sem saldo,
// modelo, cor ou vaga especial, e com o limite do histórico para o próximo
// dono); o extrato, a reserva e o perfil saem no mesmo lote. Uma reserva
// ativa é cancelada antes, para a vaga voltar ao mapa. O acesso (login) é
// apagado depois, em AuthContext.excluirConta.
export async function apagarDadosDoMotorista(uid) {
  const perfilRef = doc(db, "users", uid);
  const perfil = await getDoc(perfilRef);
  // Uma tentativa anterior já apagou o perfil: só falta encerrar o acesso.
  if (!perfil.exists()) return;
  const dados = perfil.data();
  if ((dados.role || "motorista") !== "motorista" || dados.estacionamentoId) {
    throw new Error("Esta conta é encerrada pela administração da rede.");
  }

  // Primeiro o que impede a exclusão, para não cancelar a reserva à toa.
  const placa = typeof dados.placa === "string" ? dados.placa : "";
  const veiculo = placa ? await veiculoDaConta(placa, uid) : null;
  const motivo = impedimentoParaExcluir(veiculo);
  if (motivo === "estacionado") {
    throw new Error("Seu carro está estacionado. Registre a saída no totem antes de excluir a conta.");
  }
  if (motivo === "pendencia") {
    throw new Error("Regularize a pendência do saldo antes de excluir a conta.");
  }

  const reservaRef = doc(db, "reservas", uid);
  const reserva = await getDoc(reservaRef);
  if (reserva.exists() && reserva.data().status === "ativa") {
    await cancelarReserva({ uid, reserva: reserva.data() });
  }

  let recargas = [];
  if (veiculo) {
    const extrato = await getDocs(
      query(collection(db, "veiculos", placa, "recargas"), where("uid", "==", uid))
    );
    recargas = extrato.docs.map((item) => item.ref);
  }

  const lote = writeBatch(db);
  if (veiculo) {
    lote.update(doc(db, "veiculos", placa), {
      ownerUid: "",
      saldo: 0,
      historicoDesde: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      ownerNome: deleteField(),
      marca: deleteField(),
      modelo: deleteField(),
      cor: deleteField(),
      vagaEspecial: deleteField(),
      ultimaRecarga: deleteField(),
    });
  }
  recargas.slice(0, ESCRITAS_POR_LOTE).forEach((ref) => lote.delete(ref));
  if (reserva.exists()) lote.delete(reservaRef);
  lote.delete(perfilRef);
  await lote.commit();

  // Extrato muito longo: o resto sai depois, com a placa já liberada.
  for (let inicio = ESCRITAS_POR_LOTE; inicio < recargas.length; inicio += ESCRITAS_POR_LOTE) {
    const resto = writeBatch(db);
    recargas.slice(inicio, inicio + ESCRITAS_POR_LOTE).forEach((ref) => resto.delete(ref));
    await resto.commit();
  }
}

// ---------------------------------------------------------------------
// Cópia dos dados ("Baixar meus dados"): um arquivo JSON com tudo o que o
// ParaAí guarda sobre a conta, com as datas em texto legível.
// ---------------------------------------------------------------------

// Data e hora no fuso do aparelho, em ISO 8601 (2026-10-09T14:30:00-03:00).
function dataIso(ms) {
  const data = new Date(ms);
  if (!Number.isFinite(data.getTime())) return null;
  const dois = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const fuso = -data.getTimezoneOffset();
  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}` +
    `T${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}` +
    `${fuso >= 0 ? "+" : "-"}${dois(fuso / 60)}:${dois(fuso % 60)}`
  );
}

// Horários que o totem e a reserva gravam em segundos.
const EM_SEGUNDOS = new Set(["horaEntrada", "entrada", "saida", "criadaEm", "expiraEm"]);

function legivel(dados) {
  return Object.fromEntries(
    Object.entries(dados || {}).map(([campo, valor]) => {
      if (valor && typeof valor.toMillis === "function") return [campo, dataIso(valor.toMillis())];
      if (EM_SEGUNDOS.has(campo) && typeof valor === "number") {
        return [campo, valor > 0 ? dataIso(valor * 1000) : null];
      }
      return [campo, valor];
    })
  );
}

async function nomesDosEstacionamentos(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const pares = await Promise.all(
    unicos.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, "catalogoEstacionamentos", id));
        return [id, snap.exists() ? snap.data().nome || null : null];
      } catch {
        return [id, null];
      }
    })
  );
  return Object.fromEntries(pares);
}

// Cadastro do estacionamento do dono, sem o que é credencial dos totens.
const CAMPOS_DO_ESTACIONAMENTO = [
  "nome",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "numVagas",
  "tarifaHora",
  "ativo",
  "criadoEm",
];

export async function copiaDosDados(user) {
  const uid = user.uid;
  const perfilSnap = await getDoc(doc(db, "users", uid));
  const perfil = perfilSnap.exists() ? perfilSnap.data() : {};
  const role = perfil.role || (perfil.estacionamentoId ? "operador" : "motorista");
  const momento = (texto) => (texto ? dataIso(Date.parse(texto)) : null);

  const copia = {
    sobre:
      "Cópia dos dados pessoais que o ParaAí guarda sobre a sua conta (LGPD, art. 18). " +
      "A recarga do ParaAí é simulada, sem pagamento real.",
    geradaEm: dataIso(Date.now()),
    conta: {
      email: user.email || null,
      emailConfirmado: Boolean(user.emailVerified),
      criadaEm: momento(user.metadata?.creationTime),
      ultimoAcesso: momento(user.metadata?.lastSignInTime),
    },
    perfil: legivel(perfil),
  };

  if (role === "motorista") {
    const placa = typeof perfil.placa === "string" ? perfil.placa : "";
    const veiculo = placa ? await veiculoDaConta(placa, uid) : null;
    if (veiculo) {
      const [extrato, estadias] = await Promise.all([
        getDocs(query(collection(db, "veiculos", placa, "recargas"), where("uid", "==", uid))),
        getDocs(consultaHistoricoDaPlaca(placa, inicioDoHistorico(veiculo))),
      ]);
      const registros = estadias.docs
        .map((item) => item.data())
        .sort((a, b) => (Number(a.entrada) || 0) - (Number(b.entrada) || 0));
      const nomes = await nomesDosEstacionamentos(registros.map((item) => item.estacionamentoId));
      copia.veiculo = legivel({ placa, ...veiculo });
      copia.recargas = extrato.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.criadaEm?.toMillis?.() || 0) - (b.criadaEm?.toMillis?.() || 0))
        .map(legivel);
      copia.estadias = registros.map((item) =>
        legivel({ estacionamento: nomes[item.estacionamentoId] || null, ...item })
      );
    }
    const reserva = await getDoc(doc(db, "reservas", uid));
    if (reserva.exists()) copia.reserva = legivel(reserva.data());
  }

  if (role === "operador" && perfil.estacionamentoId) {
    try {
      const snap = await getDoc(doc(db, "estacionamentos", perfil.estacionamentoId));
      if (snap.exists()) {
        const dados = snap.data();
        copia.estacionamento = legivel({
          id: snap.id,
          ...Object.fromEntries(
            CAMPOS_DO_ESTACIONAMENTO.filter((campo) => campo in dados).map((campo) => [campo, dados[campo]])
          ),
        });
      }
    } catch (err) {
      console.error("Falha ao ler o estacionamento para a cópia dos dados:", err);
    }
  }

  return copia;
}

export function baixarJson(nomeArquivo, dados) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Alguns navegadores cancelam o download se o endereço some na hora.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function nomeDoArquivoDosDados(data = new Date()) {
  return `paraai-meus-dados-${dataIso(data.getTime()).slice(0, 10)}.json`;
}
