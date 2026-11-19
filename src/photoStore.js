// Photos des recettes perso, rangées dans IndexedDB plutôt que dans localStorage :
// localStorage est limité à environ 5 Mo, ce qui ne laisse la place qu'à une poignée de photos.
const DB = 'zc-photos', STORE = 'photos';
let dbPromise = null;

const open = () => {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB indisponible')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
};

const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
  const tx = db.transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  tx.oncomplete = () => res(req?.result);
  tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB'));
}));

export const photosAvailable = () => open().then(() => true, () => false);
export const putPhoto = async blob => {
  const key = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await run('readwrite', s => s.put(blob, key));
  return key;
};
export const getPhoto = key => run('readonly', s => s.get(key));
export const deletePhoto = key => run('readwrite', s => s.delete(key)).catch(() => {});

export const dataUrlToBlob = async url => (await fetch(url)).blob();
