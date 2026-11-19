import { recipeShareUrl } from './share.jsx';

/* Lien court (service Cloudflare, dossier worker/) : https://lien.zero-chichi.workers.dev/Ab3dE7f.
   Si le service ne répond pas vite, on garde le lien long : le partage ne bloque jamais. */
const SHORT_LINK_API = 'https://lien.zero-chichi.workers.dev/';
export async function recipeShortUrl(r) {
  const long = await recipeShareUrl(r);
  const code = long.split('#partage=')[1];
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(SHORT_LINK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal: ctl.signal });
    clearTimeout(timer);
    const { url } = res.ok ? await res.json() : {};
    return typeof url === 'string' && url.startsWith(SHORT_LINK_API) ? url : long;
  } catch { return long; }
}
