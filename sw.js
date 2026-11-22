// व्याज हिशोब वही - सुरक्षित आणि ऑटो-अपडेट Service Worker (v14.22)
const CACHE_NAME = "vyaj-hishob-cache-v14-22";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/pro-theme.css",
  "./app.js",
  "./dashboard.js",
  "./backup-safety.js",
  "./js/security.js",
  "./js/settings-sync.js",
  "./js/cashbook.js",
  "./js/reminders.js",
  "./js/nav-stack.js",
  "./js/analytics.js",
  "./js/receipt-card.js",
  "./js/quick-collect.js",
  "./js/ui-pro.js",
  "./js/pro-menu.js",
  "./manifest.json",
  "./icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
