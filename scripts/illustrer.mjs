// Génère les illustrations manquantes des recettes avec Gemini, dans le style « carnet ».
//
//   node scripts/illustrer.mjs                     recettes sans image + celles listées à refaire
//   node scripts/illustrer.mjs --detourer a.png b.webp   détoure seulement une image existante (test)
//
// Variables : GEMINI_API_KEY (obligatoire), GEMINI_MODEL (facultatif),
//             A_REFAIRE (identifiants séparés par des espaces), RAPPORT (fichier du compte rendu).
// Lancé automatiquement par .github/workflows/illustrations.yml.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { edgeStats, cutoutPixels } from '../src/imageTools.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'src/data.js');
const ILLUS = join(ROOT, 'public/assets/illus');
const DIR = join(ROOT, 'scripts/illustrations');
const LISTE = join(DIR, 'a-refaire.txt');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const LARGEUR = 640;

/** Image générée (PNG/JPEG) → illustration de l'app : fond retiré, recadrée, 640 px, WebP. */
async function detourer(buf) {
  const { data, info } = await sharp(buf)
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const { bg, uniform } = edgeStats(data, w, h);
  if (uniform < 0.6) throw new Error('fond pas assez uni pour être retiré');
  const box = cutoutPixels(data, w, h, bg, true);
  if (!box) throw new Error('image vide après détourage');
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize({ width: LARGEUR, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
}

if (process.argv[2] === '--detourer') {
  writeFileSync(process.argv[4], await detourer(readFileSync(process.argv[3])));
  console.log('Écrit :', process.argv[4]);
  process.exit(0);
}

/* ── Recettes ─────────────────────────────────────────────────────────── */
const src = readFileSync(DATA, 'utf8');
const tmp = join(mkdtempSync(join(tmpdir(), 'zc-')), 'data.mjs');
writeFileSync(tmp, src + '\nexport { ALL_RECIPES };\n');
const { ALL_RECIPES } = await import(pathToFileURL(tmp).href);

const BASIQUES = /^(sel|poivre|eau|huile|beurre|sel,? poivre|sel et poivre)\b/i;
const ingredients = r => (r.ing || [])
  .filter(Array.isArray)
  .map(i => String(i[2] || '').replace(/\(.*?\)/g, '').trim())
  .filter(n => n && !BASIQUES.test(n))
  .slice(0, 4);

const style = readFileSync(join(DIR, 'style.txt'), 'utf8');
const prompt = r => style
  .replace('{plat}', r.name)
  .replace('{ingredients}', ingredients(r).join(', ') || 'a few of its key ingredients');

const refs = readdirSync(join(DIR, 'references'))
  .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
  .map(f => ({ inline_data: {
    mime_type: f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
    data: readFileSync(join(DIR, 'references', f)).toString('base64'),
  } }));

/* ── Quelles recettes ? ───────────────────────────────────────────────── */
const lignes = existsSync(LISTE) ? readFileSync(LISTE, 'utf8').split('\n') : [];
const aRefaire = new Set([
  ...lignes.map(l => l.replace(/#.*/, '').trim()).filter(Boolean),
  ...(process.env.A_REFAIRE || '').split(/[\s,]+/).filter(Boolean),
]);
for (const id of aRefaire) if (!ALL_RECIPES.some(r => r.id === id)) console.warn(`⚠️  Recette inconnue : ${id}`);

const cibles = ALL_RECIPES.filter(r => aRefaire.has(r.id) || !r.img || !existsSync(join(ILLUS, r.img)));
if (!cibles.length) { console.log('Toutes les recettes ont leur illustration.'); process.exit(0); }
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY manquante.'); process.exit(1); }

/* ── Gemini ───────────────────────────────────────────────────────────── */
async function generer(texte, avecFormat = true) {
  const body = {
    contents: [{ parts: [...refs, { text: texte }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(avecFormat && { imageConfig: { aspectRatio: '16:9' } }) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || res.statusText;
    if (avecFormat && res.status === 400 && /imageConfig|aspect/i.test(msg)) return generer(texte, false);
    if (res.status === 429 && /free_tier|limit: 0/.test(msg)) {
      const e = new Error('facturation non activée sur le projet Google de la clé (offre gratuite : 0 image autorisée)');
      e.fatal = true; throw e;
    }
    if (res.status === 401 || res.status === 403) { const e = new Error('clé GEMINI_API_KEY refusée'); e.fatal = true; throw e; }
    throw new Error(`Gemini ${res.status} : ${msg.split('\n')[0].slice(0, 200)}`);
  }
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
  if (!part) throw new Error('aucune image renvoyée (' + (json.candidates?.[0]?.finishReason || 'raison inconnue') + ')');
  return Buffer.from((part.inlineData || part.inline_data).data, 'base64');
}

/* ── Boucle ───────────────────────────────────────────────────────────── */
let data = src;
const faites = [], ratees = [];
for (const r of cibles) {
  const fichier = r.img || `${r.id}.webp`;
  let derniere;
  for (let essai = 1; essai <= 3; essai++) {
    try {
      writeFileSync(join(ILLUS, fichier), await detourer(await generer(prompt(r))));
      if (!r.img) {
        // La recette n'indiquait pas d'image : on l'ajoute juste après son identifiant.
        const re = new RegExp(`((["']?)id\\2\\s*:\\s*(["'])${r.id}\\3\\s*,)`);
        data = data.replace(re, `$1"img":"${fichier}",`);
      }
      faites.push({ ...r, img: fichier });
      console.log(`✅ ${r.id} → ${fichier}`);
      derniere = null;
      break;
    } catch (e) {
      derniere = e;
      if (e.fatal) break;
      console.warn(`… ${r.id}, essai ${essai} : ${e.message}`);
      await new Promise(ok => setTimeout(ok, 3000 * essai));
    }
  }
  if (derniere) {
    ratees.push({ id: r.id, raison: derniere.message }); console.error(`❌ ${r.id} : ${derniere.message}`);
    // Problème de clé ou de facturation : inutile d'essayer les suivantes.
    if (derniere.fatal) { for (const x of cibles.slice(cibles.indexOf(r) + 1)) ratees.push({ id: x.id, raison: derniere.message }); break; }
  }
}

if (data !== src) writeFileSync(DATA, data);
// Les recettes refaites avec succès sont retirées de la liste.
if (lignes.length) {
  const ok = new Set(faites.map(r => r.id));
  writeFileSync(LISTE, lignes.filter(l => !ok.has(l.replace(/#.*/, '').trim())).join('\n'));
}

/* ── Compte rendu (commentaire sur la Pull Request) ───────────────────── */
let md = '';
if (faites.length) {
  md += `### 🎨 ${faites.length} illustration${faites.length > 1 ? 's' : ''} générée${faites.length > 1 ? 's' : ''}\n\n`;
  for (const r of faites) md += `**${r.name}** · \`${r.id}\`\n\n<img src="https://raw.githubusercontent.com/{REPO}/{SHA}/public/assets/illus/${r.img}" width="320">\n\n`;
  md += 'Pour en refaire une, réponds `/refaire identifiant` (plusieurs possibles, séparés par des espaces).\n';
}
if (ratees.length) {
  md += `\n### ⚠️ Pas d'illustration pour ${ratees.length} recette${ratees.length > 1 ? 's' : ''}\n\n`;
  for (const r of ratees) md += `- \`${r.id}\` : ${r.raison}\n`;
  md += '\nElles s\'afficheront avec l\'illustration par défaut. Réponds `/refaire identifiant` pour réessayer.\n';
}
if (process.env.RAPPORT && md) writeFileSync(process.env.RAPPORT, md);
console.log(`\n${faites.length} faite(s), ${ratees.length} ratée(s).`);
if (!faites.length && ratees.length) process.exit(1);
