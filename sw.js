// व्याज हिशोब वही - सुरक्षित आणि ऑटो-अपडेट Service Worker (v14.41)
const CACHE_NAME = "vyaj-hishob-cache-v14-41";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/pro-theme.css",
  "./css/pro-card.css",
  "./css/pro-layout-fix.css",
  "./app.js",
  "./dashboard.js",
  "./backup-safety.js",
  "./js/security.js",
  "./js/settings-sync.js",
  "./js/cashbook.js",
  "./js/analytics.js",
  "./js/receipt-card.js",
  "./js/quick-collect.js",
  "./js/ui-pro.js",
  "./js/pro/core-engine.js",
  "./js/pro/schema-engine.js",
  "./js/pro/past-dues-pro.js",
  "./js/pro/promise-bar.js",
  "./js/pro/firebase-field-sync.js",
  "./js/customer-details.js",
  "./js/state-restore.js",
  "./js/pro/smart-import.js",
  "./js/pro/live-backup.js",
  "./js/pro/smart-radar.js",
  "./js/pro/card-pro.js",
  "./js/pro/pending-split-bar.js",
  "./js/pro/unlimited-promises.js",
  "./js/pro/smart-switcher.js",
  "./js/pro/cleanup-pro.js",
  "./js/pro/dashboard-pro.js",
  "./js/pro/udhaari-pro.js",
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
