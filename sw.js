// व्याज हिशोब वही - सुरक्षित आणि ऑटो-अपडेट Service Worker (v14.21)
const CACHE_NAME = "vyaj-hishob-cache-v14-21";
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
  "./js/analytics.js",
  "./js/receipt-card.js",
  "./js/quick-collect.js",
  "./js/ui-pro.js",
  "./manifest.json",
  "./icon.png"
];

// इन्स्टॉल होताच नवीन व्हर्जन लगेच सक्रिय करा (activate immediately)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

// जुने सर्व कॅश आपोआप डिलीट करा (clear all old caches)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// नेटवर्क-फर्स्ट पद्धत: इंटरनेट असताना नेहमी ताजा कोड घ्या, ऑफलाइन असताना कॅश वापरा (Network-First strategy)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Firebase किंवा बाह्य API कॉल्स कॅश करू नका (skip external APIs)
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
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
