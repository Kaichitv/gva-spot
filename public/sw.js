// Service worker minimal (PWA installable + offline shell léger + Web Push).
// Stratégie prudente : network-first pour l'app et l'API (données fraîches),
// cache de secours pour la coquille quand on est hors-ligne. On ne met JAMAIS
// en cache les réponses de l'API listings (données de tiers, volatiles).

const CACHE = "gva-spot-v2";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // Le pré-cache de la coquille est un bonus : s'il échoue (stockage
  // indisponible, quota…), le SW doit quand même s'installer, sinon les
  // notifications push deviennent impossibles.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .catch(() => {})
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

// --- Notifications push -----------------------------------------------------
// Payload envoyé par src/lib/notify.ts : { title, body, url, count, tag }.
// Uniquement un résumé + un lien vers l'app (aucune donnée d'annonceur).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "GVA Spot";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Nouvelles annonces à Genève",
      tag: data.tag || "gva-new",
      // Même tag : la nouvelle notif remplace l'ancienne, on la signale quand même.
      renotify: true,
      data: { url: data.url || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      vibrate: [60, 40, 60],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Un onglet de l'app est déjà ouvert : on le recharge sur l'URL cible
      // (pour afficher les nouveautés) et on le met au premier plan.
      const existing = windows.find(
        (c) => new URL(c.url).origin === self.location.origin
      );
      if (existing) {
        const focused = await existing.focus();
        if ("navigate" in focused) {
          await focused.navigate(target).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
