/*
 * GTF HR service worker.
 *
 * Security boundary (system/brain/pwa.md): only PUBLIC, immutable build assets
 * and the generic offline page are cached. Private HTML, React payloads and
 * /api responses are never stored, so no HR data survives on the device.
 */
const VERSION = "gtf-hr-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/brand/gtf-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// The page asks the waiting worker to activate after the user agrees to update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable hashed build assets and public icons: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Page navigations: always network. Offline → generic, data-free page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (RSC payloads, /api, photos) goes straight to the network.
});

/* Notifications ----------------------------------------------------------- */

self.addEventListener("push", (event) => {
  // Payloads stay minimal: a title and a link, never salary or private text.
  let data = { title: "GTF HR", body: "You have a new update.", url: "/notifications" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/shortcut-96.png",
      data: { url: data.url },
      tag: data.tag || "gtf-hr",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
