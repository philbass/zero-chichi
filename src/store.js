// Recettes ajoutées et recettes modifiées.
// Dans Claude : base partagée de la page (capability `db`) et images stockées avec la page
// (capability `assets`), donc visibles sur tous tes appareils.
// Ailleurs (app installée, développement) : stockage local du navigateur.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RECIPES, CATS } from './data.js';
import { blobToDataUrl } from './imageTools.js';
import { today } from './lib.js';

const LS = 'zc:userdata';
const EMPTY = { custom: {}, cats: {}, edits: {}, newCats: {} };
const readLocal = () => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(LS)) }; } catch { return EMPTY; } };
const writeLocal = d => { try { localStorage.setItem(LS, JSON.stringify(d)); return true; } catch { return false; } };

export async function getCapability(name) {
  try { return (await window.claude?.use?.(name)) || null; } catch { return null; }
}

const FIELDS = ['name', 'cats', 't', 'wait', 'p', 'yield', 'ing', 'steps', 'tip', 'img', 'imgAsset', 'imgData'];
const pick = r => Object.fromEntries(FIELDS.filter(k => k in r).map(k => [k, r[k]]));

export function useRecipeStore() {
  const [custom, setCustom] = useState(() => readLocal().custom); // id → recette ajoutée
  const [catOverrides, setCatOverrides] = useState(() => readLocal().cats); // ancien format : id → catégories
  const [edits, setEdits] = useState(() => readLocal().edits); // id → recette d'origine modifiée
  const [newCats, setNewCats] = useState(() => readLocal().newCats); // id → { name, createdAt }
  const [mode, setMode] = useState('local');
  const dbRef = useRef(null);

  useEffect(() => {
    let unsubs = [], alive = true;
    getCapability('db').then(db => {
      if (!alive || !db) return;
      dbRef.current = db;
      setMode('shared');
      const listen = (name, set, parse) => unsubs.push(db.collection(name).onSnapshot(snap => {
        const o = {};
        for (const d of snap.docs) { try { const v = parse(d); if (v) o[d.id] = v; } catch { /* document illisible */ } }
        set(o);
      }, () => {}));
      listen('recipes', setCustom, d => ({ ...JSON.parse(d.data().json), id: d.id, custom: true }));
      listen('edits', setEdits, d => JSON.parse(d.data().json));
      listen('cats', setCatOverrides, d => (Array.isArray(d.data().cats) ? d.data().cats : null));
      listen('categories', setNewCats, d => (typeof d.data().name === 'string' ? d.data() : null));
    });
    return () => { alive = false; unsubs.forEach(u => u && u()); };
  }, []);

  useEffect(() => { if (mode === 'local') writeLocal({ custom, cats: catOverrides, edits, newCats }); }, [custom, catOverrides, edits, newCats, mode]);

  const categories = useMemo(() => [
    ...CATS,
    ...Object.values(newCats).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(c => c.name).filter(n => !CATS.includes(n)),
  ], [newCats]);

  const recipes = useMemo(() => [
    ...RECIPES.map(r => {
      let x = catOverrides[r.id] ? { ...r, cats: catOverrides[r.id] } : r;
      if (edits[r.id]) x = { ...x, ...edits[r.id], id: r.id, edited: true };
      if (x.yield === null) { x = { ...x }; delete x.yield; }
      return x;
    }),
    ...Object.values(custom).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
  ], [custom, catOverrides, edits]);

  /* Enregistre l'image : dans la page (Claude) ou dans le navigateur. */
  const storeImage = async blob => {
    const assets = await getCapability('assets');
    if (assets) {
      const up = await assets.upload(blob, { type: blob.type || 'image/png' });
      return { imgAsset: up.id, imgData: null };
    }
    return { imgAsset: null, imgData: await blobToDataUrl(blob) };
  };

  const saveRecipe = async r => {
    const id = r.id || 'u-' + Date.now().toString(36);
    const clean = { ...r, id, custom: true, createdAt: r.createdAt || Date.now(), added: r.added || today() };
    delete clean.notes;
    setCustom(o => ({ ...o, [id]: clean }));
    if (dbRef.current) await dbRef.current.doc('recipes/' + id).set({ json: JSON.stringify(clean), name: clean.name });
    return id;
  };

  const saveEdit = async (id, fields) => {
    const base = RECIPES.find(r => r.id === id);
    const next = { ...pick(base), ...(edits[id] || {}), ...fields };
    if (!('yield' in fields) && !base.yield) next.yield = null;
    setEdits(o => ({ ...o, [id]: next }));
    if (dbRef.current) await dbRef.current.doc('edits/' + id).set({ json: JSON.stringify(next), name: next.name });
    return id;
  };

  /**
   * Met à jour n'importe quelle recette.
   * image : { blob } pour une nouvelle illustration, { remove: true } pour l'enlever, null pour garder.
   */
  const updateRecipe = async (r, fields, image) => {
    const f = { ...fields };
    if (!('yield' in f)) f.yield = null;
    if (image?.blob) Object.assign(f, await storeImage(image.blob));
    if (image?.remove) Object.assign(f, { img: null, imgAsset: null, imgData: null });
    if (r?.custom) return saveRecipe({ ...r, ...f, yield: f.yield || undefined });
    if (r) return saveEdit(r.id, f);
    return saveRecipe({ ...f, yield: f.yield || undefined });
  };

  const setCats = async (id, cats) => {
    if (custom[id]) return saveRecipe({ ...custom[id], cats });
    return saveEdit(id, { cats });
  };

  const resetRecipe = async id => {
    setEdits(o => { const n = { ...o }; delete n[id]; return n; });
    setCatOverrides(o => { const n = { ...o }; delete n[id]; return n; });
    if (dbRef.current) {
      await dbRef.current.doc('edits/' + id).delete();
      await dbRef.current.doc('cats/' + id).delete();
    }
  };

  const deleteRecipe = async id => {
    setCustom(o => { const n = { ...o }; delete n[id]; return n; });
    if (dbRef.current) await dbRef.current.doc('recipes/' + id).delete();
  };

  /** Ajoute une catégorie ; renvoie son nom tel qu'enregistré (ou celui qui existait déjà). */
  const addCategory = async raw => {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!name) return null;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    const key = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const existing = categories.find(c => key(c) === key(label));
    if (existing) return existing;
    const id = key(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat-' + Date.now().toString(36);
    const doc = { name: label, createdAt: Date.now() };
    setNewCats(o => ({ ...o, [id]: doc }));
    if (dbRef.current) await dbRef.current.doc('categories/' + id).set(doc);
    return label;
  };

  /** Retire une catégorie ajoutée (seulement si aucune recette ne l'utilise). */
  const removeCategory = async name => {
    const id = Object.keys(newCats).find(k => newCats[k].name === name);
    if (!id || recipes.some(r => r.cats.includes(name))) return false;
    setNewCats(o => { const n = { ...o }; delete n[id]; return n; });
    if (dbRef.current) await dbRef.current.doc('categories/' + id).delete();
    return true;
  };

  return { recipes, categories, addCategory, removeCategory, setCats, updateRecipe, resetRecipe, deleteRecipe, mode };
}
