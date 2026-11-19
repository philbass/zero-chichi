// Prompt d'illustration pour une recette perso : le même que celui des illustrations de l'app
// (scripts/illustrations), sans la mention des images de référence, qu'une IA grand public n'a pas.
import STYLE from '../scripts/illustrations/style.txt?raw';
import SCENES from '../scripts/illustrations/scenes.json';

const BASIQUES = /^(sel|poivre|eau|huile|beurre|sel,? poivre|sel et poivre)\b/i;
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const style = STYLE
  .replace(/,? exactly like the reference images\./, '.')
  .split('\n').filter(l => !/reference images/i.test(l)).join('\n');

/** r : { name, cats, ing } — ing au format [quantité, unité, nom]. */
export function illustrationPrompt(r) {
  const cat = Object.keys(SCENES).find(c => (r.cats || []).includes(c)) || '*';
  const choix = SCENES[cat];
  const scene = SCENES.decors[choix[hash(r.name || '') % choix.length]];
  const ing = (r.ing || []).map(i => String(i[2] || '').replace(/\(.*?\)/g, '').trim())
    .filter(n => n && !BASIQUES.test(n)).slice(0, 4);
  return style
    .replace('{plat}', r.name)
    .replace('{scene}', scene)
    .replace('{ingredients}', ing.join(', ') || 'a few of its key ingredients')
    .trim();
}
