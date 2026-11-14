// Saisie d'une nouvelle recette (texte collé ou photo), mise en forme automatique, puis relecture.
import { useEffect, useRef, useState } from 'react';
import { formatPrompt, illus, imgUrl, ingredientToLine, normalizeRecipe, parseIngredient, parseRecipeText } from './lib.js';
import { prepareIllustration } from './imageTools.js';
import { getCapability } from './store.js';

const toForm = r => ({
  name: r.name || '',
  cats: r.cats || [],
  t: String(r.t || ''),
  p: String(r.p || ''),
  unit: r.yield ? r.yield[1] : '',
  ing: (r.ing || []).map(ingredientToLine).join('\n'),
  steps: (r.steps || []).join('\n'),
  notes: r.notes || [],
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
  const [phase, setPhase] = useState(initial ? 'review' : 'input');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => toForm(initial || {}));
  const [confirmDel, setConfirmDel] = useState(false);
  const [canPhoto, setCanPhoto] = useState(false);
  const [image, setImage] = useState({ mode: 'keep' }); // keep | new (file, blob, url, cut) | remove
  const [saving, setSaving] = useState(false);
  const abort = useRef(null);

  useEffect(() => {
    getCapability('sample').then(s => s?.limits?.().then(l => setCanPhoto(!!l?.images)).catch(() => {}));
    return () => abort.current?.abort();
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => { if (image.url) URL.revokeObjectURL(image.url); }, [image.url]);

  const pickImage = async (file, cut) => {
    if (!file) return;
    try {
      const blob = await prepareIllustration(file, cut, cut);
      setImage({ mode: 'new', file, blob, url: URL.createObjectURL(blob), cut });
    } catch { setError("Impossible d'ouvrir cette image. Essaie un fichier JPG ou PNG."); }
  };
  const currentUrl = image.mode === 'new' ? image.url : image.mode === 'remove' ? null : initial ? imgUrl(initial) : null;

  const set = (k, v) => { setError(''); setForm(f => ({ ...f, [k]: v })); };
  const toggleCat = c => { setError(''); setForm(f => ({ ...f, cats: f.cats.includes(c) ? f.cats.filter(x => x !== c) : [...f.cats, c] })); };

  const format = async () => {
    setError('');
    if (!text.trim() && !photo) { setError('Colle le texte de la recette ou ajoute une photo.'); return; }
    setBusy(true);
    const sample = await getCapability('sample');
    if (!sample) {
      if (!text.trim()) { setBusy(false); setError("La lecture d'une photo n'est possible que dans Claude. Colle plutôt le texte."); return; }
      setForm(toForm(parseRecipeText(text)));
      setBusy(false); setPhase('review'); return;
    }
    abort.current = new AbortController();
    try {
      const raw = await sample.json(formatPrompt(text, cats, !!photo), {
        images: photo ? [photo.blob] : undefined,
        signal: abort.current.signal,
      });
      setForm(toForm(normalizeRecipe(raw, cats)));
      setPhase('review');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (e?.code === 'rate_limited') setError('Claude est très demandé en ce moment. Réessaie dans une minute.');
      else if (text.trim()) {
        setForm(toForm(parseRecipeText(text)));
        setPhase('review');
      } else setError("Impossible de lire la photo. Essaie avec le texte de la recette.");
    } finally { setBusy(false); }
  };

  const save = async () => {
    const ing = form.ing.split('\n').map(parseIngredient).filter(Boolean);
    const steps = form.steps.split('\n').map(s => s.trim()).filter(Boolean);
    const t = parseInt(form.t, 10), p = parseInt(form.p, 10);
    if (!form.name.trim()) return setError('Donne un nom à la recette.');
    if (!form.cats.length) return setError('Choisis au moins une catégorie.');
    if (!ing.length) return setError('Ajoute au moins un ingrédient.');
    if (!steps.length) return setError('Ajoute au moins une étape.');
    const unit = form.unit.trim();
    const fields = { name: form.name.trim(), cats: form.cats, t: t > 0 ? t : 30, p: p > 0 ? p : 4, ing, steps };
    if (unit && !/^pers/i.test(unit)) fields.yield = [singular(unit), unit];
    setSaving(true);
    const ok = await onSave(fields, image.mode === 'new' ? { blob: image.blob } : image.mode === 'remove' ? { remove: true } : null);
    if (!ok) setSaving(false);
  };

  return (
    <div className="screen" style={{ padding: '8px 22px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <button className="icon-btn" onClick={onBack} aria-label="Retour" style={{ alignSelf: 'flex-start', marginLeft: -8 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div>
        <h1 className="h" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>{initial ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          {phase === 'input' ? 'Colle la recette telle quelle, ou prends-la en photo. On la remet au format Zéro Chichi.' : 'Relis et corrige si besoin, puis enregistre.'}
        </div>
      </div>

      {phase === 'input' && (
        <>
          <label style={field}>
            <span style={label}>Texte de la recette</span>
            <textarea id="recipe-text" value={text} onChange={e => setText(e.target.value)} rows={10}
              placeholder={'Gratin de chou-fleur\n\nIngrédients :\n- 1 chou-fleur\n- 500 ml de lait\n…\n\nPréparation :\n1. Préchauffez le four…'} style={area} />
          </label>

          {canPhoto && (
            <div style={field}>
              <span style={label}>Ou une photo de la fiche</span>
              {photo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={photo.url} alt="Photo de la recette" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 18 }} />
                  <button className="btn btn-secondary" onClick={() => setPhoto(null)}>Retirer la photo</button>
                </div>
              ) : (
                <label className="btn btn-secondary" style={{ alignSelf: 'flex-start', height: 46, padding: '0 18px' }}>
                  Choisir ou prendre une photo
                  <input id="recipe-photo" type="file" accept="image/*" hidden
                    onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const blob = await shrink(f); setPhoto({ blob, url: URL.createObjectURL(blob) }); }} />
                </label>
              )}
            </div>
          )}

          {error && <div role="alert" style={{ color: 'var(--color-error)', fontSize: 14, fontWeight: 600 }}>{error}</div>}
          <button className="btn btn-primary" onClick={format} disabled={busy} style={{ height: 52, fontSize: 16 }}>
            {busy ? 'Mise en forme…' : 'Mettre en forme'}
          </button>
          <button className="btn btn-ghost" onClick={() => { setForm(toForm({})); setPhase('review'); }} style={{ alignSelf: 'center', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Saisir à la main
          </button>
        </>
      )}

      {phase === 'review' && (
        <>
          {form.notes.length > 0 && (
            <div style={{ background: 'var(--color-accent-100)', borderRadius: 22, padding: '12px 16px', fontSize: 14, lineHeight: 1.45 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>À vérifier</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{form.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          <div style={field}>
            <span style={label}>Illustration</span>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 112, height: 112, flex: 'none', borderRadius: 28, background: illus({}, 'accent-2', currentUrl), backgroundOrigin: 'content-box', padding: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
                <label className="btn btn-secondary" style={{ height: 40, padding: '0 14px' }}>
                  {currentUrl ? "Changer l'image" : 'Ajouter une image'}
                  <input id="recipe-illus" type="file" accept="image/*" hidden
                    onChange={e => { pickImage(e.target.files?.[0], image.mode === 'new' ? image.cut : true); e.target.value = ''; }} />
                </label>
                {image.mode === 'new' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <input id="recipe-illus-cut" type="checkbox" checked={image.cut} onChange={e => pickImage(image.file, e.target.checked)} />
                    Retirer le fond et le titre
                  </label>
                )}
                {currentUrl && (
                  <button className="btn btn-ghost" onClick={() => setImage({ mode: 'remove' })} style={{ fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Enlever l'illustration
                  </button>
                )}
                {image.mode !== 'keep' && initial && imgUrl(initial) && (
                  <button className="btn btn-ghost" onClick={() => setImage({ mode: 'keep' })} style={{ fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Garder l'image actuelle
                  </button>
                )}
              </div>
            </div>
          </div>
          <label style={field}>
            <span style={label}>Nom</span>
            <input id="recipe-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} style={{ height: 46 }} />
          </label>
          <div style={field}>
            <span style={label}>Catégories</span>
            <CatPicker cats={cats} value={form.cats} onToggle={toggleCat} onAdd={onAddCat} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <label style={field}><span style={label}>Temps (min)</span>
              <input id="recipe-t" className="input" inputMode="numeric" value={form.t} onChange={e => set('t', e.target.value.replace(/\D/g, ''))} style={{ height: 46 }} /></label>
            <label style={field}><span style={label}>Pour</span>
              <input id="recipe-p" className="input" inputMode="numeric" value={form.p} onChange={e => set('p', e.target.value.replace(/\D/g, ''))} style={{ height: 46 }} /></label>
            <label style={field}><span style={label}>Unité</span>
              <input id="recipe-unit" className="input" value={form.unit} placeholder="pers." onChange={e => set('unit', e.target.value)} style={{ height: 46 }} /></label>
          </div>
          <label style={field}>
            <span style={label}>Ingrédients · un par ligne</span>
            <textarea id="recipe-ing" value={form.ing} onChange={e => set('ing', e.target.value)} rows={Math.max(5, form.ing.split('\n').length + 1)} placeholder={'200 g farine\n3 œufs\nsel, poivre'} style={area} />
          </label>
          <label style={field}>
            <span style={label}>Étapes · une par ligne</span>
            <textarea id="recipe-steps" value={form.steps} onChange={e => set('steps', e.target.value)} rows={Math.max(5, form.steps.split('\n').length + 2)} placeholder={'Préchauffe le four à 180 °C.\nMélange…'} style={area} />
          </label>
          {error && <div role="alert" style={{ color: 'var(--color-error)', fontSize: 14, fontWeight: 600 }}>{error}</div>}
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ height: 52, fontSize: 16 }}>{saving ? 'Enregistrement…' : 'Enregistrer la recette'}</button>
          {!initial && (
            <button className="btn btn-ghost" onClick={() => { setError(''); setPhase('input'); }} style={{ alignSelf: 'center', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Recommencer avec un autre texte
            </button>
          )}
          {initial && !initial.custom && initial.edited && onReset && (
            <button className="btn btn-secondary" onClick={() => onReset(initial.id)} style={{ height: 46 }}>
              Revenir à la recette d'origine
            </button>
          )}
          {initial?.custom && onDelete && (
            <button className="btn btn-secondary" onClick={() => (confirmDel ? onDelete(initial.id) : setConfirmDel(true))}
              style={{ height: 46, color: 'var(--color-error)', borderColor: confirmDel ? 'var(--color-error)' : undefined }}>
              {confirmDel ? 'Confirmer : supprimer définitivement' : 'Supprimer cette recette'}
            </button>
          )}
        </>
      )}
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
