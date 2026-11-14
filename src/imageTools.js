// Prépare une illustration choisie sur l'appareil, comme pour les illustrations de l'app :
// fond uni retiré (vert, crème, blanc…), voile des bords effacé, taches isolées supprimées,
// reflets clairs rebouchés, étiquette du bas retirée (option), puis recadrage.

const MAX = 800;

/** Médiane de chaque canal sur les pixels du bord. */
function edgeStats(d, w, h) {
  const ch = [[], [], []];
  const push = i => { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); };
  for (let x = 0; x < w; x += 2) for (const y of [0, 1, 2, h - 3, h - 2, h - 1]) push((y * w + x) * 4);
  for (let y = 0; y < h; y += 2) for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) push((y * w + x) * 4);
  const med = a => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  const bg = ch.map(med);
  // Part des pixels du bord proches de la médiane : un fond uni en a presque 100 %.
  let close = 0;
  for (let k = 0; k < ch[0].length; k++) {
    if (Math.max(Math.abs(ch[0][k] - bg[0]), Math.abs(ch[1][k] - bg[1]), Math.abs(ch[2][k] - bg[2])) < 40) close++;
  }
  return { bg, uniform: close / ch[0].length };
}

/** Dilatation carrée (rayon r) d'un masque binaire. */
function dilate(m, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = m[y * w + k];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
    out[y * w + x] = v;
  }
  return out;
}

/** Étiquettes des zones connexes d'un masque : { lab, comps: [{ size, x0, y0, x1, y1 }] }. */
function components(m, w, h) {
  const lab = new Int32Array(w * h), comps = [null], q = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const k = comps.length, c = { size: 0, x0: w, y0: h, x1: 0, y1: 0 };
    let head = 0, tail = 0; q[tail++] = s; lab[s] = k;
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p / w) | 0;
      c.size++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (n >= 0 && m[n] && !lab[n]) { lab[n] = k; q[tail++] = n; }
      }
    }
    comps.push(c);
  }
  return { lab, comps };
}

/**
 * @param {Blob} file  image choisie
 * @param {boolean} removeBg  retirer le fond
 * @param {boolean} removeLabel  retirer l'étiquette (titre) sous le dessin
 */
export async function prepareIllustration(file, removeBg = true, removeLabel = true) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  let box = { x: 0, y: 0, w, h };
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const { bg, uniform } = edgeStats(d, w, h);

  // Un fond trop varié (photo) : on ne touche à rien.
  if (removeBg && uniform > 0.6) {
    const N = w * h, alpha = new Float32Array(N);
    const bgSum = bg[0] + bg[1] + bg[2];
    const mx = Math.round(0.09 * Math.min(w, h));
    for (let p = 0; p < N; p++) {
      const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const diff = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      let a = Math.max(0, Math.min(1, (diff - 22) / 36));
      // Voile clair vers les bords (dégradé ajouté par le générateur d'images)
      const x = p % w, y = (p / w) | 0;
      if ((x < mx || x >= w - mx || y < mx || y >= h - mx) && r + g + b > bgSum + 6 && Math.max(r, g, b) - Math.min(r, g, b) < 40) a = 0;
      alpha[p] = a;
    }

    // Taches isolées : on travaille sur une version réduite (200 px de large).
    const sw = 200, sh = Math.max(1, Math.round(200 * h / w));
    let small = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const X = Math.min(w - 1, Math.floor(x * w / sw)), Y = Math.min(h - 1, Math.floor(y * h / sh));
      small[y * sw + x] = alpha[Y * w + X] > 0.35 ? 1 : 0;
    }
    small = dilate(small, sw, sh, 2);
    const { lab, comps } = components(small, sw, sh);
    const big = Math.max(0, ...comps.slice(1).map(c => c.size));
    const keep = new Uint8Array(comps.length);
    for (let k = 1; k < comps.length; k++) {
      const c = comps[k];
      keep[k] = c.size >= 0.03 * big ? 1 : 0;
    }
    let keepMask = new Uint8Array(sw * sh);
    for (let p = 0; p < sw * sh; p++) keepMask[p] = keep[lab[p]];
    keepMask = dilate(keepMask, sw, sh, 1);

    // Étiquette du bas : bloc plus large que haut, dans le bas de l'image, détaché du dessin.
    // On la cherche sans dilatation pour ne pas la souder aux éléments voisins.
    if (removeLabel) {
      const raw = new Uint8Array(sw * sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const X = Math.min(w - 1, Math.floor(x * w / sw)), Y = Math.min(h - 1, Math.floor(y * h / sh));
        raw[y * sw + x] = alpha[Y * w + X] > 0.35 ? 1 : 0;
      }
      // Composantes sans dilatation : l'étiquette reste séparée des éléments voisins.
      const R = components(raw, sw, sh);
      let bigK = 1;
      for (let k = 2; k < R.comps.length; k++) if (R.comps[k].size > R.comps[bigK].size) bigK = k;
      // Candidats : éléments du bas, proches du centre (un cadre, ou les lettres d'un titre).
      const cand = [];
      for (let k = 1; k < R.comps.length; k++) {
        const c = R.comps[k];
        if (k === bigK || c.size < 2 || c.y0 < 0.6 * sh || c.y1 - c.y0 + 1 > 0.22 * sh) continue;
        if (Math.abs((c.x0 + c.x1) / 2 - sw / 2) > 0.25 * sw) continue;
        cand.push({ ...c });
      }
      // Regroupe les éléments alignés sur les mêmes lignes et proches (lettres d'un même titre).
      let merged = true;
      while (merged) {
        merged = false;
        for (let i = 0; i < cand.length && !merged; i++) for (let j = i + 1; j < cand.length && !merged; j++) {
          const a = cand[i], b = cand[j];
          const rows = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= -3;
          const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
          if (rows && gap <= 6) {
            cand[i] = { size: a.size + b.size, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
            cand.splice(j, 1); merged = true;
          }
        }
      }
      for (const c of cand) {
        const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
        if (!(ch < 0.22 * sh && cw > 0.15 * sw && cw > 1.6 * ch)) continue;
        // On vide tout le bloc (texte compris), sauf ce qui appartient au dessin principal.
        for (let y = Math.max(0, c.y0 - 2); y <= Math.min(sh - 1, c.y1 + 2); y++)
          for (let x = Math.max(0, c.x0 - 2); x <= Math.min(sw - 1, c.x1 + 2); x++)
            if (R.lab[y * sw + x] !== bigK) keepMask[y * sw + x] = 0;
      }
    }
    for (let p = 0; p < N; p++) {
      const x = p % w, y = (p / w) | 0;
      if (!keepMask[Math.min(sh - 1, Math.floor(y * sh / h)) * sw + Math.min(sw - 1, Math.floor(x * sw / w))]) alpha[p] = 0;
    }

    // Reflets clairs enfermés dans le dessin : on les rebouche.
    const outside = new Uint8Array(N), q = new Int32Array(N);
    let head = 0, tail = 0;
    const seed = p => { if (!outside[p] && alpha[p] <= 0.25) { outside[p] = 1; q[tail++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p / w) | 0;
      if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
    }

    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let p = 0; p < N; p++) {
      const a = outside[p] ? alpha[p] : 1;
      d[p * 4 + 3] = Math.round(d[p * 4 + 3] * a);
      if (d[p * 4 + 3] > 40) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    ctx.putImageData(img, 0, 0);
    if (x1 > x0 && y1 > y0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d').drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  let blob = await new Promise(res => out.toBlob(res, 'image/webp', 0.85));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(res => out.toBlob(res, 'image/png'));
  return blob;
}

export const blobToDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});
