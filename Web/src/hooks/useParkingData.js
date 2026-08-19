// =========================================================================
// Hooks de dados em TEMPO REAL (onSnapshot) sobre o modelo multi-tenant:
//
//   estacionamentos/{id}            info + heartbeat do totem
//   estacionamentos/{id}/vagas/{n}  ocupação vaga a vaga
//   veiculos/{PLACA}                carteira única do motorista (global)
//   historico/{id}                  movimentações (campo estacionamentoId)
// =========================================================================

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { TOTAL_VAGAS, TOTEM_OFFLINE_APOS_SEGUNDOS } from "../utils/constants";

// ---------------------------------------------------------------------
// Estacionamento (info + status do totem via heartbeat no mesmo doc)
// ---------------------------------------------------------------------
export function useEstacionamento(estId) {
  const [snapState, setSnapState] = useState({ id: null, dados: null });
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!estId) return undefined;
    const unsub = onSnapshot(
      doc(db, "estacionamentos", estId),
      (snap) => setSnapState({ id: estId, dados: snap.exists() ? snap.data() : null }),
      (err) => {
        console.error("[estacionamento] erro no listener:", err);
        setSnapState({ id: estId, dados: null });
      }
    );
    const timer = setInterval(
      () => setAgora(Math.floor(Date.now() / 1000)),
      30000
    );
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [estId]);

  if (!estId) return { estacionamento: null, online: false, loading: false };

  const atualizado = snapState.id === estId;
  const dados = atualizado ? snapState.dados : null;
  const ultimaAtualizacao = Number(dados?.ultimaAtualizacao) || 0;
  const online =
    ultimaAtualizacao > 0 &&
    agora - ultimaAtualizacao < TOTEM_OFFLINE_APOS_SEGUNDOS;

  return {
    estacionamento: dados ? { id: estId, ...dados } : null,
    online,
    loading: !atualizado,
  };
}

// ---------------------------------------------------------------------
// Estacionamentos da rede. Motoristas podem ler os dados públicos do
// estabelecimento, mas não as vagas internas nem os dados de outros usuários.
// ---------------------------------------------------------------------
export function useEstacionamentos() {
  const [snapState, setSnapState] = useState({ carregado: false, itens: [] });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "estacionamentos"),
      (snap) => {
        const itens = [];
        snap.forEach((d) => itens.push({ id: d.id, ...d.data() }));
        itens.sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
        );
        setSnapState({ carregado: true, itens });
      },
      (err) => {
        console.error("[estacionamentos] erro no listener:", err);
        setSnapState({ carregado: true, itens: [] });
      }
    );
    return unsub;
  }, []);

  return { estacionamentos: snapState.itens, loading: !snapState.carregado };
}

// ---------------------------------------------------------------------
// Vagas de um estacionamento - sempre retorna numVagas itens, mesmo que
// o totem ainda não tenha criado algum documento (aparece como livre).
// ---------------------------------------------------------------------
export function useVagas(estId, numVagas = TOTAL_VAGAS) {
  const [snapState, setSnapState] = useState({ id: null, docs: {} });

  useEffect(() => {
    if (!estId) return undefined;
    const unsub = onSnapshot(
      collection(db, "estacionamentos", estId, "vagas"),
      (snap) => {
        const porId = {};
        snap.forEach((d) => {
          porId[d.id] = d.data();
        });
        setSnapState({ id: estId, docs: porId });
      },
      (err) => {
        console.error("[vagas] erro no listener:", err);
        setSnapState({ id: estId, docs: {} });
      }
    );
    return unsub;
  }, [estId]);

  const atualizado = snapState.id === estId;
  const total = Math.max(1, Number(numVagas) || TOTAL_VAGAS);

  const vagas = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => {
        const id = String(i + 1);
        const data = (atualizado && snapState.docs[id]) || {};
        return {
          id,
          numero: i + 1,
          ocupada: Boolean(data.ocupada),
          placa: data.placa || "",
        };
      }),
    [snapState, atualizado, total]
  );

  return { vagas, loading: Boolean(estId) && !atualizado };
}

// ---------------------------------------------------------------------
// Veículo do motorista (veiculos/{PLACA} - global, carteira única)
// ---------------------------------------------------------------------
export function useVeiculo(placa) {
  const [snapState, setSnapState] = useState({ placa: null, veiculo: null });

  useEffect(() => {
    if (!placa) return undefined;
    const unsub = onSnapshot(
      doc(db, "veiculos", placa),
      (snap) => {
        setSnapState({
          placa,
          veiculo: snap.exists() ? { placa, ...snap.data() } : null,
        });
      },
      (err) => {
        console.error("[veiculo] erro no listener:", err);
        setSnapState({ placa, veiculo: null });
      }
    );
    return unsub;
  }, [placa]);

  if (!placa) return { veiculo: null, loading: false };
  const atualizado = snapState.placa === placa;
  return {
    veiculo: atualizado ? snapState.veiculo : null,
    loading: !atualizado,
  };
}

// ---------------------------------------------------------------------
// Histórico - filtrado por placa (motorista) ou estacionamento (operador).
// Ordenado no cliente (mais recente primeiro) pra dispensar índice composto.
// ---------------------------------------------------------------------
function useHistoricoPorCampo(campo, valor) {
  const [snapState, setSnapState] = useState({ chave: null, itens: [] });

  useEffect(() => {
    if (!valor) return undefined;
    const q = query(collection(db, "historico"), where(campo, "==", valor));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const itens = [];
        snap.forEach((d) => itens.push({ id: d.id, ...d.data() }));
        itens.sort((a, b) => (Number(b.saida) || 0) - (Number(a.saida) || 0));
        setSnapState({ chave: valor, itens });
      },
      (err) => {
        console.error(`[historico:${campo}] erro no listener:`, err);
        setSnapState({ chave: valor, itens: [] });
      }
    );
    return unsub;
  }, [campo, valor]);

  if (!valor) return { historico: [], loading: false };
  const atualizado = snapState.chave === valor;
  return {
    historico: atualizado ? snapState.itens : [],
    loading: !atualizado,
  };
}

export function useHistoricoPlaca(placa) {
  return useHistoricoPorCampo("placa", placa);
}

export function useHistoricoEstacionamento(estId) {
  return useHistoricoPorCampo("estacionamentoId", estId);
}
