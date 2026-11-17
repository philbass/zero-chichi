// Saisie d'une recette : photo, titre, ingrédients (une case), étapes (une case chacune), détails facultatifs.
// « Coller une recette entière » remplit les cases d'après un texte collé (ou une photo de fiche dans Claude).
import { useEffect, useRef, useState } from 'react';
import { WAIT_TYPES, aiPrompt, formatPrompt, illus, imgUrl, ingredientToLine, normalizeRecipe, parseIngredient, parseRecipeText, guessCats, estimateTime } from './lib.js';
import { prepareIllustration } from './imageTools.js';
import { getCapability } from './store.js';

const toForm = r => ({
  name: r.name || '',
  cats: r.cats || [],
  t: String(r.t || ''),
  wait: r.wait ? String(r.wait[0]) : '',
  waitType: r.wait ? r.wait[1] : 'de marinade',
  p: String(r.p || ''),
  unit: r.yield ? r.yield[1] : '',
  ing: (r.ing || []).map(ingredientToLine).join('\n'),
  steps: (r.steps || []).join('\n'),
  notes: r.notes || [],
  tip: r.tip || '',
});

const singular = w => w.replace(/(x|s)$/i, '');

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
}

const label = { fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-700)', letterSpacing: '.04em', textTransform: 'uppercase' };
const field = { display: 'flex', flexDirection: 'column', gap: 6 };
const area = { width: '100%', font: 'inherit', fontSize: 15, lineHeight: 1.5, color: 'var(--color-text)', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 22, padding: '12px 16px', resize: 'vertical' };

