// Service worker do ParaAí. Deixa o site instalável como app e, sem internet,
// abre uma página própria em vez do erro do navegador. Não guarda telas nem
// dados: vagas, saldo e estadias continuam vindo do Firebase, ao vivo, e cada
// publicação do site chega na hora, sem versão velha presa no celular.
//
// Ao mudar offline.html, troque VERSAO para o celular baixar a página nova.
const VERSAO = "paraai-v1";
const ARQUIVOS = ["/offline.html", "/logo-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => nome !== VERSAO).map((nome) => caches.delete(nome)));
      // A página começa a baixar enquanto o service worker acorda.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Firebase (/__/) e outros domínios seguem direto para a rede.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/__/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match("/offline.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // A logo da página sem internet: da rede quando há conexão, da cópia quando não.
  if (ARQUIVOS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(url.pathname)));
  }
});
