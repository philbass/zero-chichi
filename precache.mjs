// Après le build : liste des fichiers que le service worker enregistre à l'installation.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = 'dist', out = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : out.push(relative(root, p)); } };
walk(root);
const list = out.filter(f => !/^(sw\.js|precache\.json|zero-chichi\.html|404\.html)$/.test(f) && !/^r[\\/]/.test(f) && !/^admin[\\/]/.test(f) && !/^assets[\\/]admin-/.test(f) && !/\.mp4$/.test(f)).map(f => f.split('\\').join('/'));
writeFileSync(join(root, 'precache.json'), JSON.stringify(list, null, 1));
console.log(list.length + ' fichiers à précharger');
