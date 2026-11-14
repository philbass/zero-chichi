// Estimation des macros d'une recette à partir de ses ingrédients.
// Valeurs moyennes pour 100 g (ou 100 ml), d'après les ordres de grandeur de la table Ciqual (Anses).
// Ce sont des estimations : les marques, les morceaux et la cuisson font varier les chiffres.
import { norm } from './lib.js';

// [mots-clés (le premier qui correspond gagne, du plus précis au plus général), kcal, protéines, glucides, lipides, poids d'une pièce en g]
const FOODS = [
  // À ne pas compter (eau, sel, épices en très petite quantité)
  [['eau'], 0, 0, 0, 0],
  [['gros sel', 'sel', 'poivre', 'muscade', '4-epices', 'quatre-epices', 'bois d\'inde', 'clous de girofle', 'laurier', 'thym', 'herbes de provence', 'bouquet garni', 'sauge', 'estragon', 'cannelle', 'paprika', 'extrait de vanille', 'levure chimique', 'tabasco', 'fleur de sel', 'aromates'], 0, 0, 0, 0],
  // Viandes et poissons
  [['ailerons de poulet'], 150, 12, 0, 11, 45], // poids avec os
  [['cuisses de poulet'], 150, 14, 0, 10, 250], // poids avec os
  [['filets de poulet', 'poulet'], 120, 23, 0, 2.5, 140],
  [['blanquette de veau', 'tendron de veau'], 200, 19, 0, 14, 200],
  [['jarret de veau'], 160, 20, 0, 9, 300],
  [['paupiettes de veau'], 230, 16, 3, 17, 150],
  [['joue de boeuf'], 160, 21, 0, 8.5],
  [['queue de boeuf'], 140, 11, 0, 11], // poids avec os
  [['langue de boeuf'], 220, 15, 0, 18],
  [['tete de veau'], 150, 16, 0, 9.5, 3000], // une tête entière désossée ≈ 3 kg
  [['boeuf'], 130, 21, 0, 5], // bœuf maigre (tête de filet, rumsteck…)
  [['echine de porc'], 230, 18, 0, 17, 215],
  [['travers de porc'], 190, 12, 0, 16], // poids avec os
  [['chair a saucisse'], 300, 14, 1, 27],
  [['lardons', 'lard fume', 'lard ou chorizo'], 300, 15, 0.5, 27],
  [['des de jambon', 'jambon'], 115, 19, 1, 4],
  [['chorizo'], 450, 24, 2, 38],
  [['saumon fume'], 180, 22, 0, 10],
  [['morue salee'], 160, 34, 0, 1.5],
  // Œufs et produits laitiers
  [['jaunes d\'oeuf', 'jaune d\'oeuf', 'jaunes d\'oeufs'], 340, 16, 0.5, 30, 18],
  [['oeufs (les blancs)'], 48, 11, 0.7, 0.2, 33],
  [['oeufs durs', 'oeufs moyens', 'oeufs', 'oeuf'], 140, 12.5, 0.5, 9.5, 55],
  [['creme legere'], 130, 3, 4, 12],
  [['creme fraiche epaisse', 'creme fraiche', 'creme liquide entiere', 'creme liquide 30', 'creme liquide', 'creme'], 300, 2.3, 3, 30],
  [['creme legere'], 130, 3, 4, 12],
  [['lait'], 47, 3.3, 4.8, 1.6],
  [['beurre'], 745, 0.7, 0.6, 82, 10],
  [['fromage blanc'], 75, 7.5, 4, 3],
  [['yaourt grec'], 120, 5, 4, 10, 150],
  [['parmesan'], 390, 33, 0, 28],
  [['comte', 'beaufort'], 410, 27, 0, 34],
  [['gruyere', 'emmental', 'fromage rape'], 380, 28, 0, 29],
  [['mozzarella'], 250, 18, 1, 19],
  [['feta'], 270, 15, 1, 23],
  [['chevre frais'], 200, 10, 3, 16],
  [['chevre'], 300, 19, 1, 24, 180],
  [['camembert'], 290, 20, 0.5, 23],
  [['reblochon'], 330, 21, 0, 27, 450],
  [['saint-felicien'], 300, 13, 1, 27, 180],
  [['roquefort'], 360, 20, 0, 31],
  [['gorgonzola'], 350, 19, 0, 30],
  // Féculents, farines, pâtes
  [['pates fraiches'], 280, 11, 52, 3],
  [['nouilles chinoises'], 360, 11, 72, 2],
  [['crozets'], 350, 12, 70, 2, 400],
  [['spaghetti', 'pates'], 355, 12.5, 71, 1.8],
  [['couscous'], 360, 12.5, 72, 1.8],
  [['farine d\'avoine'], 380, 13, 60, 7],
  [['farine'], 345, 10, 72, 1.2],
  [['chapelure'], 380, 12, 75, 3],
  [['pain', 'baguette'], 270, 9, 55, 1.5, 40], // une tranche de pain rond ≈ 40 g
  [['pate brisee'], 420, 6, 45, 24, 230],
  [['pate feuilletee'], 410, 6, 38, 25, 230],
  [['pommes de terre', 'grosses pommes de terre'], 80, 2, 17, 0.1, 150],
  [['pois chiches'], 120, 7, 16, 2.5, 265],
  [['marrons'], 170, 2.5, 37, 1.5, 400],
  // Légumes et fruits
  [['oignon', 'oignons', 'gros oignons'], 40, 1.1, 8, 0.2, 110],
  [['echalote', 'echalotes'], 70, 2, 14, 0.2, 30],
  [['ail'], 130, 6, 27, 0.5, 5],
  [['carotte', 'carottes'], 35, 0.8, 7, 0.3, 100],
  [['blanc de poireaux', 'poireau', 'poireaux'], 30, 1.5, 5, 0.3, 150],
  [['celeri'], 15, 0.7, 2, 0.2, 40],
  [['champignons', 'cepes'], 25, 3, 2, 0.4, 20],
  [['chou rouge'], 30, 1.5, 5, 0.2, 900],
  [['chou-fleur'], 25, 2, 3, 0.3, 700],
  [['courgette', 'courgettes'], 18, 1.3, 2.5, 0.3, 200],
  [['aubergines'], 25, 1, 4, 0.2, 280],
  [['tomates pelees'], 22, 1, 3.5, 0.2],
  [['tomates sechees'], 250, 13, 40, 3],
  [['concentre de tomates'], 90, 4, 16, 0.5],
  [['tomate', 'tomates'], 20, 0.9, 3, 0.2, 120],
  [['pommes pelees', 'pomme', 'pommes'], 55, 0.3, 12.5, 0.2, 150],
  [['citron (zeste'], 0, 0, 0, 0],
  [['jus de citron', 'citron'], 25, 0.4, 2.5, 0.2, 40],
  [['orange (zeste'], 0, 0, 0, 0],
  [['oranges confites'], 320, 0.5, 80, 0.3],
  [['cornichons'], 20, 0.8, 2, 0.2, 10],
  [['capres'], 25, 2, 2, 0.6],
  [['olives vertes'], 140, 1, 1, 14],
  [['gingembre'], 70, 1.5, 15, 0.7, 5],
  [['piment'], 40, 2, 7, 0.4, 15],
  [['cive', 'cebette', 'ciboulette', 'persil', 'coriandre', 'basilic', 'aneth', 'cerfeuil'], 30, 3, 3, 0.6, 3],
  // Matières grasses, sucres, sauces
  [['huile', 'graisse d\'oie', 'saindoux'], 900, 0, 0, 100],
  [['sucre', 'miel'], 390, 0, 98, 0],
  [['chocolat noir'], 560, 7, 33, 42],
  [['amandes'], 610, 21, 6, 53],
  [['tahini'], 620, 18, 10, 55],
  [['pesto'], 500, 5, 6, 50],
  [['moutarde'], 150, 7, 4, 11],
  [['ketchup'], 110, 1.2, 25, 0.1],
  [['sauce worcestershire', 'worcestershire'], 80, 0, 19, 0],
  [['vinaigre balsamique'], 100, 0.5, 20, 0],
  [['vinaigre'], 20, 0, 1, 0],
  [['sauce soja', 'sauce d\'huitre'], 60, 7, 6, 0],
  [['cube', 'bouillon'], 0, 0, 0, 0], // bouillon dilué : négligeable
  [['vin blanc', 'cidre'], 70, 0.1, 1.5, 0],
  [['biere'], 40, 0.4, 3, 0],
  [['calvados', 'rhum'], 230, 0, 0, 0],
];

