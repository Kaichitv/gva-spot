// Service worker minimal (PWA installable + offline shell léger).
// Stratégie prudente : network-first pour l'app et l'API (données fraîches),
// cache de secours pour la coquille quand on est hors-ligne. On ne met JAMAIS
// en cache les réponses de l'API listings (données de tiers, volatiles).

const CACHE = "gva-spot-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Les appels API : réseau uniquement, jamais de cache.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation / assets : network-first avec repli cache.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("/")))
  );
});
