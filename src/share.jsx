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

/** Navigateur, pour adapter le guide d'installation. */
export function installPlatform() {
  const ua = navigator.userAgent;
  if (isIOS()) {
    if (/FBAN|FBAV|FB_IAB|Instagram|Snapchat|LinkedInApp|Twitter|Line\/|GSA\/|Pinterest|TikTok|musical_ly/i.test(ua)) return 'ios-inapp';
    if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  return /android/i.test(ua) ? 'android' : 'other';
}
/** Android : page ouverte dans le navigateur intégré d'une app (WebView « wv », WhatsApp, Instagram, Facebook…). */
export const isAndroidInApp = () => /android/i.test(navigator.userAgent) && /; wv\)|WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\/|TikTok|musical_ly/i.test(navigator.userAgent);
export const isIPad = () => /ipad/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Aperçu : bannière forcée et choix du téléphone simulé (jamais dans l'app publiée).
export const INSTALL_PREVIEW = import.meta.env.VITE_INSTALL_PREVIEW === '1';

/** État de la bannière d'installation : null (rien à proposer) ou { native, install(), dismiss() }. */
export function useInstall() {
  const [, bump] = useState(0);
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem(DISMISS); } catch { return false; } });
  useEffect(() => { const f = () => bump(n => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  if (typeof window === 'undefined' || (!INSTALL_PREVIEW && (dismissed || isStandalone()))) return null;
  if (INSTALL_PREVIEW) return { native: false, ios: true, dismiss: () => {}, install: async () => false, preview: true };
  if (document.documentElement.classList.contains('embed')) return null; // page Claude : pas d'installation
  // Android, lien ouvert dans une app (WhatsApp, Instagram, Facebook…) : pas d'installation possible ici.
  if (!deferred && isAndroidInApp()) return { inapp: true, dismiss: () => { try { localStorage.setItem(DISMISS, '1'); } catch { /* stockage indisponible */ } setDismissed(true); } };
  // Sans installation directe du navigateur, on ne propose le guide que sur iPhone / iPad.
  if (!deferred && !isIOS()) return null;
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

/* ── Recettes perso envoyées par lien (#partage=…) ─────── */
// Le lien contient toute la recette, compressée. Les photos personnelles n'y sont pas (trop lourdes) :
// seule une illustration de l'app (r.img) voyage avec la recette.
const b64url = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function pipe(bytes, Stream, mode) {
  const out = new Blob([bytes]).stream().pipeThrough(new Stream(mode));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function recipeShareUrl(r) {
  const data = { v: 1, n: r.name, c: r.cats, t: r.t, p: r.p, i: r.ing, s: r.steps };
  if (r.wait) data.w = r.wait;
  if (r.yield) data.y = r.yield;
  if (r.img && !r.imgAsset && !r.imgData) data.im = r.img;
  const raw = new TextEncoder().encode(JSON.stringify(data));
  let code;
  try { code = 'z' + b64url(await pipe(raw, CompressionStream, 'deflate-raw')); } catch { code = 'j' + b64url(raw); }
  return APP_URL + '#partage=' + code;
}

/** Lien de recette perso dans l'adresse : renvoie le code et nettoie l'adresse. */
export function takeSharedCode() {
  if (typeof location === 'undefined') return null;
  const m = location.hash.match(/partage=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* adresse figée */ }
  return m[1];
}

/** Décode une recette reçue ; null si le lien est abîmé. */
export async function decodeSharedRecipe(code) {
  try {
    if (!code || code.length > 60000) return null;
    let bytes = unb64url(code.slice(1));
    if (code[0] === 'z') bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
    else if (code[0] !== 'j') return null;
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if (d?.v !== 1 || typeof d.n !== 'string' || !Array.isArray(d.i) || !Array.isArray(d.s)) return null;
    const str = (v, max) => String(v ?? '').slice(0, max);
    const r = {
      name: str(d.n, 90).trim() || 'Recette partagée',
      cats: (Array.isArray(d.c) ? d.c : []).map(c => str(c, 30)).slice(0, 3),
      t: Math.max(1, Math.round(+d.t) || 30),
      p: Math.max(1, Math.min(50, Math.round(+d.p) || 4)),
      ing: d.i.slice(0, 60).filter(Array.isArray).map(([q, u, n]) => [
        typeof q === 'number' && isFinite(q) ? q : q == null ? null : str(q, 20), str(u, 20), str(n, 120)]).filter(x => x[2].trim()),
      steps: d.s.slice(0, 40).map(s => str(s, 600).trim()).filter(Boolean),
    };
    if (Array.isArray(d.w) && +d.w[0] > 0) r.wait = [Math.round(+d.w[0]), str(d.w[1], 30) || 'de repos'];
    if (Array.isArray(d.y) && d.y.length === 2) r.yield = d.y.map(x => str(x, 20));
    if (typeof d.im === 'string' && /^[a-z0-9-]+\.webp$/.test(d.im)) r.img = d.im;
    return r;
  } catch { return null; }
}
