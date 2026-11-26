// Zéro Chichi Admin : l'app s'ouvre sans réseau (les envois, eux, demandent une connexion).
// Servie à sa propre adresse (zc-admin.philbass.workers.dev), indépendante de Zéro Chichi.
const CACHE = 'zc-admin-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zc-admin-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  // Seulement les fichiers de l'app : les réponses du relais (/etat…) ne sont jamais gardées.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (!(req.mode === 'navigate' || ['script', 'style', 'image', 'font', 'manifest'].includes(req.destination))) return;
  e.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./') : undefined)))
  );
});
