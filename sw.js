// Fledermauskolonie – Service Worker: das Spiel läuft auch offline; neue Versionen kommen trotzdem sofort.
// Nur eigene alte Versionen löschen: auf primov1x.github.io liegen mehrere Spiele mit eigenem Speicher.
const CACHE = 'fledermauskolonie-v1';
const APP = ['./', 'index.html', 'style.css', 'js/data.js', 'js/engine.js', 'js/ui.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('fledermauskolonie-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Erst Netz (immer die neue Version), offline aus dem Speicher
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
