// नवीन कॅश नाव — यामुळे जुना V12.0 कॅश आपोआप डिलीट होईल
const CACHE_NAME = 'hishob-v12.4-cache';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// इन्स्टॉल होताना नवीन फाईल्स सेव्ह करा आणि लगेच सक्रिय व्हा
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
  self.skipWaiting();
});

// जुने सर्व कॅश (उदा. V12.0) साफ करा
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-First: आधी इंटरनेटवरून ताजी फाईल आणा, ऑफलाईन असल्यास कॅशमधून द्या
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
