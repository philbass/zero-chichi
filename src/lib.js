// Utilitaires partagés : formats, quantités, analyse d'une recette en texte libre.

export const BASE = import.meta.env?.BASE_URL ?? "./";

export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');
export const fmtT = t => { if (t < 60) return t + ' min'; const h = Math.floor(t / 60), m = t % 60; return h + ' h' + (m ? ' ' + m : ''); };
export const meta = r => fmtT(r.t) + ' · ' + r.ing.length + ' ingrédients';
export const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Date du jour au format AAAA-MM-JJ (heure locale). */
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
/** Date d'ajout d'une recette (AAAA-MM-JJ), ou null si inconnue. */
export const addedOf = r => r.added || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null);
/** « 13 novembre 2026 » */
export const fmtDate = iso => { const [y, m, d] = iso.split('-').map(Number); return (d === 1 ? '1er' : d) + ' ' + MOIS[m - 1] + ' ' + y; };
export const portionLabel = (r, n) => n + ' ' + (r.yield ? r.yield[n > 1 ? 1 : 0] : 'pers.');

export const ingList = (r, portions) => {
  const k = portions / r.p;
  return r.ing.map(([q, u, n]) => ({
    q: q == null ? 'un peu' : typeof q === 'string' ? q : fmt(q * k) + (u ? ' ' + u : ''),
    n,
  }));
};

export const imgUrl = r => (r.imgData ? r.imgData
  : r.imgAsset ? '/_blob/' + r.imgAsset
  : r.img ? `${BASE}assets/illus/${r.img.includes('.') ? r.img : r.img + '.png'}` : null);
export const illus = (r, tint, url = imgUrl(r)) => url
  ? `var(--color-${tint}-200) url("${url}") center / contain no-repeat`
  : 'repeating-linear-gradient(135deg,var(--color-neutral-300) 0 7px,var(--color-neutral-200) 7px 14px)';

/* ── Ingrédients : « 200 g de farine » ⇄ [200, 'g', 'farine'] ─────────── */
const UNITS = [
  ['c. à s.', /^(c\.?\s*à\s*s\.?|cs|cas|cuill(?:è|e)res?\s*à\s*soupe|c\.?\s*s\.?)(?=[\s,;)]|$)/i],
  ['c. à c.', /^(c\.?\s*à\s*c\.?|cc|cac|cuill(?:è|e)res?\s*à\s*caf(?:é|e)|c\.?\s*c\.?)(?=[\s,;)]|$)/i],
  ['kg', /^kg\b/i], ['g', /^(g|gr|grammes?)(?=[\s,;)]|$)/i], ['mg', /^mg\b/i],
  ['L', /^(l|litres?)(?=[\s,;)]|$)/i], ['cl', /^cl\b/i], ['ml', /^ml\b/i], ['dl', /^dl\b/i],
  ['pincée', /^pinc(?:é|e)es?\b/i], ['gousses', /^gousses?\b/i], ['branches', /^branches?\b/i],
  ['tranches', /^tranches?\b/i], ['feuilles', /^feuilles?\b/i], ['sachet', /^sachets?\b/i],
  ['boîte', /^bo(?:î|i)tes?\b/i], ['brique', /^briques?\b/i], ['botte', /^bottes?\b/i],
  ['bouquet', /^bouquets?\b/i], ['verre', /^verres?\b/i], ['noix', /^noix\b/i], ['rouleau', /^rouleaux?\b/i],
  ['paquet', /^paquets?\b/i], ['tige', /^tiges?\b/i], ['noisette', /^noisettes?\b/i],
  ['cm', /^cm\b/i], ['shot', /^shots?\b/i],
];
// Unités écrites en toutes lettres : on garde la forme tapée (« 1 gousse », « 3 gousses »).
const KEEP_AS_TYPED = new Set(['pincée', 'gousses', 'branches', 'tranches', 'feuilles', 'sachet', 'boîte', 'brique', 'botte', 'bouquet', 'verre', 'rouleau', 'paquet', 'tige', 'noisette', 'shot']);
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const cleanLine = s => s
  .replace(/^\s*\d+\u{FE0F}?\u{20E3}\s*/u, '')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}|\u{20E3}/gu, '')
  .replace(/^\s*(?:[-•◦⁃*·]|\d+\s*[.)/-](?!\d)|\d+️?⃣)\s*/, '')
  .replace(/\s+/g, ' ').trim();

