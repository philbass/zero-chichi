// Appels au relais Cloudflare (worker-admin/). Le code d'accès est gardé sur le téléphone.
// L'app est servie par le relais lui-même : même adresse. En développement local, on vise le relais en ligne.
export const RELAIS = location.hostname.endsWith('workers.dev') ? '' : 'https://zc-admin.philbass.workers.dev';
// Illustrations publiées : celles du site de Zéro Chichi.
export const SITE = 'https://philbass.github.io/zero-chichi/';
const CLE_CODE = 'zca:code';
export const DEMO = new URLSearchParams(location.search).has('demo');

export const lireCode = () => { try { return localStorage.getItem(CLE_CODE) || ''; } catch { return ''; } };
export const garderCode = c => { try { c ? localStorage.setItem(CLE_CODE, c) : localStorage.removeItem(CLE_CODE); } catch { /* stockage indisponible */ } };

async function appel(chemin, body, code = lireCode()) {
  let res;
  try {
    res = await fetch(RELAIS + chemin, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Admin-Code': code, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error('Pas de connexion au relais. Vérifie le réseau et réessaie.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.erreur || `Erreur ${res.status}`), { status: res.status });
  return json;
}

/* ── Mode démonstration (?demo) : aucune clé, aucun envoi ─────────────── */
const pause = ms => new Promise(ok => setTimeout(ok, ms));
const DEMO_RECETTE = {
  id: 'blaff-de-poisson', name: 'Blaff de poisson', cats: ['Plats'], t: 35, p: 4, wait: [30, 'de marinade'],
  ing: [[1, 'kg', 'poissons entiers (vivaneau, daurade) écaillés et vidés'], [3, '', 'citrons verts'], [2, 'gousses', 'ail'],
    [2, 'branches', 'cive'], [1, '', 'oignon'], [2, 'branches', 'thym'], [2, '', "feuilles de bois d'Inde"], [1, '', 'piment entier'], ['', '', 'sel, poivre']],
  steps: ['Coupe le poisson en tronçons. Fais-le mariner 30 min avec le jus de 2 citrons et une gousse d\'ail écrasée.',
    'Porte à ébullition 1 l d\'eau avec l\'oignon, la cive, le thym, le bois d\'Inde, l\'ail restant et le piment entier, sans le percer.',
    'Plonge le poisson et cuis 8 à 10 min à frémissement.', 'Ajoute le jus du dernier citron. Sers dans des assiettes creuses avec le bouillon.'],
  tip: 'Garde le piment entier : il parfume sans brûler. Sers avec du riz blanc.',
};
const demo = {
  async etat() {
    const { RECIPES } = await import('../src/data.js');
    const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const futures = [['pain-perdu', 'Pain perdu', 1], ['fondue-savoyarde', 'Fondue savoyarde', 4], ['papillotes-saumon-poireaux', 'Papillotes de saumon aux poireaux', 6], ['veloute-chataignes', 'Velouté de châtaignes', 8], ['sables-noel', 'Sablés de Noël', 11]]
      .map(([id, name, n]) => ({ id, name, added: j(n), img: id + '.webp', cats: ['Plats'] }));
    return { recettes: [...RECIPES.map(r => ({ id: r.id, name: r.name, added: r.added, img: r.img, cats: r.cats })), ...futures] };
  },
  async former() { await pause(1800); return { recette: { ...DEMO_RECETTE }, remarques: 'Temps de cuisson estimé : la source ne le précisait pas.' }; },
  async illustrer() {
    await pause(1500);
    const blob = await (await fetch(SITE + 'assets/illus/blaff-poisson.webp')).blob();
    const data = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
    return { type: 'image/webp', data, demo: true };
  },
  async publier({ recette }) { await pause(1200); return { id: recette.id, added: recette.added, commit: 'demo' }; },
};

export const api = DEMO ? demo : {
  etat: code => appel('/etat', null, code),
  former: body => appel('/former', body),
  illustrer: body => appel('/illustrer', body),
  publier: body => appel('/publier', body),
};
