// Zéro Chichi hors ligne : tout est enregistré à l'installation, puis le réseau sert les mises à jour.
const CACHE = 'zero-chichi-v3';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
      await c.addAll(['./', ...list]);
    } catch { await c.add('./').catch(() => {}); }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./') : undefined)))
  );
});
