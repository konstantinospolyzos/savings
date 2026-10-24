// Offline support: the newest files when online, the saved copies when offline.
// Google Drive, Google sign-in and the exchange-rate service always go to the network.
const CACHE = "savings-tracker-v10";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/core.js", "js/car.js", "js/store.js", "js/ui.js", "js/charts.js", "js/config.js",
  "js/pages/overview.js", "js/pages/history.js", "js/pages/month.js", "js/pages/settings.js",
  "js/pages/welcome.js", "js/pages/budget.js", "js/pages/budget-sheets.js", "js/pages/insights.js", "js/pages/car.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // newest version when online, the saved copy when offline
  event.respondWith(fetch(event.request).then((resp) => {
    if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
    return resp;
  }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
