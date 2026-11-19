// Recettes ajoutées et recettes modifiées.
// Dans Claude : base partagée de la page (capability `db`) et images stockées avec la page
// (capability `assets`), donc visibles sur tous tes appareils.
// Ailleurs (app installée, développement) : stockage local du navigateur.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RECIPES, CATS, canonId } from './data.js';
import { blobToDataUrl } from './imageTools.js';
import { today } from './lib.js';
import { putPhoto, getPhoto, deletePhoto, dataUrlToBlob, photosAvailable } from './photoStore.js';

const LS = 'zc:userdata';
// Version du format enregistré. À augmenter quand le format change, avec l'étape correspondante dans migrate().
// v1 : photos en texte (data URL) dans localStorage. v2 : photos dans IndexedDB (champ imgIdb).
export const SCHEMA = 2;
const EMPTY = { custom: {}, cats: {}, edits: {}, newCats: {} };
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
/** Remet les données lues dans le format attendu, quelle que soit leur version. */
const migrate = raw => {
  const d = obj(raw);
  // v1 → v2 : le déplacement des photos vers IndexedDB est asynchrone (voir movePhotosToIdb).
  // Recettes du catalogue renommées : leurs modifications suivent le nouvel identifiant.
  const rekey = m => Object.fromEntries(Object.entries(obj(m)).map(([k, v]) => [canonId(k), v]));
  return { custom: obj(d.custom), cats: rekey(d.cats), edits: rekey(d.edits), newCats: obj(d.newCats) };
};
const readLocal = () => { try { return migrate(JSON.parse(localStorage.getItem(LS))); } catch { return EMPTY; } };
const writeLocal = d => { try { localStorage.setItem(LS, JSON.stringify({ v: SCHEMA, ...d })); return true; } catch { return false; } };

/** Champs d'affichage calculés, à ne jamais enregistrer. */
const strip = r => { const c = { ...r }; delete c.imgLocal; return c; };
const hasDataUrl = r => typeof r?.imgData === 'string' && r.imgData.startsWith('data:');

/** v1 → v2 : déplace les photos encore stockées en texte vers IndexedDB. Renvoie null si rien n'a changé. */
async function movePhotosToIdb(map) {
  let changed = false;
  const out = { ...map };
  for (const [id, r] of Object.entries(map)) {
    if (!hasDataUrl(r)) continue;
    try {
      const key = await putPhoto(await dataUrlToBlob(r.imgData));
      out[id] = { ...r, imgIdb: key, imgData: null };
      changed = true;
    } catch { /* on garde la photo en texte : rien n'est perdu */ }
  }
  return changed ? out : null;
}

export async function getCapability(name) {
  try { return (await window.claude?.use?.(name)) || null; } catch { return null; }
}

const FIELDS = ['name', 'cats', 't', 'wait', 'p', 'yield', 'ing', 'steps', 'tip', 'img', 'imgAsset', 'imgData', 'imgIdb'];
const pick = r => Object.fromEntries(FIELDS.filter(k => k in r).map(k => [k, r[k]]));

