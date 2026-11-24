// व्याज हिशोब वही - सुपर-फास्ट हायब्रीड Service Worker (v14.46 - Stale-While-Revalidate + ignoreSearch)
const CACHE_NAME = "vyaj-hishob-cache-v14-46";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/pro-theme.css",
  "./css/pro-card.css",
  "./css/pro-layout-fix.css",
  "./js/core/app-hub.js",
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
  "./js/pro/general-pro.js",
  "./manifest.json",
  "./icon.png"
];

// इन्स्टॉल होताना सर्व आवश्यक फाईल्स Cache मध्ये सुरक्षित सेव्ह करा
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        CORE_ASSETS.map((asset) => cache.add(asset).catch(() => null))
      );
    })
  );
});

// नवीन व्हर्जन अ‍ॅक्टिव्ह होताच सर्व जुने Cache कायमचे साफ करा
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

// स्मार्ट हायब्रीड Fetch धोरण:
// अ) HTML, Manifest, Icon -> Network-First (नवीन अपडेट्स लगेच दिसण्यासाठी)
// ब) JS आणि CSS -> Instant Cache + Background Update + ignoreSearch Fallback (APK रिफ्रेशमध्ये एकही फाईल मिस होऊ नये म्हणून)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isHtmlOrMeta =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon.png");

  if (isHtmlOrMeta) {
    const isIconOrManifest =
      url.pathname.endsWith("/icon.png") ||
      url.pathname.endsWith("/manifest.json");
    const netReq = isIconOrManifest
      ? new Request(event.request, { cache: "no-cache" })
      : event.request;

    event.respondWith(
      fetch(netReq)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // सर्व JS व CSS फाईल्ससाठी Stale-While-Revalidate (०.२ सेकंदात फास्ट लोड)
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const exactCached = await cache.match(event.request);

      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            cache.put(event.request, res.clone());
          }
          return res;
        })
        .catch(() => null);

      if (exactCached) {
        // तात्काळ Cache मधून द्या आणि बॅकग्राउंडला ताजी फाईल अपडेट करून ठेवा
        event.waitUntil(networkFetch);
        return exactCached;
      }

      // नवीन व्हर्जन (?v=...) असल्यास आधी नेटवर्कवरून आणा; नेट स्लो/बंद असल्यास ignoreSearch ने जुनी सुरक्षित कॉपी द्या
      const netRes = await networkFetch;
      if (netRes) return netRes;
      return cache.match(event.request, { ignoreSearch: true });
    })
  );
});
