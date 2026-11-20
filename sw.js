// Service Worker: अ‍ॅपची मुख्य फाईल ऑफलाईन कॅशमध्ये सुरक्षित ठेवण्यासाठी
const CACHE_NAME = 'vyaj-hishob-v12-0-cache';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];

// इन्स्टॉल होताना मुख्य फाईल्स कॅश करणे
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// जुना कॅश साफ करून नवीन Service Worker लगेच सक्रिय करणे
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// नेटवर्क विनंती हाताळणे (Firebase Live Sync ला अडथळा न आणता ऑफलाईन UI उघडणे)
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase आणि Google APIs वर थेट नेटवर्क जाऊ देणे (जेणेकरून Live Sync अबाधित राहील)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('docs.google.com')
  ) {
    return;
  }

  // अ‍ॅपचे मुख्य पेज किंवा मॅनिफेस्ट नेटवर्कवरून आणणे आणि ऑफलाईन असल्यास कॅशमधून देणे
  if (req.mode === 'navigate' || STATIC_ASSETS.some(p => url.pathname.endsWith(p.replace('./', '/')))) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
  }
});

