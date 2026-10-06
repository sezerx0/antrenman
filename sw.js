const CACHE = 'antrenman-assets-v4';

const PRECACHE = [
  '/antrenman/',
  '/antrenman/index.html',
  '/antrenman/manifest.json',
  '/antrenman/icon-192.png',
  '/antrenman/icon-512.png',
  '/antrenman/vendor/chart.umd.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Yanıtın kopyası, yanıt sayfaya verilmeden ÖNCE alınmalı; aksi halde
// gövde tüketilmiş olabilir ve önbelleğe yazma "body already used" ile başarısız olur.
function cachePut(request, res) {
  if (!res || res.status !== 200) return;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // CDN varlıkları: önce önbellek, yoksa ağdan çek ve önbelleğe al
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => { cachePut(e.request, res); return res; });
      })
    );
    return;
  }

  // Aynı-origin (index.html, manifest, ikonlar): önce ağ, ağ yoksa önbellek
  // Bu sayede index.html her zaman güncel sürümü yükler
  e.respondWith(
    fetch(e.request)
      .then(res => { cachePut(e.request, res); return res; })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('/antrenman/index.html') : undefined)))
  );
});