export function parseIngredient(line) {
  let s = cleanLine(line);
  if (!s) return null;
  // « Farine : 200 g » → « 200 g Farine »
  const colon = s.match(/^([^:]+?)\s*:\s*(\d.*)$/);
  if (colon) s = colon[2] + ' ' + colon[1];
  const range = s.match(/^(\d+(?:[.,]\d+)?\s*(?:à|-)\s*\d+(?:[.,]\d+)?\s*(?:kg|g|cl|ml|l)?)\s+(?:de |d['’])?(.+)$/i);
  if (range) return [range[1], '', range[2].charAt(0).toLowerCase() + range[2].slice(1)];
  const m = s.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔])\s*(.*)$/);
  const low = s => s.charAt(0).toLowerCase() + s.slice(1);
  if (!m) {
    // « un peu de X », « quelques X » : quantité libre (affichée « un peu »)
    const peu = s.match(/^(?:un peu|quelques|un filet)\s+(?:de |d['’])?(.+)$/i);
    if (peu) return [null, '', low(peu[1])];
    // sinon pas de quantité affichée (« sel, poivre », « basilic (option) »…)
    return ['', '', low(s.replace(/,?\s*(selon|au) (le |votre )?go[uû]t/i, '').replace(/\s*\((?:facultatif|optionnel)\)/i, ' (option)').trim())];
  }
  let q = m[1];
  if (FRACTIONS[q] != null) q = FRACTIONS[q];
  else if (q.includes('/')) { const [a, b] = q.split('/').map(Number); q = a / b; }
  else q = parseFloat(q.replace(',', '.'));
  let rest = m[2], u = '';
  for (const [unit, re] of UNITS) {
    const um = rest.match(re);
    if (um && !(unit === 'bouquet' && /^\s*garni/i.test(rest.slice(um[0].length)))) {
      u = KEEP_AS_TYPED.has(unit) ? um[0].toLowerCase() : unit; rest = rest.slice(um[0].length); break;
    }
  }
  rest = rest.replace(/^\s*(?:de |d['’]|des |du )/i, '').trim();
  return [q, u, low(rest || s)];
}

export const ingredientToLine = ([q, u, n]) =>
  q == null ? 'un peu ' + n : typeof q === 'string' ? (q ? q + ' ' : '') + n : fmt(q) + (u ? ' ' + u : '') + ' ' + n;

/* ── Analyse locale (sans Claude) d'un texte de recette collé ─────────── */
export function parseRecipeText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const name = cleanLine(lines[0] || 'Nouvelle recette').replace(/\s*[:–-]\s*$/, '');
  let mode = 'intro';
  const ing = [], steps = [];
  let t = 0, p = 4;
  for (const raw of lines.slice(1)) {
    const l = cleanLine(raw);
    const low = norm(l);
    const pm = low.match(/pour\s+(\d+)\s*(?:pers|personnes)/);
    if (pm) p = +pm[1];
    for (const tm of low.matchAll(/(?:preparation|cuisson|temps)[^0-9]*(\d+)\s*(h|min|mn)/g)) t += tm[2] === 'h' ? +tm[1] * 60 : +tm[1];
    if (/^ingredients?\b/.test(low)) { mode = 'ing'; continue; }
    if (/^(preparation|instructions?|etapes?|recette)\b/.test(low) && l.length < 40) { mode = 'steps'; continue; }
    if (/^#/.test(l) || !l) continue;
    if (mode === 'ing') { if (l.length < 90 && !/:$/.test(l)) { const x = parseIngredient(l); if (x) ing.push(x); } }
    else if (mode === 'steps') { if (l.length > 3 && !/:$/.test(l)) steps.push(l); }
  }
  return { name, cats: [], t: t || 30, p, ing, steps, notes: ['Mise en forme simple : vérifie les quantités et raccourcis les étapes si besoin.'] };
}

/* ── Consigne pour Claude ──────────────────────────────────────────── */
export const formatPrompt = (text, cats, hasImage) => `Tu mets en forme une recette pour l'application « Zéro Chichi » (recettes courtes, en français).
${hasImage ? "La recette est sur l'image jointe" + (text.trim() ? ', complétée par ce texte :' : '.') : 'Voici la recette, telle que la personne l’a collée :'}
${text.trim() ? '"""\n' + text.trim() + '\n"""' : ''}

Réponds uniquement avec un objet JSON de cette forme :
{"name": string, "cats": string[], "t": number, "p": number, "yield": null | [string, string], "ing": [{"q": number | string | null, "u": string, "n": string}], "steps": string[], "notes": string[]}

Règles :
- name : nom court et naturel, sans emoji, majuscule seulement au début et aux noms propres.
- cats : 1 ou 2 catégories prises UNIQUEMENT dans cette liste : ${cats.join(', ')}.
- t : temps total en minutes (préparation + cuisson + repos). S'il n'est pas donné, estime-le.
- p : nombre de personnes. S'il n'est pas donné, estime-le. Si la recette donne des pièces (biscuits, bouchons, pâtés…) ou un moule, mets ce nombre dans p et le mot dans yield, au singulier puis au pluriel, par exemple ["bouchon", "bouchons"] ; sinon yield vaut null.
- ing : un ingrédient par entrée, dans l'ordre de la recette. q est un nombre quand la quantité peut être multipliée (0.5 pour ½), "" pour « sel, poivre » ou « au goût », null pour « quelques », « un peu », « facultatif ». u est l'unité abrégée : g, kg, ml, cl, L, c. à s., c. à c., pincée, gousses, sachet, boîte… ou "" sans unité. n est le nom en minuscules, sans « de » au début, avec une précision courte entre parenthèses si utile (« (option) », « (pâte) »).
- steps : 3 à 8 étapes, à l'impératif et au tutoiement (« Préchauffe », « Mélange »), une phrase courte chacune, 110 caractères maximum. Garde tous les temps, températures et réglages d'appareil. Supprime les emojis, hashtags et phrases publicitaires.
- notes : en français, ce que tu as dû deviner ou corriger (portions, temps, incohérences). Tableau vide si rien.`;

/* Contrôle et normalise la réponse de Claude. */
export function normalizeRecipe(x, cats) {
  const num = v => (typeof v === 'number' && isFinite(v) ? v : parseFloat(String(v).replace(',', '.')));
  const r = {
    name: String(x?.name || 'Nouvelle recette').trim().slice(0, 90),
    cats: Array.isArray(x?.cats) ? x.cats.filter(c => cats.includes(c)).slice(0, 3) : [],
    t: Math.max(1, Math.round(num(x?.t)) || 30),
    p: Math.max(1, Math.round(num(x?.p)) || 4),
    yield: Array.isArray(x?.yield) && x.yield.length === 2 ? x.yield.map(String) : null,
    ing: (Array.isArray(x?.ing) ? x.ing : []).map(i => {
      if (Array.isArray(i)) return i;
      const q = i?.q == null ? null : typeof i.q === 'number' ? i.q : isFinite(num(i.q)) && /^\s*[\d.,]+\s*$/.test(i.q) ? num(i.q) : String(i.q);
      return [q, String(i?.u || ''), String(i?.n || '').trim()];
    }).filter(i => i[2]),
    steps: (Array.isArray(x?.steps) ? x.steps : []).map(s => String(s).trim()).filter(Boolean),
    notes: (Array.isArray(x?.notes) ? x.notes : []).map(String),
  };
  if (!r.yield) delete r.yield;
  return r;
}

/* ── Durées dans le texte d'une étape : « 20 à 25 min », « 1 h 30 », « 10 sec » ── */
export function parseDurations(text) {
  const out = [];
  const s = norm(String(text));
  const re = /(\d+(?:[.,]\d+)?)\s*(?:(?:a|-|ou)\s*(\d+(?:[.,]\d+)?)\s*)?(h(?:eures?)?\b(?:\s*(\d{1,2})(?!\s*(?:min|mn|sec|°|cm|g\b)))?|min(?:utes?)?\b|mn\b|sec(?:ondes?)?\b|s\b(?=\s*\/))/g;
  for (const m of s.matchAll(re)) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
    const unit = m[3];
    let k = 60, extra = 0;
    if (unit.startsWith('h')) { k = 3600; if (m[4]) extra = +m[4] * 60; }
    else if (unit.startsWith('s')) k = 1;
    const sec = Math.round(a * k + extra);
    if (sec < 5 || sec > 12 * 3600) continue;
    const label = fmtDuration(sec);
    const upTo = b ? Math.round(b * k + extra) : null;
    if (!out.some(o => o.sec === sec)) out.push({ sec, label, upTo: upTo && upTo > sec ? fmtDuration(upTo) : null });
    if (out.length === 2) break;
  }
  return out;
}

export function fmtDuration(sec) {
  if (sec < 60) return sec + ' s';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '') : m + ' min';
}

export function fmtClock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
