// Hishob Service Worker (V14.3)
const CACHE_NAME = 'hishob-v14-3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // नेटवर्कवरून ताजा डेटा घ्या, नेटवर्क नसेल तर कॅश वापरा
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
