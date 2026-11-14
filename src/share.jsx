// Partage de l'app et des recettes, QR codes, aide à l'installation.
import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';

export const APP_URL = 'https://philbass.github.io/zero-chichi/';
export const APP_URL_SHORT = 'philbass.github.io/zero-chichi';

/** Lien direct vers une recette du livre (une recette perso n'existe que sur l'appareil qui l'a ajoutée). */
export const recipeUrl = r => (r && !r.custom ? APP_URL + '#recette=' + encodeURIComponent(r.id) : APP_URL);

/** Identifiant de recette demandé par le lien d'ouverture (#recette=…), puis on nettoie l'adresse. */
export function takeDeepLink() {
  if (typeof location === 'undefined') return null;
  const m = location.hash.match(/recette=([^&]+)/);
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* adresse figée */ }
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

function qr(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q;
}

/** QR code en SVG. */
export function QRCode({ text, size = 180, fg = '#1F3A2E', bg = '#FFFFFF', label }) {
  const q = qr(text);
  const n = q.getModuleCount(), m = 2; // marge de 2 modules
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n + m * 2} ${n + m * 2}`} role="img" aria-label={label || 'QR code'} shapeRendering="crispEdges"
      style={{ display: 'block', borderRadius: 16, background: bg }}>
      <path d={d} fill={fg} />
    </svg>
  );
}

/** Dessine un QR code sur un canvas. */
export function drawQR(ctx, text, x, y, size, fg = '#1F3A2E') {
  const q = qr(text);
  const n = q.getModuleCount();
  const cell = Math.floor(size / n), off = Math.floor((size - cell * n) / 2);
  ctx.fillStyle = fg;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + off + c * cell, y + off + r * cell, cell, cell);
}

/**
 * Envoie un lien : menu de partage du téléphone, sinon copie.
 * Renvoie 'shared', 'copied', 'abort' ou 'failed'.
 */
export async function shareLink({ title, text, url }) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (e) {
    if (e?.name === 'AbortError') return 'abort';
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}

/* ── Installation ─────────────────────────────────────── */
let deferred = null;
const subs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; subs.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach(f => f()); });
}

const DISMISS = 'zc:installDismissed';
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** État de la bannière d'installation : null (rien à proposer) ou { native, install(), dismiss() }. */
export function useInstall() {
  const [, bump] = useState(0);
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem(DISMISS); } catch { return false; } });
  useEffect(() => { const f = () => bump(n => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  if (typeof window === 'undefined' || dismissed || isStandalone()) return null;
  if (document.documentElement.classList.contains('embed')) return null; // page Claude : pas d'installation
  if (!deferred && !matchMedia('(pointer: coarse)').matches) return null; // ordinateur sans proposition native
  const dismiss = () => { try { localStorage.setItem(DISMISS, '1'); } catch { /* stockage indisponible */ } setDismissed(true); };
  return {
    native: !!deferred,
    ios: isIOS(),
    dismiss,
    install: async () => {
      if (!deferred) return false;
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      deferred = null;
      if (r?.outcome === 'accepted') dismiss();
      bump(n => n + 1);
      return true;
    },
  };
}
