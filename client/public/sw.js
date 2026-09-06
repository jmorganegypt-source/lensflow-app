/* LensFlow service worker — hand-written, no build step.
 *
 * Goals: make the site installable (Add to Home Screen) and keep the shell
 * usable on a flaky connection. Deliberately conservative:
 *   - /api/* is never touched — always straight to network.
 *   - navigations are network-first, falling back to a cached shell, so a
 *     new deploy is always picked up when online.
 *   - hashed build assets (/assets/*) and static media are cache-first,
 *     since their URLs change when their contents do.
 *
 * Bump CACHE when you want every client to drop its old cache on next load.
 */
const CACHE = "lensflow-v1";
const SHELL = "/";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(SHELL)).catch(() => {}));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // App navigations: try the network, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          caches.open(CACHE).then(cache => cache.put(SHELL, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => caches.match(SHELL).then(hit => hit || caches.match(request)))
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  if (/\/(assets|icons|companions|studio|promo)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then(hit => {
        const network = fetch(request)
          .then(response => {
            if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {});
            return response;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
