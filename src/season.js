// Saison d'une recette, devinée d'après ses ingrédients (fruits et légumes de saison en France)
// et d'après le type de plat (plat mijoté d'hiver, salade d'été…).
// Une recette peut forcer sa saison avec le champ `season` : ['été'], ['automne', 'hiver'] ou [] (toute l'année).
import { norm } from './lib.js';

export const SEASONS = ['printemps', 'été', 'automne', 'hiver'];
export const SEASON_LABEL = { printemps: 'Printemps', 'été': 'Été', automne: 'Automne', hiver: 'Hiver' };

// [mots-clés, saisons, poids]. Les produits « toute l'année » (carotte, oignon, pomme de terre…) ne comptent pas.
const PRODUCE = [
  [['courgette', 'aubergine', 'poivron', 'concombre', 'haricots verts', 'basilic', 'melon', 'peche', 'abricot', 'mangue'], ['été'], 2],
  [['tomate', 'tomates'], ['été'], 2],
  [['fraise', 'cerise', 'framboise'], ['printemps', 'été'], 2],
  [['asperge', 'petits pois', 'radis', 'feves', 'rhubarbe', 'artichaut'], ['printemps'], 2],
  [['cepes', 'girolles', 'potiron', 'courge', 'butternut', 'raisin', 'figue', 'coing'], ['automne'], 2],
  [['pomme', 'pommes', 'poire', 'marrons', 'chataigne'], ['automne', 'hiver'], 2],
  [['poireau', 'poireaux', 'chou', 'chou-fleur', 'celeri', 'topinambour', 'panais', 'navet', 'endive', 'mache'], ['automne', 'hiver'], 2],
  [['orange', 'oranges', 'clementine', 'mandarine'], ['hiver'], 1],
];
// Ce qui n'est pas un légume frais de saison (conserves, séchés, poudres…).
const NOT_FRESH = /sechee|tomates? pelee|concentre|confite|poudre|jus de|zeste|pommes? de terre|ketchup/;

const DISH = [
  [/potee|blanquette|tartiflette|parmentier|joue de boeuf|osso buco|langue de boeuf|tete de veau|confite|braise|veloute|soupe|gratin|fondue|raclette|vallee d'auge/, ['automne', 'hiver'], 2],
  [/noel/, ['hiver'], 3],
  [/agneau/, ['printemps'], 2],
  [/salade|tartare|caviar d'aubergine|pesto|gaspacho/, ['été'], 2],
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RX = PRODUCE.map(([keys]) => new RegExp('(^|[^a-z])(' + keys.map(esc).join('|') + ')(s|x)?(?![a-z])'));
const clean = s => norm(s).replace(/œ/g, 'oe').replace(/[’]/g, "'");

/** Saisons de la recette (0, 1 ou 2 saisons voisines). Tableau vide : toute l'année. */
export function seasonsOf(r) {
  if (Array.isArray(r.season)) return r.season;
  const score = { printemps: 0, 'été': 0, automne: 0, hiver: 0 };
  for (const [, , name] of r.ing) {
    const n = clean(name);
    if (/\(option|\(decor/.test(n)) continue;
    PRODUCE.forEach(([, seasons, w], i) => {
      const m = n.match(RX[i]);
      if (!m) return;
      if (NOT_FRESH.test(n)) return;
      seasons.forEach(s => { score[s] += w / seasons.length; });
    });
  }
  const name = clean(r.name);
  for (const [rx, seasons, w] of DISH) if (rx.test(name)) seasons.forEach(s => { score[s] += w / seasons.length; });
  const max = Math.max(...Object.values(score));
  if (max < 1) return [];
  const top = SEASONS.filter(s => score[s] >= max * 0.6);
  return top.length > 2 ? [] : top;
}

/** Saison du moment (hémisphère nord, découpage par mois). */
export function currentSeason(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'printemps' : m >= 6 && m <= 8 ? 'été' : m >= 9 && m <= 11 ? 'automne' : 'hiver';
}
