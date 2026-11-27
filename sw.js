// व्याज Infinity X - Modular Service Worker (v2.0 • One-Click Update + Offline First)
const CACHE_NAME = "vyaj-infinity-cache-v2-0";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
  "./css/design-system.css",
  "./css/print-a4.css",
  "./src/main.js",
  "./src/core/firebase.js",
  "./src/core/feature-flags.js",
  "./src/core/ledger-v16.js",
  "./src/core/store.js",
  "./src/data/offline-queue.js",
  "./src/data/borrowers-repo.js",
  "./src/data/udhaari-repo.js",
  "./src/data/cashbook-repo.js",
  "./src/data/backup-vault.js",
  "./src/guardian/error-detector.js",
  "./src/guardian/time-machine.js",
  "./src/guardian/version-compare.js",
  "./src/guardian/self-tests.js",
  "./src/ui/dom-utils.js",
  "./src/features/dashboard.js",
  "./src/features/borrowers.js",
  "./src/features/udhaari.js",
  "./src/features/month-activity.js",
  "./src/features/pdf-reports.js",
  "./src/features/tools-suite.js",
  "./src/features/security-pin.js",
  "./src/features/reminders-fcm.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

// १-क्लिक अपडेट बटनासाठी त्वरित activate करा
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((netRes) => {
        if (netRes && netRes.status === 200) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return netRes;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
