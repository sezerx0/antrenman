const CACHE = 'antrenman-assets-v6';

const PRECACHE = [
  '/antrenman/',
  '/antrenman/index.html',
  '/antrenman/manifest.json',
  '/antrenman/icon-192.png',
  '/antrenman/icon-512.png',
  '/antrenman/css/app.css',
  '/antrenman/js/core.js',
  '/antrenman/js/home.js',
  '/antrenman/js/workout.js',
  '/antrenman/js/stats.js',
  '/antrenman/js/measurements.js',
  '/antrenman/js/routine.js',
  '/antrenman/js/settings.js',
  '/antrenman/js/main.js',
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

// Antrenman bildirimine dokununca: açık pencere varsa öne getir, yoksa uygulamayı aç
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