// Poids en grammes d'une unité (densité ≈ 1 pour les liquides).
const UNIT_G = {
  g: 1, kg: 1000, mg: 0.001, ml: 1, cl: 10, dl: 100, L: 1000,
  'c. à s.': 15, 'c. à c.': 5, pincée: 0.5, pincées: 0.5, pointe: 0.2,
  gousse: 5, gousses: 5, branche: 3, branches: 3, feuille: 0.5, feuilles: 0.5, tige: 40,
  noix: 10, noisette: 5, sachet: 11, botte: 50, bouquet: 30, verre: 120, shot: 30, cm: 5,
  boîte: null, 'grosse boîte': 800, brique: 200, rouleau: 180, paquet: 400, tranches: null,
};
// Cuillère à soupe plus légère pour les poudres.
const SPOON_DRY = /farine|sucre|cannelle|paprika|chapelure/;

const clean = s => norm(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’]/g, "'");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Mot entier, avec pluriel en -s/-x toléré (« oignon » trouve « oignons », pas « blanquette de veau » pour « eau »).
const RX = FOODS.map(f => f[0].map(k => new RegExp('(^|[^a-z])' + esc(k) + '(s|x)?(?![a-z])')));
function findFood(name) {
  const n = clean(name);
  if (/\(option|\(decor/.test(n)) return { skip: true };
  for (let i = 0; i < FOODS.length; i++) if (RX[i].some(rx => rx.test(n))) return { food: FOODS[i] };
  return null;
}

function grams(q, u, name, food) {
  if (typeof q !== 'number') return 0;
  const n = clean(name);
  const piece = food[5];
  if (!u) return piece ? q * piece : 0;
  if (u === 'c. à s.') return q * (SPOON_DRY.test(n) ? 10 : n.includes('huile') ? 13 : 15);
  if (u === 'tranches') return q * (n.includes('gingembre') ? 5 : piece || 100);
  if (u === 'boîte' || u === 'grosse boîte') return q * (UNIT_G[u] || piece || 400);
  const g = UNIT_G[u];
  return g == null ? (piece ? q * piece : 0) : q * g;
}

/** Macros par portion et liste des ingrédients non reconnus. */
export function macros(r) {
  const tot = { kcal: 0, p: 0, g: 0, l: 0 };
  const unknown = [];
  let counted = 0, quantified = 0;
  for (const [q, u, name] of r.ing) {
    const m = findFood(name);
    if (m?.skip) continue;
    if (typeof q === 'number') quantified++;
    if (!m) { unknown.push(name); continue; }
    const w = grams(q, u, name, m.food);
    if (w > 0 || m.food[1] === 0) counted++;
    tot.kcal += (m.food[1] * w) / 100; tot.p += (m.food[2] * w) / 100; tot.g += (m.food[3] * w) / 100; tot.l += (m.food[4] * w) / 100;
  }
  // Par personne, par pièce (financier, bouchon…), ou par part quand la recette donne un plat entier découpé (r.parts).
  const per = r.yield ? 1 : r.p;
  const k = 1 / Math.max(1, r.p * (r.parts || 1));
  return {
    kcal: Math.round(tot.kcal * k / 5) * 5, p: Math.round(tot.p * k), g: Math.round(tot.g * k), l: Math.round(tot.l * k),
    per: r.parts ? `part (1/${r.parts} de la recette)` : r.yield ? r.yield[0] : 'personne', perCount: per, unknown,
    complete: unknown.length === 0, counted, quantified,
  };
}
