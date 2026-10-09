import { useSyncExternalStore } from "react";

// App instalável: o pedido de instalação do navegador, o service worker
// (public/sw.js) e a recuperação depois de uma publicação nova.

// O Chrome e o Edge avisam com "beforeinstallprompt" quando o site pode virar
// app. O aviso pode chegar antes de a tela montar, então fica guardado aqui
// e o menu oferece "Instalar o app" quando ele existir.
let pedidoDeInstalacao = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pedidoDeInstalacao = event;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    pedidoDeInstalacao = null;
    avisar();
  });
}

function abertoComoApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// No iPhone e no iPad não existe o pedido: instala-se pelo menu Compartilhar.
// O iPad se apresenta como Mac, e só o toque o denuncia.
function ehIOS() {
  const { userAgent, maxTouchPoints } = window.navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

function comoInstalar() {
  if (abertoComoApp()) return "";
  if (pedidoDeInstalacao) return "pedido";
  if (ehIOS()) return "ios";
  return "";
}

function assinar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

// "pedido" (o navegador mostra a própria janela), "ios" (passo a passo) ou ""
// (já é app, ou o navegador não instala).
export function useInstalacaoApp() {
  return useSyncExternalStore(assinar, comoInstalar, () => "");
}

// Mostra a janela de instalação do navegador. O pedido só vale uma vez:
// some do menu até o navegador mandar outro. Devolve "accepted", "dismissed"
// ou null, se o navegador recusar abrir a janela.
export async function instalarApp() {
  const pedido = pedidoDeInstalacao;
  if (!pedido) return null;
  pedidoDeInstalacao = null;
  avisar();
  try {
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    return outcome;
  } catch {
    return null;
  }
}

// Só no site publicado: em desenvolvimento, um service worker atrapalharia o
// recarregamento automático do Vite.
export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const registrar = () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o site funciona igual; só não abre a página sem internet.
    });
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}

// Cada publicação troca os arquivos das telas. Quem estava com o site aberto
// (ou com o app em segundo plano) ainda tem a versão anterior e, ao abrir uma
// tela que não tinha visto, pede um arquivo que já não existe. Recarregar traz
// a versão nova; se falhar de novo logo em seguida, o problema é outro e a
// tela de erro aparece, sem recarregar em ciclo.
const CHAVE_RECARGA = "para-ai-recarregou-em";
let recarregando = false;

// A tela de erro usa isto para mostrar "Carregando…" enquanto a página recarrega.
export const estaRecarregando = () => recarregando;

export function recarregarQuandoSairVersaoNova() {
  window.addEventListener("vite:preloadError", () => {
    try {
      const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA)) || 0;
      if (Date.now() - ultima < 10000) return;
      sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
    } catch {
      return;
    }
    recarregando = true;
    window.location.reload();
  });
}
