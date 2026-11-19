// Liens courts Zéro Chichi.
// POST /            { code }  → { url }   enregistre une recette perso partagée (code « #partage=… » de l'app)
// GET  /<id>                  → page qui ouvre l'app avec la recette (et aperçu pour WhatsApp, SMS…)
const APP = 'https://philbass.github.io/zero-chichi/';
const ORIGINS = ['https://philbass.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const KEEP = 365 * 24 * 3600; // un an
const MAX_CODE = 12000;
const ID = /^[0-9A-Za-z]{7}$/;

const cors = req => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};
const json = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Décode le code de l'app ; renvoie la recette (au moins un nom) ou null. */
async function decode(code) {
  try {
    if (typeof code !== 'string' || code.length > MAX_CODE || !/^[zj][A-Za-z0-9_-]{8,}$/.test(code)) return null;
    let bytes = Uint8Array.from(atob(code.slice(1).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if (code[0] === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    const d = JSON.parse(new TextDecoder().decode(bytes));
    return d?.v === 1 && typeof d.n === 'string' && Array.isArray(d.i) && Array.isArray(d.s) ? d : null;
  } catch { return null; }
}

/** Même recette = même lien : identifiant tiré de l'empreinte du code. */
async function idOf(code) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let n = 0n;
  for (const b of h.slice(0, 8)) n = (n << 8n) | BigInt(b);
  let s = '';
  for (let i = 0; i < 7; i++) { s += A[Number(n % 62n)]; n /= 62n; }
  return s;
}

function page({ title, text, target }) {
  const t = esc(title), d = esc(text);
  const go = target ? `<meta http-equiv="refresh" content="0;url=${esc(target)}"><script>location.replace(${JSON.stringify(target)})</script>` : '';
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title><meta name="description" content="${d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Zéro Chichi"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
<meta property="og:image" content="${APP}og-image.jpg?v=2"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#FBF6EA">${go}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF6EA;color:#1F3A2E;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}a{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:999px;background:#F2A541;color:#1F3A2E;font-weight:700;text-decoration:none}</style>
</head><body><main><h1 style="font-size:24px;margin:0 0 8px">${t}</h1><p style="margin:0">${d}</p><a href="${esc(target || APP)}">Ouvrir Zéro Chichi</a></main></body></html>`,
    { status: target ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': target ? 'public, max-age=3600' : 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    if (req.method === 'POST' && url.pathname === '/') {
      let code;
      try { ({ code } = await req.json()); } catch { return json(req, { error: 'bad-request' }, 400); }
      if (!(await decode(code))) return json(req, { error: 'invalid' }, 400);
      const id = await idOf(code);
      if ((await env.PARTAGES.get(id)) !== code) await env.PARTAGES.put(id, code, { expirationTtl: KEEP });
      return json(req, { url: url.origin + '/' + id });
    }

    if (req.method === 'GET') {
      const id = url.pathname.slice(1);
      if (!id) return Response.redirect(APP, 302);
      if (!ID.test(id)) return page({ title: 'Lien introuvable', text: 'Ce lien de recette n’existe pas.' });
      const code = await env.PARTAGES.get(id);
      const d = code && (await decode(code));
      if (!d) return page({ title: 'Lien expiré', text: 'Cette recette n’est plus disponible. Demande à ton ami de te la renvoyer.' });
      const name = d.n.slice(0, 90).trim() || 'Une recette';
      return page({ title: name + ' · Zéro Chichi', text: 'Une recette perso partagée avec toi. Ouvre-la pour l’ajouter à ton app.', target: APP + '#partage=' + code });
    }
    return new Response('Méthode non prise en charge', { status: 405 });
  },
};