export function useRecipeStore() {
  const [custom, setCustom] = useState(() => readLocal().custom); // id → recette ajoutée
  const [catOverrides, setCatOverrides] = useState(() => readLocal().cats); // ancien format : id → catégories
  const [edits, setEdits] = useState(() => readLocal().edits); // id → recette d'origine modifiée
  const [newCats, setNewCats] = useState(() => readLocal().newCats); // id → { name, createdAt }
  const [mode, setMode] = useState('local');
  const [storageError, setStorageError] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({}); // clé IndexedDB → adresse affichable
  const dbRef = useRef(null);
  const dataRef = useRef(null);
  dataRef.current = { custom, cats: catOverrides, edits, newCats };

  useEffect(() => {
    let unsubs = [], alive = true;
    getCapability('db').then(async db => {
      if (!alive) return;
      if (!db) {
        // Mode local : déplace d'éventuelles photos de l'ancien format vers IndexedDB.
        if (!(await photosAvailable())) return;
        const c = await movePhotosToIdb(dataRef.current.custom);
        const e = await movePhotosToIdb(dataRef.current.edits);
        if (!alive) return;
        if (c) setCustom(o => ({ ...o, ...Object.fromEntries(Object.entries(c).filter(([k]) => o[k])) }));
        if (e) setEdits(o => ({ ...o, ...Object.fromEntries(Object.entries(e).filter(([k]) => o[k])) }));
        return;
      }
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

  useEffect(() => {
    if (mode !== 'local') return;
    setStorageError(!writeLocal({ custom, cats: catOverrides, edits, newCats }));
  }, [custom, catOverrides, edits, newCats, mode]);

  // Charge les photos rangées dans IndexedDB pour pouvoir les afficher.
  useEffect(() => {
    const keys = [...Object.values(custom), ...Object.values(edits)].map(r => r?.imgIdb).filter(Boolean);
    const missing = keys.filter(k => !(k in photoUrls));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map(k => getPhoto(k).then(b => [k, b ? URL.createObjectURL(b) : null], () => [k, null])))
      .then(pairs => { if (alive) setPhotoUrls(o => ({ ...o, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [custom, edits, photoUrls]);

  const categories = useMemo(() => [
    ...CATS,
    ...Object.values(newCats).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(c => c.name).filter(n => !CATS.includes(n)),
  ], [newCats]);

  const recipes = useMemo(() => [
    ...RECIPES.map(r => {
      let x = catOverrides[r.id] ? { ...r, cats: catOverrides[r.id] } : r;
      if (edits[r.id]) x = { ...x, ...edits[r.id], id: r.id, edited: true };
      if (x.yield === null) { x = { ...x }; delete x.yield; }
      if (x.imgIdb && photoUrls[x.imgIdb]) x = { ...x, imgLocal: photoUrls[x.imgIdb] };
      return x;
    }),
    ...Object.values(custom).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(r => (r.imgIdb && photoUrls[r.imgIdb] ? { ...r, imgLocal: photoUrls[r.imgIdb] } : r)),
  ], [custom, catOverrides, edits, photoUrls]);

  /** Enregistre tout de suite dans le navigateur ; lève une erreur si la place manque. */
  const commitLocal = patch => {
    if (dbRef.current) return;
    if (!writeLocal({ ...dataRef.current, ...patch })) { setStorageError(true); throw new Error('storage-full'); }
  };

  /* Enregistre l'image : dans la page (Claude) ou dans le navigateur. */
  const storeImage = async blob => {
    const assets = await getCapability('assets');
    if (assets) {
      const up = await assets.upload(blob, { type: blob.type || 'image/png' });
      return { imgAsset: up.id, imgData: null, imgIdb: null };
    }
    try { return { imgAsset: null, imgData: null, imgIdb: await putPhoto(blob) }; }
    catch { return { imgAsset: null, imgIdb: null, imgData: await blobToDataUrl(blob) }; } // navigateur sans IndexedDB
  };

  const saveRecipe = async r => {
    const id = r.id || 'u-' + Date.now().toString(36);
    const clean = strip({ ...r, id, custom: true, createdAt: r.createdAt || Date.now(), added: r.added || today() });
    delete clean.notes;
    commitLocal({ custom: { ...dataRef.current.custom, [id]: clean } });
    dataRef.current = { ...dataRef.current, custom: { ...dataRef.current.custom, [id]: clean } };
    setCustom(o => ({ ...o, [id]: clean }));
    if (dbRef.current) await dbRef.current.doc('recipes/' + id).set({ json: JSON.stringify(clean), name: clean.name });
    return id;
  };

  const saveEdit = async (id, fields) => {
    const base = RECIPES.find(r => r.id === id);
    const next = strip({ ...pick(base), ...(dataRef.current.edits[id] || {}), ...fields });
    if (!('yield' in fields) && !base.yield) next.yield = null;
    commitLocal({ edits: { ...dataRef.current.edits, [id]: next } });
    dataRef.current = { ...dataRef.current, edits: { ...dataRef.current.edits, [id]: next } };
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
    const oldPhoto = r?.imgIdb && (image?.blob || image?.remove) ? r.imgIdb : null;
    if (image?.blob) Object.assign(f, await storeImage(image.blob));
    if (image?.remove) Object.assign(f, { img: null, imgAsset: null, imgData: null, imgIdb: null });
    let done;
    try { done = await saveAny(r, f); }
    catch (err) { if (f.imgIdb && f.imgIdb !== r?.imgIdb) deletePhoto(f.imgIdb); throw err; }
    if (oldPhoto) deletePhoto(oldPhoto);
    return done;
  };
  const saveAny = (r, f) => {
    if (r?.custom) return saveRecipe({ ...r, ...f, yield: f.yield || undefined });
    if (r) return saveEdit(r.id, f);
    return saveRecipe({ ...f, yield: f.yield || undefined });
  };

  const setCats = async (id, cats) => {
    if (custom[id]) return saveRecipe({ ...custom[id], cats });
    return saveEdit(id, { cats });
  };

  const resetRecipe = async id => {
    if (edits[id]?.imgIdb) deletePhoto(edits[id].imgIdb);
    setEdits(o => { const n = { ...o }; delete n[id]; return n; });
    setCatOverrides(o => { const n = { ...o }; delete n[id]; return n; });
    if (dbRef.current) {
      await dbRef.current.doc('edits/' + id).delete();
      await dbRef.current.doc('cats/' + id).delete();
    }
  };

  const deleteRecipe = async id => {
    const photo = custom[id]?.imgIdb;
    setCustom(o => { const n = { ...o }; delete n[id]; return n; });
    if (photo) deletePhoto(photo);
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

  /** Sauvegarde complète des recettes perso et des modifications, photos comprises. */
  const exportBackup = async () => {
    const d = dataRef.current;
    const photos = {};
    for (const r of [...Object.values(d.custom), ...Object.values(d.edits)]) {
      if (!r?.imgIdb || photos[r.imgIdb]) continue;
      try { const b = await getPhoto(r.imgIdb); if (b) photos[r.imgIdb] = await blobToDataUrl(b); } catch { /* photo illisible : ignorée */ }
    }
    return { app: 'zero-chichi', type: 'sauvegarde', v: SCHEMA, date: new Date().toISOString(), ...d, photos };
  };

  /** Restaure une sauvegarde (ajoute ou remplace, ne supprime rien). Renvoie le nombre de recettes perso restaurées. */
  const importBackup = async raw => {
    if (!raw || raw.app !== 'zero-chichi' || raw.type !== 'sauvegarde') throw new Error('not-a-backup');
    const d = migrate(raw);
    const photos = obj(raw.photos);
    const keyMap = {};
    const withPhoto = async r => {
      if (!r || typeof r !== 'object') return null;
      let x = { ...r };
      const src = r.imgIdb && photos[r.imgIdb] ? photos[r.imgIdb] : hasDataUrl(r) ? r.imgData : null;
      if (src) {
        try {
          if (!keyMap[src]) keyMap[src] = await storeImage(await dataUrlToBlob(src));
          x = { ...x, ...keyMap[src] };
        } catch { x = { ...x, imgIdb: null, imgData: null }; }
      } else if (r.imgIdb) x.imgIdb = null; // photo absente de la sauvegarde
      return strip(x);
    };
    const custom = {}, edits = {};
    for (const [id, r] of Object.entries(d.custom)) { const x = await withPhoto(r); if (x && x.name && Array.isArray(x.ing) && Array.isArray(x.steps)) custom[id] = { ...x, id, custom: true }; }
    for (const [id, r] of Object.entries(d.edits)) { if (!RECIPES.some(b => b.id === id)) continue; const x = await withPhoto(r); if (x) edits[id] = x; }
    const newCatsIn = Object.fromEntries(Object.entries(d.newCats).filter(([, c]) => typeof c?.name === 'string'));
    const next = {
      custom: { ...dataRef.current.custom, ...custom },
      cats: { ...dataRef.current.cats, ...d.cats },
      edits: { ...dataRef.current.edits, ...edits },
      newCats: { ...dataRef.current.newCats, ...newCatsIn },
    };
    commitLocal(next);
    dataRef.current = next;
    setCustom(next.custom); setCatOverrides(next.cats); setEdits(next.edits); setNewCats(next.newCats);
    if (dbRef.current) {
      const db = dbRef.current;
      for (const [id, r] of Object.entries(custom)) await db.doc('recipes/' + id).set({ json: JSON.stringify(r), name: r.name });
      for (const [id, r] of Object.entries(edits)) await db.doc('edits/' + id).set({ json: JSON.stringify(r), name: r.name });
      for (const [id, c] of Object.entries(newCatsIn)) await db.doc('categories/' + id).set(c);
    }
    return Object.keys(custom).length;
  };

  return { recipes, categories, addCategory, removeCategory, setCats, updateRecipe, resetRecipe, deleteRecipe, mode, storageError, exportBackup, importBackup };
}
