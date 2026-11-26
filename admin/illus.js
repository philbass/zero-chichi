// Prompt d'illustration : exactement celui de scripts/illustrer.mjs (images de référence comprises,
// ajoutées par le relais), avec la même mise en scène choisie d'après l'identifiant de la recette.
import STYLE from '../scripts/illustrations/style.txt?raw';
import SCENES from '../scripts/illustrations/scenes.json';

const BASIQUES = /^(sel|poivre|eau|huile|beurre|sel,? poivre|sel et poivre)\b/i;
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function promptIllustration(r, essai = 0) {
  const cat = Object.keys(SCENES).find(c => (r.cats || []).includes(c)) || '*';
  const choix = SCENES[cat];
  // Pour « Autre illustration », on change de mise en scène au sein de la même catégorie.
  const scene = SCENES.decors[choix[(hash(r.id) + essai) % choix.length]];
  const ing = (r.ing || []).filter(Array.isArray).map(i => String(i[2] || '').replace(/\(.*?\)/g, '').trim())
    .filter(n => n && !BASIQUES.test(n)).slice(0, 4);
  return STYLE.replace('{plat}', r.name).replace('{scene}', scene)
    .replace('{ingredients}', ing.join(', ') || 'a few of its key ingredients');
}
