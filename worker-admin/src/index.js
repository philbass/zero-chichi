// Relais de l'app « Zéro Chichi Admin ».
// Toutes les requêtes portent l'en-tête « X-Admin-Code » (le code choisi par Eric, secret ADMIN_CODE).
//
//   GET  /etat        → { recettes: [{ id, name, added, img, cats }] }   d'après src/data.js sur GitHub
//   POST /former      { texte, photos: [{ type, data }], note }  → { recette }   mise en forme par Claude
//   POST /illustrer   { prompt }  → { type, data }   image brute de Gemini (le détourage se fait dans l'app)
//   POST /publier     { recette, image }  → { id, added, commit }   ajoute la recette et son image sur GitHub
//
// Secrets : ADMIN_CODE, ANTHROPIC_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN (accès « Contents » en écriture au dépôt).

const ORIGINS = ['https://philbass.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const CATS = ['Entrées', 'Soupe', 'Plats', 'Viandes', 'Accompagnement', 'Pâtes', 'Tartes salées', 'Desserts', 'Cakes', 'Pain', 'Sauces', 'Apéro'];
const DATA = 'src/data.js';

const cors = req => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Code',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });
class Oups extends Error { constructor(msg, status = 500) { super(msg); this.status = status; } }

/** Comparaison à durée constante du code d'accès. */
async function codeOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const enc = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([enc(given), enc(expected)]);
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(a, b)
    : new Uint8Array(a).every((x, i) => x === new Uint8Array(b)[i]);
}

/* ── GitHub ───────────────────────────────────────────────────────────── */
async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'zero-chichi-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body && { 'Content-Type': 'application/json' }),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Oups('Accès GitHub refusé : vérifie le jeton GITHUB_TOKEN.', 502);
    throw Object.assign(new Oups(`GitHub ${res.status} : ${body.message || res.statusText}`, 502), { gh: res.status });
  }
  return body;
}
const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

async function lireData(env, ref = env.BRANCH) {
  const f = await gh(env, `contents/${DATA}?ref=${encodeURIComponent(ref)}`);
  return { texte: b64ToText(f.content), sha: f.sha };
}

