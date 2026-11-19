// Après le build : une petite page par recette publiée (dist/r/<id>/), pour des liens lisibles
// (philbass.github.io/zero-chichi/r/crepes) et un aperçu avec l'illustration dans WhatsApp, SMS, mail…
// La page ouvre aussitôt la recette dans l'app (#recette=<id>).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { RECIPES } from './src/data.js';

const APP = 'https://philbass.github.io/zero-chichi/';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const duree = m => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''));

let n = 0;
for (const r of RECIPES) {
  const dir = join('dist', 'r', r.id);
  mkdirSync(dir, { recursive: true });
  const src = r.img && join('public', 'assets', 'illus', r.img.includes('.') ? r.img : r.img + '.png');
  let image = APP + 'og-image.jpg?v=2';
  if (src && existsSync(src)) {
    // Illustration détourée posée sur le fond crème de l'app, au format des aperçus (1200 × 630).
    const illus = await sharp(src).resize(1080, 560, { fit: 'inside' }).toBuffer();
    await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#FBF6EA' } })
      .composite([{ input: illus, gravity: 'center' }]).jpeg({ quality: 80 }).toFile(join(dir, 'og.jpg'));
    image = APP + 'r/' + r.id + '/og.jpg';
  }
  const url = APP + 'r/' + r.id;
  const title = r.name + ' · Zéro Chichi';
  const desc = `Prête en ${duree(r.t)}, ${r.ing.length} ingrédients. Une recette courte, rien de plus.`;
  const target = '../../#recette=' + encodeURIComponent(r.id);
  writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Zéro Chichi"><meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${url}"><meta property="og:title" content="${esc(r.name)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${image}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc('Illustration : ' + r.name)}"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#FBF6EA">
<meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF6EA;color:#1F3A2E;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}a{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:999px;background:#F2A541;color:#1F3A2E;font-weight:700;text-decoration:none}</style>
</head><body><main><h1 style="font-size:24px;margin:0 0 8px">${esc(r.name)}</h1><p style="margin:0">${esc(desc)}</p><a href="${target}">Ouvrir la recette</a></main></body></html>
`);
  n++;
}
console.log(n + ' pages de recettes');
