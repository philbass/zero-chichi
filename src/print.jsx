// Fiche recette à imprimer : invisible à l'écran, seule chose imprimée quand on touche « Imprimer ».
import { createPortal } from 'react-dom';
import { BASE, fmtT, ingList, portionLabel, waitLabel, difficulty, shownImg } from './lib.js';
import { QRCode, recipeUrl, APP_URL_SHORT } from './share.jsx';

export const PRINTER = ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'];

export function printRecipe() {
  try { window.print(); return true; } catch { return false; }
}

export default function PrintSheet({ r, portions }) {
  const ing = ingList(r, portions);
  const facts = [fmtT(r.t), waitLabel(r) && '+ ' + waitLabel(r), difficulty(r), 'Pour ' + portionLabel(r, portions)].filter(Boolean);
  return createPortal(
    <article className="print-sheet" aria-hidden="true">
      <header className="ps-head">
        <div className="ps-title">
          <div className="ps-brand"><img src={`${BASE}assets/logo-mark.png`} alt="" />Zéro Chichi</div>
          <h1>{r.name}</h1>
          <p className="ps-facts">{facts.join('  ·  ')}</p>
          {r.cats.length > 0 && <p className="ps-cats">{r.cats.join(' · ')}</p>}
        </div>
        <img className="ps-img" src={shownImg(r)} alt="" />
      </header>

      <div className="ps-cols">
        <section className="ps-ing">
          <h2>Ingrédients</h2>
          <ul>
            {ing.map((i, k) => (
              <li key={k}><span className="ps-box" /><b>{i.q}</b><span>{i.n}</span></li>
            ))}
          </ul>
        </section>
        <section className="ps-steps">
          <h2>Préparation</h2>
          <ol>
            {r.steps.map((t, k) => <li key={k}><span className="ps-num">{k + 1}</span><p>{t}</p></li>)}
          </ol>
          {r.tip && (
            <div className="ps-tip">
              <h3>Astuce</h3>
              {r.tip.split(/\n+/).filter(t => t.trim()).map((t, k) => <p key={k}>{t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')}</p>)}
            </div>
          )}
        </section>
      </div>

      <footer className="ps-foot">
        <div>
          <b>Zéro Chichi</b> · Des recettes courtes. Rien de plus.<br />
          <span>{r.custom ? 'Recette perso, imprimée depuis l’app.' : 'Retrouve cette recette dans l’app : ' + APP_URL_SHORT}</span>
        </div>
        {!r.custom && <QRCode text={recipeUrl(r)} size={74} label="QR code de la recette" />}
      </footer>
    </article>,
    document.body,
  );
}