/** Champs utiles de chaque ligne de ALL_RECIPES (guillemets doubles ou simples). */
function recettesDe(texte) {
  const debut = texte.indexOf('ALL_RECIPES'), fin = texte.indexOf('\n];', debut);
  const champ = (ligne, nom) => {
    const m = ligne.match(new RegExp(`["']?${nom}["']?\\s*:\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`));
    return m ? m[2].replace(/\\(.)/g, '$1') : null;
  };
  const cats = ligne => {
    const m = ligne.match(/["']?cats["']?\s*:\s*\[([^\]]*)\]/);
    return m ? [...m[1].matchAll(/(["'])(.*?)\1/g)].map(x => x[2]) : [];
  };
  return texte.slice(debut, fin).split('\n')
    .filter(l => /^\s*\{/.test(l))
    .map(l => ({ id: champ(l, 'id'), name: champ(l, 'name'), added: champ(l, 'added'), img: champ(l, 'img'), cats: cats(l), ligne: l.trim() }))
    .filter(r => r.id);
}

/* ── Claude : mise en forme ───────────────────────────────────────────── */
const SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'cats', 't', 'p', 'ing', 'steps'],
  properties: {
    id: { type: 'string', description: 'identifiant unique : minuscules, sans accents, mots séparés par des tirets (ex. « blaff-poisson »)' },
    name: { type: 'string', description: 'titre court et naturel, sans emoji' },
    cats: { type: 'array', items: { type: 'string', enum: CATS }, minItems: 1, maxItems: 3 },
    t: { type: 'integer', description: 'temps actif en minutes (préparation + cuisson), sans les temps d\'attente' },
    p: { type: 'integer', description: 'nombre de portions de base' },
    ing: {
      type: 'array',
      description: 'ingrédients : [quantité, unité, nom]. Quantité = nombre si ajustable, "" si pas de quantité (« sel, poivre »), ou texte libre non ajustable (« 300 à 400 g »), ou null pour « un peu » (ail, huile d\'olive…). Unité parmi g, kg, cl, ml, l, c. à s., c. à c., pincée, gousse(s), branche(s), tranches, feuilles, sachet, boîte, botte, bouquet, verre… ou "" pour une pièce.',
      items: { type: 'array', minItems: 3, maxItems: 3, items: { type: ['number', 'string', 'null'] } },
    },
    steps: { type: 'array', items: { type: 'string' }, description: 'étapes au tutoiement, courtes : une action par étape' },
    tip: { type: 'string', description: 'astuce facultative (précisions, variantes). Lien vers une autre recette de l\'app : [[id|texte]]' },
    wait: { type: 'array', minItems: 2, maxItems: 2, items: { type: ['integer', 'string'] }, description: 'temps d\'attente facultatif : [minutes, "de marinade" | "de repos" | "au frais" | "de trempage" | "de dessalage"]' },
    yield: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' }, description: 'facultatif : unité de portion au singulier et au pluriel si ce ne sont pas des personnes (ex. ["crêpe","crêpes"])' },
    parts: { type: 'integer', description: 'facultatif : nombre de parts quand la recette donne un plat entier découpé (gâteau, tarte)' },
    remarques: { type: 'string', description: 'pour Eric seulement, pas publié : ce que tu as dû deviner ou corriger, en une ou deux phrases. Vide si rien.' },
  },
};

function consignes(existantes) {
  const exemples = ['blanquette', 'blaff-poisson', 'tartiflette', 'sauce-gribiche']
    .map(id => existantes.find(r => r.id === id)?.ligne).filter(Boolean).join('\n');
  const liste = existantes.map(r => `${r.id} : ${r.name}`).join('\n');
  return `Tu mets en forme des recettes pour « Zéro Chichi », une appli de cuisine française aux recettes courtes et simples.
On te donne du texte et/ou des photos (page de livre, fiche, capture d'écran, notes manuscrites). Rédige la recette avec l'outil « recette ».

Règles de rédaction :
- Tutoiement partout (« Fais dorer », « Ajoute »).
- Étapes courtes : une action par étape, une ou deux phrases au plus. Pas de numéros dans le texte des étapes.
- Les précisions, variantes et conseils vont dans « tip », pas dans les étapes.
- Ne rien inventer : garde les quantités, temps et ingrédients de la source. Si une information manque (portions, temps), donne une estimation raisonnable et signale-la dans « remarques ».
- Températures en °C, quantités en unités françaises.
- Si la recette suit les consignes d'Eric (« note »), applique-les en priorité.
- Catégories : 1 à 3 parmi ${CATS.join(', ')}.
- Si la recette s'accompagne bien d'une recette déjà présente dans l'app, tu peux y renvoyer dans « tip » avec [[id|texte]] (liste plus bas).
- L'identifiant ne doit pas reprendre un identifiant existant.

Exemples de recettes déjà publiées (format de l'app) :
${exemples}

Recettes déjà dans l'app (identifiant : titre) :
${liste}`;
}

async function former(env, { texte = '', photos = [], note = '' }, existantes) {
  if (!texte.trim() && !photos.length) throw new Oups('Ajoute une photo ou du texte.', 400);
  if (photos.length > 6) throw new Oups('6 photos au maximum.', 400);
  const content = [
    ...photos.map(p => ({ type: 'image', source: { type: 'base64', media_type: p.type || 'image/jpeg', data: p.data } })),
    { type: 'text', text: [texte.trim() && `Recette :\n${texte.trim()}`, note.trim() && `Note d'Eric : ${note.trim()}`, !texte.trim() && 'La recette est sur la ou les photos.'].filter(Boolean).join('\n\n') },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL,
      max_tokens: 4000,
      system: consignes(existantes),
      tools: [{ name: 'recette', description: 'Enregistre la recette mise en forme.', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'recette' },
      messages: [{ role: 'user', content }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || res.statusText;
    if (res.status === 401) throw new Oups('Clé Claude refusée : vérifie ANTHROPIC_API_KEY.', 502);
    if (/credit|billing/i.test(msg)) throw new Oups('Crédit Claude épuisé : recharge-le sur console.anthropic.com.', 502);
    throw new Oups(`Claude ${res.status} : ${msg.slice(0, 200)}`, 502);
  }
  const r = body.content?.find(c => c.type === 'tool_use')?.input;
  if (!r) throw new Oups('Claude n\'a pas renvoyé de recette. Réessaie.', 502);
  return nettoyer(r, existantes);
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'recette';

/** Garde-fous : identifiant libre, catégories connues, champs vides retirés. */
function nettoyer(r, existantes) {
  const pris = new Set(existantes.map(x => x.id));
  let id = slug(r.id || r.name), n = 2;
  while (pris.has(id)) id = `${slug(r.id || r.name)}-${n++}`;
  const out = {
    id, name: String(r.name || '').trim(),
    cats: (r.cats || []).filter(c => CATS.includes(c)),
    t: Math.max(1, Math.round(+r.t || 0)), p: Math.max(1, Math.round(+r.p || 4)),
    ing: (r.ing || []).filter(i => Array.isArray(i) && i[2]).map(([q, u, nom]) => [q === undefined ? '' : q, u || '', String(nom).trim()]),
    steps: (r.steps || []).map(s => String(s).trim()).filter(Boolean),
  };
  if (!out.cats.length) out.cats = ['Plats'];
  if (r.tip?.trim()) out.tip = r.tip.trim();
  if (Array.isArray(r.wait) && +r.wait[0] > 0) out.wait = [Math.round(+r.wait[0]), String(r.wait[1] || 'de repos')];
  if (Array.isArray(r.yield) && r.yield[0]) out.yield = r.yield.map(String);
  if (+r.parts > 1) out.parts = Math.round(+r.parts);
  return { recette: out, remarques: (r.remarques || '').trim() };
}

/* ── Gemini : illustration ────────────────────────────────────────────── */
let refsCache = null;
async function references(env) {
  if (refsCache) return refsCache;
  const liste = await gh(env, `contents/scripts/illustrations/references?ref=${env.BRANCH}`);
  refsCache = await Promise.all(liste.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name)).map(async f => {
    const buf = new Uint8Array(await (await fetch(f.download_url)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const mime = f.name.endsWith('.png') ? 'image/png' : f.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return { inline_data: { mime_type: mime, data: btoa(bin) } };
  }));
  return refsCache;
}

async function illustrer(env, { prompt }, avecFormat = true) {
  if (!prompt) throw new Oups('Prompt manquant.', 400);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [...await references(env), { text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], ...(avecFormat && { imageConfig: { aspectRatio: '16:9' } }) },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || res.statusText;
    if (avecFormat && res.status === 400 && /imageConfig|aspect/i.test(msg)) return illustrer(env, { prompt }, false);
    if (res.status === 401 || res.status === 403) throw new Oups('Clé Gemini refusée : vérifie GEMINI_API_KEY.', 502);
    if (res.status === 402 || /free_tier|limit: 0/.test(msg)) throw new Oups('Crédit ou facturation Google à vérifier dans AI Studio.', 502);
    throw new Oups(`Gemini ${res.status} : ${msg.split('\n')[0].slice(0, 200)}`, 502);
  }
  const part = body.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
  if (!part) throw new Oups('Gemini n\'a pas renvoyé d\'image. Réessaie.', 502);
  const d = part.inlineData || part.inline_data;
  return { type: d.mimeType || d.mime_type || 'image/png', data: d.data };
}

/* ── Publication sur GitHub ───────────────────────────────────────────── */
const CHAMPS = ['id', 'added', 'img', 'name', 'cats', 't', 'wait', 'p', 'yield', 'parts', 'ing', 'steps', 'tip', 'season'];

async function publier(env, { recette, image }, essai = 1) {
  if (!recette?.name || !recette?.ing?.length || !recette?.steps?.length) throw new Oups('Recette incomplète.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recette.added || '')) throw new Oups('Date de publication manquante.', 400);
  const ref = await gh(env, `git/ref/heads/${env.BRANCH}`);
  const base = ref.object.sha;
  const commitBase = await gh(env, `git/commits/${base}`);
  const { texte } = await lireData(env, base);
  const existantes = recettesDe(texte);

  // Identifiant libre (au cas où une recette du même nom serait arrivée entre-temps).
  const pris = new Set(existantes.map(r => r.id));
  let id = slug(recette.id || recette.name), n = 2;
  while (pris.has(id)) id = `${slug(recette.id || recette.name)}-${n++}`;
  const r = { ...recette, id };
  if (image) r.img = `${id}.webp`; else delete r.img;
  const ligne = '    ' + JSON.stringify(Object.fromEntries(CHAMPS.filter(k => r[k] !== undefined && r[k] !== '').map(k => [k, r[k]]))) + ',';

  const debut = texte.indexOf('ALL_RECIPES'), fin = texte.indexOf('\n];', debut);
  if (debut < 0 || fin < 0) throw new Oups('Structure de src/data.js inattendue.', 500);
  const avant = texte.slice(0, fin).replace(/\s*$/, '');
  const nouveau = (avant.endsWith(',') ? avant : avant + ',') + '\n' + ligne + texte.slice(fin);

  const tree = [{ path: DATA, mode: '100644', type: 'blob', content: nouveau }];
  if (image) {
    const blob = await gh(env, 'git/blobs', { method: 'POST', body: JSON.stringify({ content: image, encoding: 'base64' }) });
    tree.push({ path: `public/assets/illus/${id}.webp`, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const t = await gh(env, 'git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commitBase.tree.sha, tree }) });
  const c = await gh(env, 'git/commits', { method: 'POST', body: JSON.stringify({
    message: `Nouvelle recette : ${r.name} (${r.added}, depuis Zéro Chichi Admin)`, tree: t.sha, parents: [base],
  }) });
  try {
    await gh(env, `git/refs/heads/${env.BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha, force: false }) });
  } catch (e) {
    // Quelqu'un a publié entre-temps : on recommence sur la nouvelle version.
    if (e.gh === 422 && essai < 3) return publier(env, { recette, image }, essai + 1);
    throw e;
  }
  return { id, added: r.added, commit: c.sha };
}

/* ── Routage ──────────────────────────────────────────────────────────── */
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const { pathname } = new URL(req.url);
    try {
      if (!(await codeOk(req.headers.get('X-Admin-Code'), env.ADMIN_CODE))) throw new Oups('Code incorrect.', 401);
      if (req.method === 'GET' && pathname === '/etat') {
        const { texte } = await lireData(env);
        return json(req, { recettes: recettesDe(texte).map(r => { const { ligne: _L, ...reste } = r; return reste; }) });
      }
      if (req.method !== 'POST') throw new Oups('Introuvable.', 404);
      const body = await req.json().catch(() => { throw new Oups('Requête illisible.', 400); });
      if (pathname === '/former') {
        const { texte } = await lireData(env);
        return json(req, await former(env, body, recettesDe(texte)));
      }
      if (pathname === '/illustrer') return json(req, await illustrer(env, body));
      if (pathname === '/publier') return json(req, await publier(env, body));
      throw new Oups('Introuvable.', 404);
    } catch (e) {
      return json(req, { erreur: e.message || 'Erreur inattendue.' }, e.status || 500);
    }
  },
};
