// Zéro Chichi Admin : ajouter une recette (photo + texte → Claude → illustration → aperçu → publication).
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, DEMO, SITE, lireCode, garderCode } from './api.js';
import { promptIllustration } from './illus.js';
import { prepareIllustration, blobToDataUrl } from '../src/imageTools.js';
import { macros } from '../src/nutrition.js';
import { seasonsOf, SEASON_LABEL } from '../src/season.js';
import { fmtT, waitLabel, ingredientToLine, parseIngredient, today } from '../src/lib.js';

const ILLUS = SITE + 'assets/illus/';
// Mêmes catégories que CATS dans src/data.js (recopiées pour ne pas charger toutes les recettes).
const CATS = ['Entrées', 'Soupe', 'Plats', 'Viandes', 'Accompagnement', 'Pâtes', 'Tartes salées', 'Desserts', 'Cakes', 'Pain', 'Sauces', 'Apéro'];
const CLE_BROUILLON = 'zca:brouillon';
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_PUBLI = [1, 3, 5]; // lundi, mercredi, vendredi

const dateDe = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const isoDe = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const jolieDate = (iso, annee = true) => {
  const d = dateDe(iso);
  return `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}${annee && d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
};

/** Premier lundi, mercredi ou vendredi libre après la dernière recette programmée. */
function prochainCreneau(recettes) {
  const auj = today();
  const prises = new Set(recettes.map(r => r.added).filter(Boolean));
  const futures = [...prises].filter(d => d > auj).sort();
  const d = dateDe(futures.length ? futures[futures.length - 1] : auj);
  for (let i = 0; i < 400; i++) {
    d.setDate(d.getDate() + 1);
    if (JOURS_PUBLI.includes(d.getDay()) && !prises.has(isoDe(d))) return isoDe(d);
  }
  return auj;
}

const b64EnBlob = (b64, type) => new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type });
const sansEntete = dataUrl => String(dataUrl).split(',')[1];

/** Photo du téléphone → JPEG de 1600 px au plus, en base64 (assez pour lire une page de livre). */
async function reduirePhoto(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  const url = cv.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: sansEntete(url), url };
}

const lireBrouillon = () => { try { return JSON.parse(localStorage.getItem(CLE_BROUILLON)) || null; } catch { return null; } };
const garderBrouillon = b => { try { b ? localStorage.setItem(CLE_BROUILLON, JSON.stringify(b)) : localStorage.removeItem(CLE_BROUILLON); } catch { /* plein : on garde en mémoire seulement */ } };
const VIDE = { texte: '', note: '', photos: [], recette: null, remarques: '', image: null, essaiIllus: 0, quand: 'creneau', date: '' };

/* ── Petits éléments ──────────────────────────────────────────────────── */
const Ico = ({ d, size = 22, sw = 2.2, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  spark: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
  check: <path d="M5 12l5 5 9-10" />,
  redo: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  list: <path d="M4 5h16M4 12h16M4 19h10" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
};

export const Logo = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
    <defs><clipPath id="zca-c"><circle cx="256" cy="256" r="240" /></clipPath></defs>
    <circle cx="256" cy="256" r="240" fill="#1F3A2E" />
    <g transform="translate(56 4) scale(.78)" fill="#F2A541">
      <circle cx="256" cy="160" r="36" fill="none" stroke="#F2A541" strokeWidth="22" />
      <rect x="116" y="230" width="280" height="34" rx="14" /><rect x="135" y="250" width="242" height="142" rx="26" />
      <rect x="80" y="295" width="60" height="26" rx="13" /><rect x="372" y="295" width="60" height="26" rx="13" />
    </g>
    <rect x="0" y="350" width="512" height="162" fill="#F2A541" clipPath="url(#zca-c)" />
    <text x="256" y="442" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="78" letterSpacing="6" fill="#1F3A2E">ADMIN</text>
  </svg>
);

const Entete = ({ titre, retour }) => (
  <div className="entete">
    {retour && <button type="button" className="rond" aria-label="Retour" onClick={retour}><Ico d={I.back} /></button>}
    <h1 className="h titre">{titre}</h1>
  </div>
);
const Barre = ({ children }) => <div className="barre">{children}</div>;
const Erreur = ({ msg, onRetry }) => msg ? (
  <div className="erreur" role="alert"><span>{msg}</span>{onRetry && <button type="button" className="lien" onClick={onRetry}>Réessayer</button>}</div>
) : null;
const Vignette = ({ img, data }) => <span className="vignette" style={{ backgroundImage: `url("${data || (img ? ILLUS + img : ILLUS + '_defaut.webp')}")` }} />;
// « mer. 9 déc. » en fin de phrase : pas de second point.
const finPhrase = s => s.endsWith('.') ? s : s + '.';

/* ── Application ──────────────────────────────────────────────────────── */
export default function Admin() {
  const [code, setCode] = useState(lireCode());
  const [ecran, setEcran] = useState('accueil');
  const [etat, setEtat] = useState(null);
  const [erreurEtat, setErreurEtat] = useState('');
  const [b, setB] = useState(() => lireBrouillon());
  const [publiee, setPubliee] = useState(null);

  const charger = (c = code) => api.etat(c).then(e => { setEtat(e.recettes); setErreurEtat(''); return true; })
    .catch(e => { if (e.status === 401) { garderCode(''); setCode(''); } setErreurEtat(e.message); return false; });
  useEffect(() => { if (code || DEMO) charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const maj = patch => setB(prev => { const n = { ...(prev || VIDE), ...patch }; garderBrouillon(n); return n; });
  const oublier = () => { garderBrouillon(null); setB(null); };
  useEffect(() => { window.scrollTo(0, 0); }, [ecran]);

  if (!code && !DEMO) return <Connexion onOk={c => { garderCode(c); setCode(c); setEcran('accueil'); }} />;

  const aller = setEcran;
  const props = { b: b || VIDE, maj, aller, etat };
  switch (ecran) {
    case 'saisie': return <Saisie {...props} />;
    case 'traitement': return <Traitement {...props} />;
    case 'apercu': return <Apercu {...props} />;
    case 'modifier': return <Modifier {...props} />;
    case 'publication': return <Publication {...props} onPubliee={(r) => { setPubliee(r); setEtat(e => [...(e || []), r]); oublier(); aller('fait'); }} />;
    case 'fait': return <Fait r={publiee} aller={aller} />;
    default: return (
      <div className="ecran avec-onglets">
        {ecran === 'calendrier' ? <Calendrier etat={etat} /> : ecran === 'recettes' ? <Recettes etat={etat} />
          : ecran === 'reglages' ? <Reglages onDeconnexion={() => { garderCode(''); setCode(''); }} />
          : <Accueil etat={etat} erreur={erreurEtat} recharger={() => charger()} b={b} aller={aller} oublier={oublier} nouveau={() => { oublier(); maj({}); aller('saisie'); }} />}
        <Onglets ecran={ecran} aller={aller} />
      </div>
    );
  }
}

function Onglets({ ecran, aller }) {
  const t = [['accueil', 'Accueil', I.home], ['calendrier', 'Calendrier', I.cal], ['recettes', 'Recettes', I.list], ['reglages', 'Réglages', I.gear]];
  return (
    <nav className="onglets">
      {t.map(([k, l, ic]) => (
        <button key={k} type="button" className={ecran === k || (k === 'accueil' && !t.some(x => x[0] === ecran)) ? 'on' : ''} aria-current={ecran === k ? 'page' : undefined} onClick={() => aller(k)}>
          <Ico d={ic} size={24} sw={2} />{l}
        </button>
      ))}
    </nav>
  );
}

/* ── Connexion ────────────────────────────────────────────────────────── */
function Connexion({ onOk }) {
  const [c, setC] = useState('');
  const [err, setErr] = useState('');
  const [enCours, setEnCours] = useState(false);
  const valider = async e => {
    e.preventDefault();
    setEnCours(true); setErr('');
    try { await api.etat(c.trim()); onOk(c.trim()); } catch (x) { setErr(x.status === 401 ? 'Ce code ne fonctionne pas.' : x.message); }
    setEnCours(false);
  };
  return (
    <form className="ecran connexion" onSubmit={valider}>
      <Logo size={112} />
      <h1 className="h">Zéro Chichi Admin</h1>
      <p className="doux">Entre ton code d'accès. Il reste enregistré sur ce téléphone.</p>
      <label className="champ"><span>Code d'accès</span>
        <input type="password" autoComplete="current-password" value={c} onChange={e => setC(e.target.value)} autoFocus /></label>
      <Erreur msg={err} />
      <button className="bouton" type="submit" disabled={!c.trim() || enCours}>{enCours ? 'Vérification…' : 'Entrer'}</button>
    </form>
  );
}

/* ── Accueil ──────────────────────────────────────────────────────────── */
function Accueil({ etat, erreur, recharger, b, aller, nouveau, oublier }) {
  const auj = today();
  const enLigne = etat?.filter(r => !r.added || r.added <= auj).length;
  const aVenir = useMemo(() => (etat || []).filter(r => r.added > auj).sort((x, y) => x.added.localeCompare(y.added)), [etat, auj]);
  return (
    <div className="pile">
      <div className="marque"><Logo size={48} /><div><div className="h t24">Zéro Chichi Admin</div><div className="doux">Bonjour Eric{DEMO && ' · démonstration'}</div></div></div>
      <button type="button" className="carte-action" onClick={nouveau}>
        <span className="pastille"><Ico d={I.plus} size={28} sw={2.6} color="#FBF6EA" /></span>
        <span><span className="h t22">Nouvelle recette</span><span className="sous">Une photo, du texte, ou les deux</span></span>
      </button>
      {b?.recette && (
        <div className="brouillon">
          <button type="button" className="ligne-btn" onClick={() => aller(b.image ? 'apercu' : 'traitement')}>
            <span className="etiquette">Brouillon</span><span className="nom">{b.recette.name}</span><Ico d={I.chevron} size={18} />
          </button>
          <button type="button" className="rond petit" aria-label="Supprimer le brouillon" onClick={oublier}><Ico d={I.x} size={18} /></button>
        </div>
      )}
      <Erreur msg={erreur} onRetry={recharger} />
      <div className="compteurs">
        <div><span className="h t28">{etat ? enLigne : '…'}</span><span className="doux">en ligne</span></div>
        <div><span className="h t28">{etat ? aVenir.length : '…'}</span><span className="doux">programmées</span></div>
      </div>
      <div className="titre-section"><h2 className="h t20">À venir</h2><span className="doux">lun · mer · ven</span></div>
      <div className="liste">
        {aVenir.slice(0, 4).map(r => <LigneRecette key={r.id} r={r} />)}
        {etat && !aVenir.length && <p className="doux">Aucune recette programmée.</p>}
      </div>
      {aVenir.length > 4 && <button type="button" className="lien" onClick={() => aller('calendrier')}>Voir tout le calendrier</button>}
    </div>
  );
}

const LigneRecette = ({ r }) => (
  <div className="ligne"><Vignette img={r.img} data={r.imgData} /><div className="txt"><span className="nom">{r.name}</span><span className="doux">{r.added ? jolieDate(r.added) : 'toujours'}</span></div></div>
);

function Calendrier({ etat }) {
  const auj = today();
  const aVenir = (etat || []).filter(r => r.added > auj).sort((x, y) => x.added.localeCompare(y.added));
  const parMois = [];
  for (const r of aVenir) {
    const k = r.added.slice(0, 7);
    if (parMois.at(-1)?.k !== k) parMois.push({ k, l: MOIS_LONG[+k.slice(5) - 1] + ' ' + k.slice(0, 4), r: [] });
    parMois.at(-1).r.push(r);
  }
  return (
    <div className="pile">
      <Entete titre="Calendrier" />
      <p className="doux">{finPhrase(`${aVenir.length} recettes programmées${aVenir.length ? `, jusqu'au ${jolieDate(aVenir.at(-1).added)}` : ''}`)}</p>
      {parMois.map(m => (
        <section key={m.k} className="pile serre"><h2 className="h t20 mois">{m.l}</h2><div className="liste">{m.r.map(r => <LigneRecette key={r.id} r={r} />)}</div></section>
      ))}
      {!etat && <p className="doux">Chargement…</p>}
    </div>
  );
}

function Recettes({ etat }) {
  const [q, setQ] = useState('');
  const auj = today();
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const liste = (etat || []).filter(r => !r.added || r.added <= auj).filter(r => !q || norm(r.name).includes(norm(q)))
    .sort((x, y) => (y.added || '').localeCompare(x.added || ''));
  return (
    <div className="pile">
      <Entete titre="Recettes en ligne" />
      <label className="champ"><span className="sr">Rechercher</span><input type="search" placeholder="Rechercher une recette" value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="liste">{liste.map(r => <LigneRecette key={r.id} r={r} />)}</div>
    </div>
  );
}

function Reglages({ onDeconnexion }) {
  return (
    <div className="pile">
      <Entete titre="Réglages" />
      <div className="carte pile serre">
        <span className="gras">Mise en forme</span><span className="doux">Claude (Anthropic), avec les règles de rédaction de Zéro Chichi.</span>
        <span className="gras">Illustrations</span><span className="doux">Gemini, style carnet aquarelle, sans texte.</span>
        <span className="gras">Publication</span><span className="doux">Directement sur le dépôt GitHub : Zéro Chichi est à jour en 1 à 2 minutes.</span>
      </div>
      <a className="bouton clair" href={SITE}>Ouvrir Zéro Chichi</a>
      {!DEMO && <button type="button" className="bouton clair" onClick={onDeconnexion}>Oublier le code sur ce téléphone</button>}
    </div>
  );
}

/* ── Saisie ───────────────────────────────────────────────────────────── */
function Saisie({ b, maj, aller }) {
  const appareil = useRef(), galerie = useRef();
  const [err, setErr] = useState('');
  const ajouter = async files => {
    setErr('');
    try {
      const nouvelles = await Promise.all([...files].slice(0, 6 - b.photos.length).map(reduirePhoto));
      maj({ photos: [...b.photos, ...nouvelles] });
    } catch { setErr('Cette photo n\'a pas pu être lue.'); }
  };
  const pret = b.texte.trim() || b.photos.length;
  return (
    <div className="ecran">
      <div className="pile defile">
        <Entete titre="Nouvelle recette" retour={() => aller('accueil')} />
        <div className="pile serre">
          <span className="gras">Photo</span>
          <div className="zone-photo">
            {b.photos.length ? (
              <div className="photos">
                {b.photos.map((p, i) => (
                  <div key={i} className="photo"><img src={p.url} alt={`Photo ${i + 1}`} />
                    <button type="button" className="rond petit" aria-label={`Retirer la photo ${i + 1}`} onClick={() => maj({ photos: b.photos.filter((_, j) => j !== i) })}><Ico d={I.x} size={16} /></button></div>
                ))}
              </div>
            ) : (<><Ico d={I.camera} size={36} sw={1.8} color="#587062" /><span className="doux centre">Une page de livre, une fiche, une capture d'écran…</span></>)}
            {b.photos.length < 6 && (
              <div className="rang">
                <button type="button" className="bouton petit" onClick={() => appareil.current.click()}><Ico d={I.camera} size={18} />Photographier</button>
                <button type="button" className="bouton petit clair" onClick={() => galerie.current.click()}><Ico d={I.image} size={18} />Galerie</button>
              </div>
            )}
            <input ref={appareil} type="file" accept="image/*" capture="environment" hidden onChange={e => { ajouter(e.target.files); e.target.value = ''; }} />
            <input ref={galerie} type="file" accept="image/*" multiple hidden onChange={e => { ajouter(e.target.files); e.target.value = ''; }} />
          </div>
          <Erreur msg={err} />
        </div>
        <label className="champ"><span>Texte de la recette</span>
          <textarea rows={8} value={b.texte} onChange={e => maj({ texte: e.target.value })} placeholder="Colle ou tape la recette telle quelle" />
          <small className="doux">Colle-la telle quelle : Claude s'occupe de la mise en forme.</small></label>
        <label className="champ"><span>Une précision pour Claude ? <span className="doux">(facultatif)</span></span>
          <input value={b.note} onChange={e => maj({ note: e.target.value })} placeholder="Ex. : version pour 6, garder le piment entier" /></label>
      </div>
      <Barre><button type="button" className="bouton" disabled={!pret} onClick={() => { maj({ recette: null, image: null, essaiIllus: 0 }); aller('traitement'); }}><Ico d={I.spark} size={20} />Mettre en forme</button></Barre>
    </div>
  );
}

/* ── Traitement : Claude puis illustration ────────────────────────────── */
async function fabriquerImage(recette, essai) {
  const brut = await api.illustrer({ prompt: promptIllustration(recette, essai) });
  const blob = b64EnBlob(brut.data, brut.type);
  const propre = brut.demo ? blob : await prepareIllustration(blob, true, true);
  const url = await blobToDataUrl(propre);
  if (!url.startsWith('data:image/webp')) throw new Error('Ce navigateur ne sait pas enregistrer l\'image au format WebP.');
  return url;
}

function Traitement({ b, maj, aller }) {
  const [etapes, setEtapes] = useState({ lecture: b.recette ? 'ok' : 'run', forme: b.recette ? 'ok' : 'run', illus: b.image ? 'ok' : 'wait', macros: b.image ? 'ok' : 'wait' });
  const [err, setErr] = useState('');
  const lance = useRef(false);
  const recetteRef = useRef(b.recette);
  const go = async () => {
    setErr('');
    let r = recetteRef.current;
    try {
      if (!r) {
        setEtapes(s => ({ ...s, lecture: 'run', forme: 'run' }));
        const res = await api.former({ texte: b.texte, note: b.note, photos: b.photos.map(({ type, data }) => ({ type, data })) });
        r = recetteRef.current = res.recette;
        maj({ recette: r, remarques: res.remarques || '' });
      }
      setEtapes(s => ({ ...s, lecture: 'ok', forme: 'ok', illus: 'run' }));
      const image = await fabriquerImage(r, b.essaiIllus || 0);
      maj({ image });
      setEtapes({ lecture: 'ok', forme: 'ok', illus: 'ok', macros: 'ok' });
    } catch (e) {
      setErr(e.message);
      setEtapes(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === 'run' ? 'ko' : v])));
    }
  };
  useEffect(() => { if (!lance.current && !b.image) { lance.current = true; go(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fini = etapes.illus === 'ok';
  const pct = Object.values(etapes).filter(v => v === 'ok').length * 25;
  const Etape = ({ s, t, d }) => (
    <div className="etape">
      <span className={'puce ' + s}>{s === 'ok' ? <Ico d={I.check} size={18} sw={3} color="#FBF6EA" /> : s === 'run' ? <span className="tourne" /> : s === 'ko' ? <Ico d={I.x} size={16} sw={3} color="#FBF6EA" /> : null}</span>
      <div><span className={'gras' + (s === 'wait' ? ' doux' : '')}>{t}</span><span className="doux petit-txt">{d}</span></div>
    </div>
  );
  return (
    <div className="ecran">
      <div className="pile defile">
        <Entete titre={fini ? 'C\'est prêt' : 'Un instant…'} retour={() => aller('saisie')} />
        <p>Claude rédige ta recette avec les mêmes règles que d'habitude, puis l'illustration est créée.</p>
        <div className="pile serre">
          <Etape s={etapes.lecture} t="Lecture de la photo et du texte" d="Ingrédients et étapes repérés" />
          <Etape s={etapes.forme} t="Mise en forme par Claude" d="Tutoiement, étapes courtes, astuce, catégorie" />
          <Etape s={etapes.illus} t="Illustration aquarelle" d="Gemini · sans texte, mise en scène adaptée au plat" />
          <Etape s={etapes.macros} t="Macros et saison" d={b.recette ? `Calcul pour ${b.recette.p} ${b.recette.yield ? b.recette.yield[1] : 'personnes'}` : 'Calcul par portion'} />
        </div>
        <div className="jauge" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
        <Erreur msg={err} onRetry={go} />
        {!fini && !err && <small className="doux">Environ 30 secondes. Tu peux fermer l'app : la recette t'attendra en brouillon sur l'accueil.</small>}
      </div>
      <Barre><button type="button" className="bouton" disabled={!fini} onClick={() => aller('apercu')}>Voir l'aperçu</button></Barre>
    </div>
  );
}

/* ── Aperçu : la recette comme dans Zéro Chichi ───────────────────────── */
function Apercu({ b, maj, aller }) {
  const r = b.recette;
  const [illusEnCours, setIllusEnCours] = useState(false);
  const [err, setErr] = useState('');
  if (!r) return <div className="ecran"><div className="pile"><Entete titre="Aperçu" retour={() => aller('accueil')} /><p>Pas de recette en cours.</p></div></div>;
  const m = macros(r);
  const saisons = seasonsOf(r);
  const autre = async () => {
    setIllusEnCours(true); setErr('');
    try { const essai = (b.essaiIllus || 0) + 1; maj({ image: await fabriquerImage(r, essai), essaiIllus: essai }); } catch (e) { setErr(e.message); }
    setIllusEnCours(false);
  };
  return (
    <div className="ecran">
      <div className="defile apercu">
        <div className="illus" style={{ backgroundImage: b.image ? `url("${b.image}")` : undefined }}>
          <button type="button" className="rond flottant gauche" aria-label="Retour à l'accueil" onClick={() => aller('accueil')}><Ico d={I.back} /></button>
          <span className="badge">Aperçu</span>
          <button type="button" className="bouton petit clair flottant bas" disabled={illusEnCours} onClick={autre}>
            {illusEnCours ? <span className="tourne sombre" /> : <Ico d={I.redo} size={18} />}{illusEnCours ? 'Nouvelle image…' : 'Autre illustration'}</button>
        </div>
        <div className="pile corps">
          <Erreur msg={err} onRetry={autre} />
          {b.remarques && <div className="remarque"><span className="gras">Note de Claude : </span>{b.remarques}</div>}
          <h1 className="h t30">{r.name}</h1>
          <div className="tags">
            {r.cats.map(c => <span key={c} className="tag vert">{c}</span>)}
            <span className="tag orange">{fmtT(r.t)}{waitLabel(r) && ' + ' + waitLabel(r)}</span>
            <span className="tag">{r.p} {r.yield ? r.yield[r.p > 1 ? 1 : 0] : 'pers.'}</span>
            {saisons.map(s => <span key={s} className="tag">{SEASON_LABEL[s]}</span>)}
          </div>
          <div className="macros doux">{m.kcal} kcal · {m.p} g protéines · {m.g} g glucides · {m.l} g lipides, par {m.per}{!m.complete && ' (estimation partielle)'}</div>
          <h2 className="h t20">Ingrédients</h2>
          <div>{r.ing.map((i, k) => {
            const l = ingredientToLine(i), q = l.slice(0, l.length - String(i[2]).length).trim();
            return <div key={k} className="ing"><span className="gras q">{q}</span><span>{i[2]}</span></div>;
          })}</div>
          <h2 className="h t20">Étapes</h2>
          <ol className="etapes">{r.steps.map((s, k) => <li key={k}><span className="num h">{k + 1}</span><span>{s}</span></li>)}</ol>
          {r.tip && <div className="astuce"><span className="h">Astuce</span><span>{r.tip.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')}</span></div>}
        </div>
      </div>
      <Barre>
        <button type="button" className="bouton clair" onClick={() => aller('modifier')}><Ico d={I.pen} size={18} />Modifier</button>
        <button type="button" className="bouton" disabled={!b.image} onClick={() => aller('publication')}>Programmer</button>
      </Barre>
    </div>
  );
}

/* ── Modifier ─────────────────────────────────────────────────────────── */
function Modifier({ b, maj, aller }) {
  const r = b.recette;
  const [f, setF] = useState(() => ({
    name: r.name, cats: r.cats, t: r.t, p: r.p, tip: r.tip || '',
    ing: r.ing.map(ingredientToLine).join('\n'), steps: r.steps.join('\n'),
  }));
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const enregistrer = () => {
    const ing = f.ing.split('\n').map(l => l.trim()).filter(Boolean).map(l => parseIngredient(l)).filter(Boolean);
    const steps = f.steps.split('\n').map(l => l.trim()).filter(Boolean);
    const n = { ...r, name: f.name.trim() || r.name, cats: f.cats.length ? f.cats : r.cats, t: Math.max(1, +f.t || r.t), p: Math.max(1, +f.p || r.p), ing, steps };
    if (f.tip.trim()) n.tip = f.tip.trim(); else delete n.tip;
    maj({ recette: n });
    aller('apercu');
  };
  return (
    <div className="ecran">
      <div className="pile defile">
        <Entete titre="Modifier" retour={() => aller('apercu')} />
        <label className="champ"><span>Titre</span><input value={f.name} onChange={set('name')} /></label>
        <fieldset className="champ"><legend>Catégories</legend>
          <div className="tags">{CATS.map(c => (
            <button key={c} type="button" aria-pressed={f.cats.includes(c)} className={'tag choix' + (f.cats.includes(c) ? ' vert' : '')}
              onClick={() => setF({ ...f, cats: f.cats.includes(c) ? f.cats.filter(x => x !== c) : [...f.cats, c] })}>{c}</button>
          ))}</div></fieldset>
        <div className="rang">
          <label className="champ"><span>Temps (min)</span><input type="number" inputMode="numeric" min="1" value={f.t} onChange={set('t')} /></label>
          <label className="champ"><span>Portions</span><input type="number" inputMode="numeric" min="1" value={f.p} onChange={set('p')} /></label>
        </div>
        <label className="champ"><span>Ingrédients <span className="doux">(un par ligne)</span></span><textarea rows={9} value={f.ing} onChange={set('ing')} /></label>
        <label className="champ"><span>Étapes <span className="doux">(une par ligne)</span></span><textarea rows={9} value={f.steps} onChange={set('steps')} /></label>
        <label className="champ"><span>Astuce</span><textarea rows={3} value={f.tip} onChange={set('tip')} /></label>
      </div>
      <Barre><button type="button" className="bouton clair" onClick={() => aller('apercu')}>Annuler</button><button type="button" className="bouton" onClick={enregistrer}>Enregistrer</button></Barre>
    </div>
  );
}

/* ── Publication ──────────────────────────────────────────────────────── */
function Publication({ b, maj, aller, etat, onPubliee }) {
  const r = b.recette;
  const creneau = useMemo(() => prochainCreneau(etat || []), [etat]);
  const saisons = seasonsOf(r);
  const [enCours, setEnCours] = useState(false);
  const [err, setErr] = useState('');
  const auj = today();
  const date = b.quand === 'maintenant' ? auj : b.quand === 'date' ? b.date : creneau;
  const memeJour = b.quand === 'date' && b.date ? (etat || []).filter(x => x.added === b.date) : [];
  const Option = ({ v, titre, sous, children }) => (
    <div className={'option' + (b.quand === v ? ' on' : '')}>
      <button type="button" role="radio" aria-checked={b.quand === v} onClick={() => maj({ quand: v })}>
        <span className="radio" /><span><span className="gras">{titre}</span><span className="doux petit-txt">{sous}</span></span>
      </button>{b.quand === v && children}
    </div>
  );
  const publier = async () => {
    setEnCours(true); setErr('');
    try {
      const res = await api.publier({ recette: { ...r, added: date }, image: sansEntete(b.image) });
      onPubliee({ id: res.id, name: r.name, cats: r.cats, added: res.added, img: res.id + '.webp', imgData: b.image });
    } catch (e) { setErr(e.message); }
    setEnCours(false);
  };
  return (
    <div className="ecran">
      <div className="pile defile">
        <Entete titre="Quand la publier ?" retour={() => aller('apercu')} />
        <div className="ligne"><span className="vignette" style={{ backgroundImage: `url("${b.image}")` }} />
          <div className="txt"><span className="h t18">{r.name}</span><span className="doux">{r.cats.join(', ')} · illustration ✓ · macros ✓</span></div></div>
        <div className="pile serre" role="radiogroup" aria-label="Date de publication">
          <Option v="creneau" titre="Prochain créneau libre" sous={`${jolieDate(creneau)} · après les recettes déjà programmées`} />
          <Option v="date" titre="Choisir une date" sous={saisons.length ? `Saison conseillée : ${saisons.map(s => SEASON_LABEL[s].toLowerCase()).join(' ou ')}` : 'Recette de toute saison'}>
            <label className="champ dedans"><span className="sr">Date</span><input type="date" min={auj} value={b.date} onChange={e => maj({ date: e.target.value })} /></label>
            {memeJour.length > 0 && <small className="doux dedans">Ce jour-là paraît déjà : {memeJour.map(x => x.name).join(', ')}. Les deux paraîtront ensemble.</small>}
          </Option>
          <Option v="maintenant" titre="Tout de suite" sous="Visible dans Zéro Chichi d'ici 1 à 2 minutes" />
        </div>
        <p className="doux">Le jour venu, la recette apparaît seule dans Zéro Chichi, avec la pastille « nouveau ». Rien d'autre à faire.</p>
        <Erreur msg={err} onRetry={publier} />
      </div>
      <Barre><button type="button" className="bouton" disabled={enCours || !date} onClick={publier}>{enCours ? 'Envoi…' : 'Publier'}</button></Barre>
    </div>
  );
}

function Fait({ r, aller }) {
  const auj = today();
  return (
    <div className="ecran">
      <div className="pile defile fait">
        <span className="puce ok grande"><Ico d={I.check} size={40} sw={3} color="#FBF6EA" /></span>
        <h1 className="h t30 centre">C'est envoyé !</h1>
        {r && <p className="centre"><strong>{r.name}</strong> {r.added <= auj ? 'sera visible dans Zéro Chichi d\'ici 1 à 2 minutes.' : finPhrase(`paraîtra le ${jolieDate(r.added)}`)}</p>}
      </div>
      <Barre><button type="button" className="bouton clair" onClick={() => aller('accueil')}>Accueil</button><button type="button" className="bouton" onClick={() => aller('saisie')}>Une autre</button></Barre>
    </div>
  );
}
