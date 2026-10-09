// =========================================================================
// Hooks de dados em TEMPO REAL (onSnapshot) sobre o modelo multi-tenant:
//
//   estacionamentos/{id}            info + heartbeat do totem
//   catalogoEstacionamentos/{id}     dados seguros exibidos aos motoristas
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
// Catálogo da rede para motoristas. Fica separado do documento operacional
// para não expor proprietário, pareamento ou configurações internas.
// ---------------------------------------------------------------------
export function useCatalogoEstacionamentos() {
  const [estado, setEstado] = useState({ itens: [], loading: true, erro: "" });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "catalogoEstacionamentos"),
      (snap) => {
        const itens = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        itens.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
        setEstado({ itens, loading: false, erro: "" });
      },
      (err) => {
        console.error("[catalogo-estacionamentos] erro no listener:", err);
        setEstado({
          itens: [],
          loading: false,
          erro: "Não foi possível carregar os estacionamentos agora.",
        });
      }
    );

    return unsub;
  }, []);

  return {
    estacionamentos: estado.itens,
    loading: estado.loading,
    erro: estado.erro,
  };
}

export function useEstacionamentoPublico(estId) {
  const [snapState, setSnapState] = useState({ id: null, dados: null });

  useEffect(() => {
    if (!estId) return undefined;
    return onSnapshot(
      doc(db, "catalogoEstacionamentos", estId),
      (snap) =>
        setSnapState({ id: estId, dados: snap.exists() ? snap.data() : null }),
      (err) => {
        console.error("[estacionamento-publico] erro no listener:", err);
        setSnapState({ id: estId, dados: null });
      }
    );
  }, [estId]);

  if (!estId) return { estacionamento: null, loading: false };
  const atualizado = snapState.id === estId;
  return {
    estacionamento: atualizado
      ? snapState.dados && { id: estId, ...snapState.dados }
      : null,
    loading: !atualizado,
  };
}

export function useEstacionamentosAdmin() {
  const [estado, setEstado] = useState({ itens: [], loading: true, erro: "" });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "estacionamentos"),
      (snap) => {
        const itens = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        itens.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
        setEstado({ itens, loading: false, erro: "" });
      },
      (err) => {
        console.error("[admin-estacionamentos] erro no listener:", err);
        setEstado({
          itens: [],
          loading: false,
          erro: "Não foi possível carregar os estacionamentos.",
        });
      }
    );
    return unsub;
  }, []);

  return {
    estacionamentos: estado.itens,
    loading: estado.loading,
    erro: estado.erro,
  };
}

// Relógio em segundos para reservas vencerem na tela sem recarregar.
export function useAgora(intervaloMs = 15000) {
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

// Estado seguro das vagas exibidas no mapa do motorista. A projeção pública
// tem só ocupação, reserva e tipo; placas continuam restritas ao operador.
export function useVagasPublicas(estId, numVagas = TOTAL_VAGAS) {
  const [snapState, setSnapState] = useState({ id: null, docs: {}, erro: "" });
  const agora = useAgora();

  useEffect(() => {
    if (!estId) return undefined;
    return onSnapshot(
      collection(db, "catalogoEstacionamentos", estId, "vagas"),
      (snap) => {
        const porId = {};
        snap.forEach((vaga) => {
          porId[vaga.id] = vaga.data();
        });
        setSnapState({ id: estId, docs: porId, erro: "" });
      },
      (err) => {
        console.error("[vagas-publicas] erro no listener:", err);
        setSnapState({
          id: estId,
          docs: {},
          erro: "Não foi possível carregar as vagas agora.",
        });
      }
    );
  }, [estId]);

  const atualizado = snapState.id === estId;
  const total = Math.max(1, Number(numVagas) || TOTAL_VAGAS);
  const vagas = useMemo(
    () =>
      Array.from({ length: total }, (_, indice) => {
        const id = String(indice + 1);
        const dados = atualizado ? snapState.docs[id] : undefined;
        const ocupadaFisica = Boolean(dados?.ocupada);
        const reservadaAte = Number(dados?.reservadaAte) || 0;
        const reservada = !ocupadaFisica && reservadaAte > agora;
        return {
          id,
          numero: indice + 1,
          // Indisponível para escolha: ocupada pelo totem ou reservada.
          ocupada: ocupadaFisica || reservada,
          ocupadaFisica,
          reservada,
          reservadaAte,
          // Sem documento publicado a vaga aparece livre, mas não aceita reserva.
          publicada: Boolean(dados),
          tipo: dados?.tipo || "",
        };
      }),
    [atualizado, snapState.docs, total, agora]
  );

  return {
    vagas,
    loading: Boolean(estId) && !atualizado,
    erro: atualizado ? snapState.erro : "",
  };
}

// Reserva do motorista feita pelo app (uma por conta).
export function useReserva(uid) {
  const [snapState, setSnapState] = useState({ uid: null, reserva: null });

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, "reservas", uid),
      (snap) =>
        setSnapState({
          uid,
          reserva: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        }),
      (err) => {
        console.error("[reserva] erro no listener:", err);
        setSnapState({ uid, reserva: null });
      }
    );
  }, [uid]);

  const atualizado = snapState.uid === uid;
  return {
    reserva: atualizado ? snapState.reserva : null,
    loading: Boolean(uid) && !atualizado,
  };
}

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
        const placa = data.placa || "";
        return {
          id,
          numero: i + 1,
          ocupada: Boolean(data.ocupada),
          placa,
          tipo: data.tipo || "",
          // Copiados do veículo pelo totem na entrada (vazios no firmware antigo).
          modelo: placa ? data.modelo || "" : "",
          cor: placa ? data.cor || "" : "",
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
        itens.sort(
          (a, b) =>
            (Number(b.saida) || Number(b.entrada) || 0) -
            (Number(a.saida) || Number(a.entrada) || 0)
        );
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
