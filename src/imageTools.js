// Prépare une illustration choisie sur l'appareil : réduction, fond blanc retiré (option), recadrage.

export async function prepareIllustration(file, removeBg = true) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  let box = { x: 0, y: 0, w, h };
  if (removeBg) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // Couleur du fond : médiane des pixels du bord.
    const edge = [[], [], []];
    const push = i => { edge[0].push(d[i]); edge[1].push(d[i + 1]); edge[2].push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { push((x) * 4); push(((h - 1) * w + x) * 4); }
    for (let y = 0; y < h; y += 2) { push((y * w) * 4); push((y * w + w - 1) * 4); }
    const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const bg = edge.map(med);
    // On ne retire le fond que s'il est clair et uni (papier, fond blanc).
    if (bg[0] + bg[1] + bg[2] > 560) {
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const diff = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
        const a = Math.max(0, Math.min(1, (diff - 14) / 36));
        d[i + 3] = Math.round(d[i + 3] * a);
        if (d[i + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      ctx.putImageData(img, 0, 0);
      if (x1 > x0 && y1 > y0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
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
