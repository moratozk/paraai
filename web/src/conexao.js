import { useSyncExternalStore } from "react";

// Internet deste aparelho. O navegador avisa quando a conexão cai e quando
// volta; enquanto isso, o Firebase continua mostrando os últimos dados que
// recebeu. As telas usam isto para dizer que quem está sem sinal é o
// aparelho, e não acusar o totem de ter parado.
//
// Estados: "ok", "sem" (sem internet) e "voltou" (alguns segundos depois de
// a conexão voltar, enquanto os dados se atualizam).
const AVISO_DE_VOLTA_MS = 4000;
const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

const semConexaoAoAbrir = typeof navigator !== "undefined" && navigator.onLine === false;
let estado = semConexaoAoAbrir ? "sem" : "ok";
// Quando a conexão caiu: os dados na tela valem até aqui.
let caiuEm = semConexaoAoAbrir ? agoraEmSegundos() : 0;
let timer = null;
const ouvintes = new Set();

function mudar(novo) {
  estado = novo;
  ouvintes.forEach((ouvinte) => ouvinte());
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    clearTimeout(timer);
    if (estado !== "sem") caiuEm = agoraEmSegundos();
    mudar("sem");
  });
  window.addEventListener("online", () => {
    if (estado === "ok") return;
    clearTimeout(timer);
    mudar("voltou");
    timer = setTimeout(() => mudar("ok"), AVISO_DE_VOLTA_MS);
  });
}

function assinar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useConexao() {
  return useSyncExternalStore(assinar, () => estado, () => "ok");
}

// Relógio para julgar o último sinal do totem. Sem internet, ele para no
// momento em que a conexão caiu: a tela segue com a última situação que
// recebeu, em vez de dizer, minutos depois, que o totem parou.
export function useRelogioDosDados(agora) {
  const conexao = useConexao();
  return conexao === "ok" ? agora : Math.min(agora, caiuEm);
}
