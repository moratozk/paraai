// =========================================================================
// Hooks de dados em TEMPO REAL (onSnapshot) sobre o modelo multi-tenant:
//
//   estacionamentos/{id}            info + heartbeat do totem
//   catalogoEstacionamentos/{id}     dados seguros exibidos aos motoristas
//   estacionamentos/{id}/vagas/{n}  ocupação vaga a vaga
//   veiculos/{PLACA}                carteira única do motorista (global)
//   veiculos/{PLACA}/recargas/{id}  recargas simuladas (extrato)
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
import { consultaHistoricoDaPlaca, inicioDoHistorico } from "../services/historico";
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
// A exceção é a placa reivindicada depois que o dono anterior excluiu a
// conta: ela traz o limite "desde" (services/historico.js).
// ---------------------------------------------------------------------
function useHistoricoPorCampo(campo, valor, desde = 0) {
  const [snapState, setSnapState] = useState({ chave: null, itens: [] });
  const chave = valor ? `${valor}|${desde}` : null;

  useEffect(() => {
    if (!valor) return undefined;
    const q =
      campo === "placa"
        ? consultaHistoricoDaPlaca(valor, desde)
        : query(collection(db, "historico"), where(campo, "==", valor));
    let unsub = () => {};
    let timer = null;
    let tentativas = 0;
    // Logo depois de cadastrar a placa, a consulta pode chegar ao servidor
    // antes do veículo, e as regras ainda não reconhecem o dono. Tentar de
    // novo algumas vezes antes de desistir.
    const ouvir = () => {
      unsub = onSnapshot(
        q,
        (snap) => {
          const itens = [];
          snap.forEach((d) => itens.push({ id: d.id, ...d.data() }));
          itens.sort(
            (a, b) =>
              (Number(b.saida) || Number(b.entrada) || 0) -
              (Number(a.saida) || Number(a.entrada) || 0)
          );
          setSnapState({ chave: `${valor}|${desde}`, itens });
        },
        (err) => {
          if (err?.code === "permission-denied" && tentativas < 3) {
            tentativas += 1;
            timer = setTimeout(ouvir, 1000 * tentativas);
            return;
          }
          console.error(`[historico:${campo}] erro no listener:`, err);
          setSnapState({ chave: `${valor}|${desde}`, itens: [] });
        }
      );
    };
    ouvir();
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [campo, valor, desde]);

  if (!valor) return { historico: [], loading: false };
  const atualizado = snapState.chave === chave;
  return {
    historico: atualizado ? snapState.itens : [],
    loading: !atualizado,
  };
}

// O limite vem do veículo: a consulta espera ele carregar, para não pedir
// uma que as regras recusariam numa placa reivindicada.
export function useHistoricoPlaca(placa) {
  const { veiculo, loading: carregandoVeiculo } = useVeiculo(placa);
  const resultado = useHistoricoPorCampo(
    "placa",
    carregandoVeiculo ? null : placa,
    inicioDoHistorico(veiculo)
  );
  if (placa && carregandoVeiculo) return { historico: [], loading: true };
  return resultado;
}

export function useHistoricoEstacionamento(estId) {
  return useHistoricoPorCampo("estacionamentoId", estId);
}

// ---------------------------------------------------------------------
// Painel da rede (administrador): todas as estadias, todos os totens e a
// ocupação de cada estacionamento. As regras só liberam a coleção inteira
// para a conta admin; para as outras, ativo fica falso e nada é consultado.
// ---------------------------------------------------------------------
export function useHistoricoRede(ativo) {
  const [estado, setEstado] = useState({ itens: [], loading: true, erro: "" });

  useEffect(() => {
    if (!ativo) return undefined;
    return onSnapshot(
      collection(db, "historico"),
      (snap) => {
        const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        itens.sort((a, b) => (Number(b.saida) || 0) - (Number(a.saida) || 0));
        setEstado({ itens, loading: false, erro: "" });
      },
      (err) => {
        console.error("[historico-rede] erro no listener:", err);
        setEstado({
          itens: [],
          loading: false,
          erro: "Não foi possível carregar as movimentações da rede.",
        });
      }
    );
  }, [ativo]);

  if (!ativo) return { historico: [], loading: false, erro: "" };
  return { historico: estado.itens, loading: estado.loading, erro: estado.erro };
}

export function useTotensRede(ativo) {
  const [estado, setEstado] = useState({ itens: [], loading: true, erro: "" });

  useEffect(() => {
    if (!ativo) return undefined;
    return onSnapshot(
      collection(db, "totems"),
      (snap) => {
        const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        itens.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
        setEstado({ itens, loading: false, erro: "" });
      },
      (err) => {
        console.error("[totens-rede] erro no listener:", err);
        setEstado({
          itens: [],
          loading: false,
          erro: "Não foi possível consultar os totens da rede.",
        });
      }
    );
  }, [ativo]);

  if (!ativo) return { totens: [], loading: false, erro: "" };
  return { totens: estado.itens, loading: estado.loading, erro: estado.erro };
}

// Vagas ocupadas agora em cada estacionamento, contando só as vagas dentro
// da capacidade atual (como useVagas). Uma escuta por estacionamento.
export function useOcupacaoRede(estacionamentos) {
  const chave = estacionamentos
    .map((item) => `${item.id}:${Math.max(1, Number(item.numVagas) || TOTAL_VAGAS)}`)
    .join("|");
  const [ocupadas, setOcupadas] = useState({});

  useEffect(() => {
    if (!chave) return undefined;
    const cancelar = chave.split("|").map((parte) => {
      const separador = parte.lastIndexOf(":");
      const estId = parte.slice(0, separador);
      const total = Number(parte.slice(separador + 1));
      return onSnapshot(
        collection(db, "estacionamentos", estId, "vagas"),
        (snap) => {
          let quantas = 0;
          snap.forEach((d) => {
            const numero = Number(d.id);
            if (d.data().ocupada && numero >= 1 && numero <= total) quantas += 1;
          });
          setOcupadas((atual) => ({ ...atual, [estId]: quantas }));
        },
        (err) => {
          console.error(`[ocupacao-rede:${estId}] erro no listener:`, err);
          setOcupadas((atual) => ({ ...atual, [estId]: null }));
        }
      );
    });
    return () => cancelar.forEach((fn) => fn());
  }, [chave]);

  return ocupadas;
}

// ---------------------------------------------------------------------
// Recargas simuladas da carteira, para o extrato. As regras só deixam ler
// as recargas da própria conta, então a consulta filtra pelo uid. A ordem
// vem do cliente, como no histórico; a data de uma recarga ainda pendente
// de confirmação é a estimada pelo navegador.
// ---------------------------------------------------------------------
export function useRecargas(uid, placa) {
  const chave = uid && placa ? `${uid}/${placa}` : null;
  const [snapState, setSnapState] = useState({ chave: null, itens: [], erro: "" });

  useEffect(() => {
    if (!uid || !placa) return undefined;
    const q = query(
      collection(db, "veiculos", placa, "recargas"),
      where("uid", "==", uid)
    );
    return onSnapshot(
      q,
      (snap) => {
        const itens = snap.docs.map((d) => {
          const dados = d.data({ serverTimestamps: "estimate" });
          return { id: d.id, ...dados, quando: dados.criadaEm?.seconds || 0 };
        });
        itens.sort((a, b) => b.quando - a.quando);
        setSnapState({ chave: `${uid}/${placa}`, itens, erro: "" });
      },
      (err) => {
        console.error("[recargas] erro no listener:", err);
        setSnapState({
          chave: `${uid}/${placa}`,
          itens: [],
          erro: "Não foi possível carregar as recargas agora.",
        });
      }
    );
  }, [uid, placa]);

  if (!chave) return { recargas: [], loading: false, erro: "" };
  const atualizado = snapState.chave === chave;
  return {
    recargas: atualizado ? snapState.itens : [],
    loading: !atualizado,
    erro: atualizado ? snapState.erro : "",
  };
}