export default function RecipeEditor({ initial, cats, onAddCat, onSave, onDelete, onReset, onBack }) {
  const [form, setForm] = useState(() => toForm(initial || {}));
  const [steps, setSteps] = useState(() => (initial?.steps?.length ? [...initial.steps] : ['']));
  const [catsTouched, setCatsTouched] = useState(!!initial);
  const [details, setDetails] = useState(!!initial);
  const [paste, setPaste] = useState(null); // null | { text, photo }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filled, setFilled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [canPhoto, setCanPhoto] = useState(false);
  const [image, setImage] = useState({ mode: 'keep' }); // keep | new (file, blob, url, cut) | remove
  const [saving, setSaving] = useState(false);
  const abort = useRef(null);
  const stepRefs = useRef([]);
  const focusStep = useRef(null);

  useEffect(() => {
    getCapability('sample').then(s => s?.limits?.().then(l => setCanPhoto(!!l?.images)).catch(() => {}));
    return () => abort.current?.abort();
  }, []);
  useEffect(() => () => { if (paste?.photo) URL.revokeObjectURL(paste.photo.url); }, [paste?.photo]);
  useEffect(() => () => { if (image.url) URL.revokeObjectURL(image.url); }, [image.url]);
  // Cases d'étapes à la hauteur de leur texte (pour les navigateurs sans « field-sizing »).
  useEffect(() => {
    stepRefs.current.forEach(el => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(46, el.scrollHeight + 2) + 'px'; } });
  }, [steps]);
  useEffect(() => {
    if (focusStep.current == null) return;
    const el = stepRefs.current[focusStep.current];
    focusStep.current = null;
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange?.(n, n); }
  });

  const pickImage = async (file, cut) => {
    if (!file) return;
    try {
      const blob = await prepareIllustration(file, cut, cut);
      setImage({ mode: 'new', file, blob, url: URL.createObjectURL(blob), cut });
    } catch { setError("Impossible d'ouvrir cette image. Essaie un fichier JPG ou PNG."); }
  };
  const currentUrl = image.mode === 'new' ? image.url : image.mode === 'remove' ? null : initial ? imgUrl(initial) : null;

  const set = (k, v) => { setError(''); setForm(f => ({ ...f, [k]: v })); };
  const guessed = guessCats(form.name, form.ing, cats);
  const shownCats = catsTouched ? form.cats : guessed;
  const toggleCat = c => { setError(''); setCatsTouched(true); setForm(f => { const base = catsTouched ? f.cats : guessed; return { ...f, cats: base.includes(c) ? base.filter(x => x !== c) : [...base, c] }; }); };
  const cleanSteps = steps.map(s => s.trim()).filter(Boolean);
  const autoT = estimateTime(cleanSteps);

  /* ── Étapes : une case chacune ── */
  const setStep = (i, v) => { setError(''); setSteps(st => st.map((s, k) => (k === i ? v : s))); };
  const addStep = (after = steps.length - 1, value = '') => {
    setSteps(st => [...st.slice(0, after + 1), value, ...st.slice(after + 1)]);
    focusStep.current = after + 1;
  };
  const removeStep = i => {
    setSteps(st => (st.length > 1 ? st.filter((_, k) => k !== i) : ['']));
    focusStep.current = Math.max(0, i - 1);
  };
  const onStepKey = (e, i) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addStep(i); }
    else if (e.key === 'Backspace' && !steps[i] && steps.length > 1) { e.preventDefault(); removeStep(i); }
  };
  const onStepPaste = (e, i) => {
    const txt = e.clipboardData?.getData('text') || '';
    const lines = txt.split(/\r?\n/).map(l => l.replace(/^\s*(?:\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    setSteps(st => [...st.slice(0, i), ...(st[i].trim() ? [st[i], ...lines] : lines), ...st.slice(i + 1)]);
    focusStep.current = i + lines.length - (steps[i].trim() ? 0 : 1);
  };

  /* ── Coller une recette entière ── */
  const fillFrom = r => {
    const f = toForm(r);
    const okCats = (r.cats || []).filter(c => cats.includes(c));
    setForm(x => ({ ...x, name: f.name || x.name, ing: f.ing || x.ing, t: f.t, p: f.p || x.p, unit: f.unit, wait: f.wait, waitType: f.waitType, notes: f.notes,
      tip: f.tip || x.tip, cats: okCats.length ? okCats : x.cats }));
    if (okCats.length) setCatsTouched(true);
    setSteps(r.steps?.length ? [...r.steps] : steps);
    setPaste(null); setFilled(true); setError('');
  };
  const format = async () => {
    setError('');
    if (!paste.text.trim() && !paste.photo) { setError('Colle le texte de la recette ou ajoute une photo.'); return; }
    // Une adresse web seule : l'app ne peut pas aller lire un autre site.
    if (!paste.photo && /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(paste.text)) {
      setError("Les adresses web ne peuvent pas être lues directement. Ouvre la recette dans ton navigateur, copie son texte (titre, ingrédients et étapes) et colle-le ici.");
      return;
    }
    setBusy(true);
    const sample = await getCapability('sample');
    if (!sample) {
      if (!paste.text.trim()) { setBusy(false); setError("La lecture d'une photo n'est possible que dans Claude. Colle plutôt le texte."); return; }
      fillFrom(parseRecipeText(paste.text)); setBusy(false); return;
    }
    abort.current = new AbortController();
    try {
      const raw = await sample.json(formatPrompt(paste.text, cats, !!paste.photo), { images: paste.photo ? [paste.photo.blob] : undefined, signal: abort.current.signal });
      fillFrom(normalizeRecipe(raw, cats));
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (e?.code === 'rate_limited') setError('Claude est très demandé en ce moment. Réessaie dans une minute.');
      else if (paste.text.trim()) fillFrom(parseRecipeText(paste.text));
      else setError('Impossible de lire la photo. Essaie avec le texte de la recette.');
    } finally { setBusy(false); }
  };

  const save = async () => {
    const ing = form.ing.split('\n').map(parseIngredient).filter(Boolean);
    const t = parseInt(form.t, 10), p = parseInt(form.p, 10);
    if (!form.name.trim()) return setError('Donne un titre à la recette.');
    if (!ing.length) return setError('Ajoute au moins un ingrédient.');
    if (!cleanSteps.length) return setError('Décris au moins une étape.');
    const finalCats = shownCats.length ? shownCats : ['Plats'];
    const unit = form.unit.trim();
    const w = parseInt(form.wait, 10);
    const fields = { name: form.name.trim(), cats: finalCats, t: t > 0 ? t : autoT, wait: w > 0 ? [w, form.waitType] : null, p: p > 0 ? p : 4, ing, steps: cleanSteps, tip: form.tip.trim() || null };
    if (unit && !/^pers/i.test(unit)) fields.yield = [singular(unit), unit];
    setSaving(true);
    const ok = await onSave(fields, image.mode === 'new' ? { blob: image.blob } : image.mode === 'remove' ? { remove: true } : null);
    if (!ok) setSaving(false);
  };

  const hdr = { fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: 8 };
  const small = { fontWeight: 500, fontSize: 12.5, color: 'var(--color-neutral-700)' };
  const tag = { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  const dashed = { border: '2px dashed var(--color-neutral-400, #A9BCAE)', borderRadius: 999, height: 44, fontSize: 14.5, fontWeight: 700, color: 'var(--color-accent-2-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' };
  const input = { width: '100%', font: 'inherit', fontSize: 15, color: 'var(--color-text)', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 20, padding: '11px 14px' };

  return (
    <div className="screen" style={{ padding: '8px 22px 0', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      <button className="icon-btn" onClick={onBack} aria-label="Retour" style={{ alignSelf: 'flex-start', marginLeft: -8 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div style={{ marginTop: -8 }}>
        <h1 className="h" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>{initial ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{initial ? 'Corrige ce que tu veux, puis enregistre.' : "Écris comme tu veux, on s'occupe de la mise en forme."}</div>
      </div>

      {/* Coller une recette entière */}
      {!initial && !paste && (
        <button className="reset press" onClick={() => { setError(''); setPaste({ text: '', photo: null }); }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px 10px 10px', borderRadius: 22, background: 'var(--color-accent-100)' }}>
          <span style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--color-accent)', display: 'grid', placeItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Coller une recette entière</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{canPhoto ? "D'un site, d'un message ou en photo : on remplit les cases pour toi." : "D'un site, d'un message… on remplit les cases pour toi."}</span>
          </span>
        </button>
      )}
      {paste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 24, background: 'var(--color-accent-100)' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Colle ta recette ici</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 16, background: 'var(--color-bg)' }}>
            <div style={{ fontSize: 13, lineHeight: 1.4 }}>
              <b>Mets en forme ta recette avant de la coller ici, à l'aide de ce prompt IA.</b> Copie-le, colle-le dans ChatGPT, Gemini, Le Chat… avec ta recette, puis colle sa réponse ici : tout se range tout seul.
            </div>
            <button className="btn btn-secondary" onClick={async () => {
              try { await navigator.clipboard.writeText(aiPrompt(cats)); setCopied(true); setTimeout(() => setCopied(false), 2500); }
              catch { setShowPrompt(true); }
            }} style={{ alignSelf: 'flex-start', height: 38, padding: '0 14px', fontSize: 13.5, gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              {copied ? 'Prompt copié !' : 'Copier le prompt pour une IA'}
            </button>
            {showPrompt && (
              <textarea id="recipe-ai-prompt" readOnly value={aiPrompt(cats)} rows={6} onFocus={e => e.target.select()}
                aria-label="Prompt à copier" style={{ ...area, fontSize: 12.5, borderRadius: 12 }} />
            )}
          </div>
          <textarea id="recipe-paste" autoFocus value={paste.text} onChange={e => setPaste(p => ({ ...p, text: e.target.value }))} rows={7}
            placeholder={'Gratin de chou-fleur\n\nIngrédients :\n1 chou-fleur\n50 cl de lait\n…\n\nPréparation :\nPréchauffe le four…'} style={{ ...area, borderRadius: 18 }} />
          {canPhoto && (
            paste.photo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={paste.photo.url} alt="Photo de la fiche" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 14 }} />
                <button className="btn btn-ghost" onClick={() => setPaste(p => ({ ...p, photo: null }))} style={{ fontSize: 13.5, textDecoration: 'underline', textUnderlineOffset: 3 }}>Retirer la photo</button>
              </div>
            ) : (
              <label className="btn btn-secondary" style={{ alignSelf: 'flex-start', height: 40, padding: '0 14px', background: 'var(--color-bg)' }}>
                Ou prendre la fiche en photo
                <input id="recipe-photo" type="file" accept="image/*" hidden
                  onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const blob = await shrink(f); setPaste(p => ({ ...p, photo: { blob, url: URL.createObjectURL(blob) } })); }} />
              </label>
            )
          )}
          {error && <div role="alert" style={{ color: 'var(--color-error)', fontSize: 14, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={format} disabled={busy} style={{ flex: 1, height: 46, fontSize: 15 }}>{busy ? 'Un instant…' : 'Remplir les cases'}</button>
            <button className="btn btn-secondary" onClick={() => { abort.current?.abort(); setBusy(false); setPaste(null); setError(''); }} style={{ height: 46, background: 'var(--color-bg)' }}>Annuler</button>
          </div>
        </div>
      )}
      {filled && (
        <div role="status" style={{ background: 'var(--color-accent-2-100)', borderRadius: 18, padding: '10px 14px', fontSize: 14, lineHeight: 1.45 }}>
          <b>Cases remplies.</b> Vérifie et corrige si besoin, puis enregistre.
          {form.notes.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{form.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}

      {/* Photo du plat */}
      {currentUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 170, borderRadius: 26, background: illus({}, 'accent-2', currentUrl), backgroundOrigin: 'content-box', padding: 10 }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
            <label className="btn btn-ghost" style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 13.5 }}>
              Changer la photo
              <input id="recipe-illus" type="file" accept="image/*" hidden onChange={e => { pickImage(e.target.files?.[0], image.mode === 'new' ? image.cut : true); e.target.value = ''; }} />
            </label>
            <button className="btn btn-ghost" onClick={() => setImage({ mode: 'remove' })} style={{ fontSize: 13.5, textDecoration: 'underline', textUnderlineOffset: 3 }}>Enlever</button>
            {image.mode === 'new' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, cursor: 'pointer' }}>
                <input id="recipe-illus-cut" type="checkbox" checked={image.cut} onChange={e => pickImage(image.file, e.target.checked)} />
                Retirer le fond et le titre
              </label>
            )}
            {image.mode !== 'keep' && initial && imgUrl(initial) && (
              <button className="btn btn-ghost" onClick={() => setImage({ mode: 'keep' })} style={{ fontSize: 13.5, textDecoration: 'underline', textUnderlineOffset: 3 }}>Garder l'ancienne</button>
            )}
          </div>
        </div>
      ) : (
        <label className="press" style={{ height: 120, borderRadius: 24, border: '2px dashed #A9BCAE', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--color-neutral-700)', cursor: 'pointer' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></svg>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Ajouter une photo du plat</span>
          <span style={{ fontSize: 12.5 }}>facultatif</span>
          <input id="recipe-illus" type="file" accept="image/*" hidden onChange={e => { pickImage(e.target.files?.[0], true); e.target.value = ''; }} />
        </label>
      )}

      {/* Titre */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={hdr}>Titre</span>
        <input id="recipe-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex. : Gratin de chou-fleur de mamie" style={{ ...input, height: 48 }} />
      </label>

      {/* Ingrédients */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={hdr}>Ingrédients <span style={small}>un par ligne</span></span>
        <textarea id="recipe-ing" value={form.ing} onChange={e => set('ing', e.target.value)} rows={Math.max(4, form.ing.split('\n').length + 1)}
          placeholder={'1 chou-fleur\n50 cl de lait\n100 g de gruyère râpé'} style={area} />
      </label>

      {/* Préparation : une case par étape */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={hdr}>Préparation <span style={small}>une étape par case</span></span>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="h" aria-hidden="true" style={{ width: 30, height: 30, flex: 'none', marginTop: 8, borderRadius: '50%', background: 'var(--color-accent-2-200)', color: 'var(--color-accent-2-800)', display: 'grid', placeItems: 'center', fontSize: 14 }}>{i + 1}</span>
            <textarea ref={el => { stepRefs.current[i] = el; }} id={'recipe-step-' + i} aria-label={'Étape ' + (i + 1)} value={s} rows={1}
              onChange={e => setStep(i, e.target.value)} onKeyDown={e => onStepKey(e, i)} onPaste={e => onStepPaste(e, i)}
              placeholder={i === 0 ? 'Décris la première étape…' : 'Étape suivante…'}
              style={{ ...input, flex: 1, minWidth: 0, resize: 'none', lineHeight: 1.4, minHeight: 46, overflow: 'hidden' }} />
            <button className="icon-btn" onClick={() => removeStep(i)} aria-label={'Retirer l\'étape ' + (i + 1)} style={{ width: 34, height: 34, marginTop: 6, color: 'var(--color-neutral-700)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <button className="reset press" onClick={() => addStep()} style={dashed}>+ Ajouter une étape</button>
        <div className="muted" style={{ fontSize: 12 }}>La touche « Entrée » crée aussi une nouvelle étape.</div>
      </div>

      {/* Astuce */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={hdr}>Astuce <span style={small}>facultatif</span></span>
        <textarea id="recipe-tip" value={form.tip} onChange={e => set('tip', e.target.value)} rows={2}
          placeholder="Une précision, une variante, un conseil de service…" style={area} />
      </label>

      {/* Plus de détails */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="reset" onClick={() => setDetails(d => !d)} aria-expanded={details}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 18, background: 'var(--color-accent-2-100)', fontSize: 14.5, fontWeight: 700 }}>
          <span>Plus de détails <span style={{ fontWeight: 500, color: 'var(--color-neutral-700)' }}>· facultatif</span></span>
          <span aria-hidden="true">{details ? '▴' : '▾'}</span>
        </button>
        {!details && <div className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>Catégorie, nombre de personnes, temps : l'app les devine, tu peux les corriger ici.</div>}
        {details && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ ...hdr, fontSize: 14 }}>Catégorie {!catsTouched && shownCats.length > 0 && <span style={tag}>devinée</span>}</span>
              <CatPicker cats={cats} value={shownCats} onToggle={toggleCat} onAdd={onAddCat} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <label style={field}><span style={label}>Pour</span>
                <input id="recipe-p" className="input" inputMode="numeric" value={form.p} placeholder="4" onChange={e => set('p', e.target.value.replace(/\D/g, ''))} style={{ height: 46 }} /></label>
              <label style={field}><span style={label}>Unité</span>
                <input id="recipe-unit" className="input" value={form.unit} placeholder="pers." onChange={e => set('unit', e.target.value)} style={{ height: 46 }} /></label>
              <label style={field}><span style={label}>Temps (min)</span>
                <input id="recipe-t" className="input" inputMode="numeric" value={form.t} placeholder={String(autoT)} onChange={e => set('t', e.target.value.replace(/\D/g, ''))} style={{ height: 46 }} /></label>
            </div>
            {!form.t && <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>Laissé vide, le temps est calculé d'après les étapes : environ {autoT} min.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
              <label style={field}><span style={label}>Attente (min)</span>
                <input id="recipe-wait" className="input" inputMode="numeric" value={form.wait} placeholder="0" onChange={e => set('wait', e.target.value.replace(/\D/g, ''))} style={{ height: 46 }} /></label>
              <label style={field}><span style={label}>Type d'attente</span>
                <select id="recipe-wait-type" className="input" value={form.waitType} onChange={e => set('waitType', e.target.value)} style={{ height: 46 }}>
                  {WAIT_TYPES.map(w => <option key={w} value={w}>{w.replace(/^de /, '')}</option>)}
                </select></label>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>Marinade, repos, passage au frais… (720 = une nuit).</div>
          </>
        )}
      </div>

      {initial && !initial.custom && initial.edited && onReset && (
        <button className="btn btn-secondary" onClick={() => onReset(initial.id)} style={{ height: 46 }}>Revenir à la recette d'origine</button>
      )}
      {initial?.custom && onDelete && (
        <button className="btn btn-secondary" onClick={() => (confirmDel ? onDelete(initial.id) : setConfirmDel(true))}
          style={{ height: 46, color: 'var(--color-error)', borderColor: confirmDel ? 'var(--color-error)' : undefined }}>
          {confirmDel ? 'Confirmer : supprimer définitivement' : 'Supprimer cette recette'}
        </button>
      )}

      {/* Enregistrer, toujours visible */}
      <div style={{ position: 'sticky', bottom: 0, margin: '0 -22px', padding: '12px 22px', paddingBottom: 'max(20px, calc(10px + var(--bottom-safe)))', background: 'var(--color-bg)', boxShadow: '0 -6px 20px color-mix(in srgb, var(--color-neutral-900) 7%, transparent)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && !paste && <div role="alert" style={{ color: 'var(--color-error)', fontSize: 14, fontWeight: 600 }}>{error}</div>}
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ height: 52, fontSize: 16 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}

export function CatPicker({ cats, value, onToggle, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const submit = async e => {
    e?.preventDefault();
    const n = await onAdd?.(name);
    if (n) { if (!value.includes(n)) onToggle(n); setName(''); setAdding(false); }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {cats.map(c => {
        const on = value.includes(c);
        return (
          <button key={c} type="button" className="reset" aria-pressed={on} onClick={() => onToggle(c)}
            style={{ height: 38, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}`, background: on ? 'var(--color-text)' : 'var(--color-surface)', color: on ? 'var(--color-bg)' : 'var(--color-text)', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>}
            {c}
          </button>
        );
      })}
      {onAdd && (adding ? (
        <form onSubmit={submit} style={{ display: 'flex', gap: 6, flexBasis: '100%' }}>
          <input id="new-cat" className="input" autoFocus value={name} maxLength={30} placeholder="Nom de la catégorie"
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setAdding(false); }} style={{ height: 40 }} />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()} style={{ height: 40, flex: 'none' }}>Ajouter</button>
        </form>
      ) : (
        <button type="button" className="reset" onClick={() => setAdding(true)}
          style={{ height: 38, padding: '0 14px', borderRadius: 999, border: '1px dashed var(--color-neutral-500)', fontSize: 14, fontWeight: 600 }}>
          + Nouvelle catégorie
        </button>
      ))}
    </div>
  );
}
