// Dessine la fiche recette en image PNG (pour WhatsApp, SMS, mail…).
import { BASE, waitLabel, fmtT, imgUrl, ingList, portionLabel } from './lib.js';
import { recipeUrl, drawQR, APP_URL_SHORT } from './share.jsx';

const C = {
  bg: '#FBF6EA', text: '#1F3A2E', muted: '#587062', sage: '#CFE3C4', peach: '#F8DDB4',
  divider: '#DDE6D6', accent: '#F2A541', pale: '#E7F0E0',
};
const W = 1080, PAD = 72;

const loadImg = src => new Promise(res => {
  if (!src) return res(null);
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export async function renderRecipeCard(r, portions) {
  await Promise.all([
    document.fonts?.load('400 60px Caprasimo'),
    document.fonts?.load('700 30px Figtree'),
    document.fonts?.load('400 30px Figtree'),
  ].filter(Boolean)).catch(() => {});
  const [illu, logo] = await Promise.all([loadImg(imgUrl(r)), loadImg(`${BASE}assets/logo-mark.png`)]);

  const H_FONT = '"Caprasimo", Georgia, serif';
  const B_FONT = '"Figtree", system-ui, sans-serif';
  const ing = ingList(r, portions);
  const steps = r.steps;

  // Première passe : mesurer la hauteur.
  const m = document.createElement('canvas').getContext('2d');
  const inner = W - PAD * 2;
  m.font = `400 76px ${H_FONT}`;
  const titleLines = wrap(m, r.name, inner);
  m.font = `400 33px ${B_FONT}`;
  const ingRows = ing.map(i => wrap(m, i.n, inner - 230));
  const stepRows = steps.map(s => wrap(m, s, inner - 90));
  const heroH = illu ? 470 : 0;
  let h = PAD + heroH + (illu ? 56 : 0) + titleLines.length * 84 + 24 + 64 + 70 // titre + pastilles
    + 70 + ingRows.reduce((a, l) => a + l.length * 44 + 26, 0)
    + 80 + stepRows.reduce((a, l) => a + Math.max(64, l.length * 46) + 22, 0)
    + 330; // pied de page avec QR code

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Math.ceil(h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, cv.height);
  ctx.textBaseline = 'alphabetic';
  let y = PAD;

  if (illu) {
    ctx.fillStyle = C.sage; roundRect(ctx, PAD, y, inner, heroH, 56); ctx.fill();
    const s = Math.min((inner - 80) / illu.width, (heroH - 60) / illu.height);
    const iw = illu.width * s, ih = illu.height * s;
    ctx.drawImage(illu, PAD + (inner - iw) / 2, y + (heroH - ih) / 2, iw, ih);
    y += heroH + 56;
  }

  ctx.fillStyle = C.text; ctx.font = `400 76px ${H_FONT}`;
  for (const l of titleLines) { y += 76; ctx.fillText(l, PAD, y); y += 8; }
  y += 30;

  // Pastilles : temps, portions, catégorie.
  ctx.font = `700 30px ${B_FONT}`;
  let x = PAD;
  for (const [label, bg] of [[fmtT(r.t) + (waitLabel(r) ? ' + ' + waitLabel(r) : ''), C.sage], [portionLabel(r, portions), C.peach], [r.cats[0] || '', C.pale]]) {
    if (!label) continue;
    const w = ctx.measureText(label).width + 48;
    ctx.fillStyle = bg; roundRect(ctx, x, y, w, 58, 29); ctx.fill();
    ctx.fillStyle = C.text; ctx.fillText(label, x + 24, y + 40);
    x += w + 14;
  }
  y += 58 + 76;

  ctx.font = `400 46px ${H_FONT}`; ctx.fillStyle = C.text; ctx.fillText('Ingrédients', PAD, y); y += 34;
  ing.forEach((it, k) => {
    ctx.font = `700 33px ${B_FONT}`; ctx.fillStyle = C.text;
    ctx.fillText(it.q, PAD, y + 44);
    ctx.font = `400 33px ${B_FONT}`;
    ingRows[k].forEach((l, j) => ctx.fillText(l, PAD + 230, y + 44 + j * 44));
    y += ingRows[k].length * 44 + 26;
    ctx.fillStyle = C.divider; ctx.fillRect(PAD, y - 4, inner, 2);
  });
  y += 80;

  ctx.font = `400 46px ${H_FONT}`; ctx.fillStyle = C.text; ctx.fillText('Étapes', PAD, y); y += 34;
  steps.forEach((_, k) => {
    ctx.fillStyle = C.sage; ctx.beginPath(); ctx.arc(PAD + 28, y + 34, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.text; ctx.font = `400 30px ${H_FONT}`; ctx.textAlign = 'center';
    ctx.fillText(String(k + 1), PAD + 28, y + 45); ctx.textAlign = 'left';
    ctx.font = `400 33px ${B_FONT}`;
    stepRows[k].forEach((l, j) => ctx.fillText(l, PAD + 90, y + 46 + j * 46));
    y += Math.max(64, stepRows[k].length * 46) + 22;
  });

  // Pied de page : signature et QR code (lien direct vers la recette, ou vers l'app pour une recette perso).
  const QR = 210, top = cv.height - PAD - QR;
  ctx.fillStyle = C.divider; ctx.fillRect(PAD, top - 40, inner, 2);
  ctx.fillStyle = '#FFFFFF'; roundRect(ctx, W - PAD - QR, top, QR, QR, 28); ctx.fill();
  drawQR(ctx, recipeUrl(r), W - PAD - QR + 14, top + 14, QR - 28, C.text);
  let fy = top + 4;
  if (logo) ctx.drawImage(logo, PAD, fy, 64, 64);
  ctx.fillStyle = C.text; ctx.font = `400 38px ${H_FONT}`;
  ctx.fillText('Zéro Chichi', PAD + (logo ? 82 : 0), fy + 46);
  ctx.fillStyle = C.muted; ctx.font = `400 26px ${B_FONT}`;
  ctx.fillText('Des recettes courtes. Rien de plus.', PAD, fy + 112);
  ctx.fillStyle = C.text; ctx.font = `400 26px ${B_FONT}`;
  ctx.fillText(r.custom ? "Scanne le code pour découvrir l'app" : "Scanne le code pour l'ouvrir dans l'app", PAD, fy + 166);
  ctx.font = `700 28px ${B_FONT}`;
  ctx.fillText(APP_URL_SHORT, PAD, fy + 204);

  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}

export const cardFilename = r => r.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) + '.png';
