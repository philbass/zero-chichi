// Statistiques anonymes avec GoatCounter (sans cookie, sans suivi) : https://zerochichi.goatcounter.com
// Seulement sur le site en ligne, pas en développement ni dans les aperçus.
const ENDPOINT = 'https://zerochichi.goatcounter.com/count';
const LIVE = location.hostname === 'philbass.github.io';
const FLAG = 'zc-stats-installee';

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const queue = [];
const send = (path, title, event = true) => {
  const gc = window.goatcounter;
  if (gc && gc.count) gc.count({ path, title, event });
  else queue.push([path, title, event]);
};

export function startStats() {
  if (!LIVE) return;
  window.goatcounter = { no_onload: true };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = ENDPOINT;
  s.onload = () => { for (const q of queue.splice(0)) send(...q); };
  document.head.appendChild(s);

  // Une visite, puis la façon dont l'app a été ouverte.
  send('/', 'Zéro Chichi', false);
  if (standalone()) {
    send('ouverture-icone', 'Ouverture depuis l’icône installée');
    // Une seule fois par appareil : le total cumulé donne le nombre d'appareils où l'app est installée et utilisée.
    try {
      if (!localStorage.getItem(FLAG)) { send('appareil-installe', 'Nouvel appareil avec l’app installée'); localStorage.setItem(FLAG, '1'); }
    } catch { /* stockage indisponible : on ne compte pas */ }
  } else {
    send('ouverture-navigateur', 'Ouverture dans le navigateur');
  }
  // Installation au moment où elle se fait (Chrome / Android seulement).
  window.addEventListener('appinstalled', () => send('installation-android', 'Installation (Android)'));
}

/* Un évènement ponctuel (ex. présentation vidéo passée ou regardée). */
export function track(path, title) {
  if (LIVE) send(path, title);
}
