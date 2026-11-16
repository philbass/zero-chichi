// Petit accessoire de saison posé à côté du mot « Zéro » du logo.
// Les positions sont en pixels de logo-zero-chichi.png (560 × 252), converties en % de l'image.
import { BASE } from './lib.js';

// [id, mois, jour] de début ; la dernière période commencée l'emporte (le 1er janvier reste « fêtes »).
const PERIODS = [
  ['hiver', 1, 2], ['printemps', 3, 20], ['ete1', 6, 21], ['ete2', 8, 6],
  ['automne1', 9, 23], ['automne2', 11, 7], ['noel', 12, 15],
];

function seasonalAccessory(date = new Date()) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  let id = 'noel';
  for (const [p, m, j] of PERIODS) if (md >= m * 100 + j) id = p;
  return id;
}

const W = 560, H = 252, pc = v => `${v}%`;
// Posé sur la ligne : bord gauche x, largeur w, bas de l'image à la hauteur yb.
const onLine = (f, x, w, yb, rot) => ({ f, style: { left: pc(x / W * 100), width: pc(w / W * 100), bottom: pc((H - yb) / H * 100), transform: rot ? `rotate(${rot}deg)` : undefined } });
// Accroché par le haut (y), hauteur h facultative.
const fromTop = (f, x, w, y, h, rot) => ({ f, style: { left: pc(x / W * 100), width: pc(w / W * 100), top: pc(y / H * 100), height: h ? pc(h / H * 100) : 'auto', transform: rot ? `rotate(${rot}deg)` : undefined } });

const LAYOUT = {
  automne1: [onLine('automne1', 472, 88, 115, -12)],          // feuille morte
  automne2: [onLine('automne2', 473, 94, 129)],               // champignons
  hiver: [fromTop('hiver_cap', 277, 198, 22, 46), onLine('hiver_sol', 473, 88, 128)],
  printemps: [onLine('printemps', 475, 68, 131)],             // pâquerettes
  ete1: [onLine('ete1', 472, 96, 131)],                       // parasol
  ete2: [onLine('ete2', 478, 68, 124)],                       // ballon
  noel: [fromTop('noel', 417, 82, 22, 0, 14)],                // bonnet posé sur le « o »
};

export function SeasonalLogo({ height = 64, date }) {
  const parts = LAYOUT[seasonalAccessory(date)] || [];
  return (
    <div style={{ position: 'relative', flex: 'none', height }}>
      <img src={`${BASE}assets/logo-zero-chichi.png`} alt="Zéro Chichi" style={{ height, width: 'auto', display: 'block' }} />
      {parts.map(a => (
        <img key={a.f} src={`${BASE}assets/saisons/${a.f}.webp`} alt="" aria-hidden="true"
          style={{ position: 'absolute', pointerEvents: 'none', height: 'auto', ...a.style }} />
      ))}
    </div>
  );
}
