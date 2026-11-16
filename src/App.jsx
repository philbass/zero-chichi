import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE, norm, fmtT, meta, plural, ingList, illus, imgUrl, portionLabel, parseDurations, addedOf, fmtDate, difficulty, totalT, waitLabel } from './lib.js';
import { useTimers, StepTimer, TimerPills } from './timers.jsx';
import { useRecipeStore, getCapability } from './store.js';
import { CATS as CORE_CATS, RECIPES } from './data.js';
import { APP_URL, APP_URL_SHORT, recipeUrl, takeDeepLink, QRCode, shareLink, useInstall, installPlatform, isIPad, INSTALL_PREVIEW, recipeShareUrl, takeSharedCode, decodeSharedRecipe } from './share.jsx';
import RecipeEditor, { CatPicker } from './RecipeEditor.jsx';
import { renderRecipeCard, cardFilename } from './shareCard.js';
import { macros } from './nutrition.js';
import { seasonsOf, currentSeason, SEASON_LABEL } from './season.js';
import { canSpeak, speak, pauseSpeaking, resumeSpeaking, stopSpeaking, speakable, recipeScript, stepScript, useVoiceSettings, useVoices, getVoiceSettings, defaultVoiceURI, voiceRegion } from './speech.js';
import { NEWS, NEWS_ICONS, latestNews, newsSeen, markNewsSeen, newsVisited, markNewsVisited } from './news.js';
import { HeartButton, Confetti, Swipeable, flyDots, withHeroTransition, supportsHeroTransition } from './anim.jsx';

const TINTS = ['accent', 'accent-2', 'neutral'];
const HEART = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const SHARE = ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4M12 2v13'];
const SPEAKER = ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'];
const SPEAKER_OFF = ['M11 5 6 9H2v6h4l5 4z', 'm22 9-6 6', 'm16 9 6 6'];
const SLIDERS = ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'];
const PLAY = 'M7 4.5v15l12-7.5z';
const PAUSE = ['M7 4h3.5v16H7z', 'M13.5 4H17v16h-3.5z'];
const STOP = 'M6 6h12v12H6z';
const PENCIL = 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z';
const ICONS = {
  home: ['m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  search: ['M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'm21 21-4.3-4.3'],
  favs: [HEART],
  courses: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
};
const TABS = [['home', 'Accueil'], ['search', 'Chercher'], ['favs', 'Favoris'], ['courses', 'Courses']];

const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function load(key, fallback) {
  try { const v = localStorage.getItem('zc:' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, v) { try { localStorage.setItem('zc:' + key, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

function Icon({ d, size = 20, fill = 'none', stroke = 'currentColor', sw = 2.75, style }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {paths.filter(Boolean).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const SearchIcon = props => <Icon d={['M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'm21 21-4.3-4.3']} {...props} />;
const BackIcon = props => <Icon d="m15 18-6-6 6-6" {...props} />;
const CloseIcon = props => <Icon d="M18 6 6 18M6 6l12 12" {...props} />;

/* Tablette (écran tactile d'au moins 700 px de large) : 'land' en paysage large, 'port' sinon. */
const TABLET_MQ = '(min-width: 700px) and (pointer: coarse)';
function useTablet() {
  const get = () => {
    if (typeof window === 'undefined') return null;
    const forced = /[?&]tablette\b/.test(location.search);
    if (!forced && !matchMedia(TABLET_MQ).matches) return null;
    return innerWidth >= 960 ? 'land' : 'port';
  };
  const [mode, setMode] = useState(get);
  useEffect(() => {
    const f = () => setMode(get());
    const mq = matchMedia(TABLET_MQ);
    mq.addEventListener?.('change', f); addEventListener('resize', f);
    return () => { mq.removeEventListener?.('change', f); removeEventListener('resize', f); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('tablet', !!mode); }, [mode]);
  return mode;
}

// Ouverture par un lien de recette partagé (#recette=…).
const SHARED = takeSharedCode(); // recette perso reçue (#partage=…)
const DEEP = (() => { const id = takeDeepLink(); return RECIPES.find(r => r.id === id) || null; })();

/* ── application ─────────────────────────────────────────── */
export default function App() {
  const tablet = useTablet();
  const wide = !!tablet;
  const PADX = wide ? 40 : 22;
  const { recipes, categories, addCategory, removeCategory, setCats, updateRecipe, resetRecipe, deleteRecipe } = useRecipeStore();
  const addCat = async name => { const n = await addCategory(name).catch(() => null); if (n) flash('Catégorie « ' + n + ' » prête'); return n; };
  const byId = id => recipes.find(r => r.id === id);
  const [sheet, setSheet] = useState(null); // { type: 'cats' | 'share', id }
  const [stack, setStack] = useState(() => (DEEP ? [{ s: 'home' }, { s: 'recipe', id: DEEP.id }] : [{ s: 'home' }]));
  const [favs, setFavs] = useState(() => load('favs', []));
  const [courses, setCourses] = useState(() => load('courses', []));
  const [q, setQ] = useState('');
  const [fTime, setFTime] = useState(0);
  const [fIng, setFIng] = useState(0);
  const [step, setStep] = useState(0);
  const [portions, setPortions] = useState(DEEP ? DEEP.p : 2);
  const [toast, setToast] = useState('');
  const [newItem, setNewItem] = useState('');
  const [confetti, setConfetti] = useState(false);
  const [cartBump, setCartBump] = useState(null); // { n, key }
  const appRef = useRef(null);
  const cartBtnRef = useRef(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const toastT = useRef(0);
  const skipPop = useRef(0);
  const depth = useRef(1);

  useEffect(() => { if (DEEP) history.pushState({ zc: true }, ''); }, []);
  /* Recette perso reçue par lien : on propose de l'ajouter. */
  const receive = useCallback(async code => {
    const r = await decodeSharedRecipe(code);
    if (r) setSheet({ type: 'incoming', r });
    else flashRef.current('Ce lien de recette est incomplet');
  }, []);
  useEffect(() => { if (SHARED) receive(SHARED); }, [receive]);
  /* Lien de recette ouvert alors que l'app est déjà affichée. */
  useEffect(() => {
    const onHash = () => {
      const code = takeSharedCode();
      if (code) { receive(code); return; }
      const id = takeDeepLink(); if (RECIPES.some(r => r.id === id)) goRef.current({ s: 'recipe', id });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const install = useInstall();
  /* Nouveautés : carte sur l'accueil après une mise à jour, jusqu'à ce que l'utilisateur la ferme. */
  const [newsUnseen, setNewsUnseen] = useState(() => !newsSeen());
  const seeNews = () => { markNewsSeen(); setNewsUnseen(false); };
  const [newsNew, setNewsNew] = useState(() => !newsVisited()); // pastille « Nouveau » tant que la page n'a pas été ouverte
  const openNews = () => { markNewsVisited(); setNewsNew(false); go({ s: 'news' }); };
  useEffect(() => save('favs', favs), [favs]);
  useEffect(() => save('courses', courses), [courses]);
  useEffect(() => { depth.current = stack.length; }, [stack]);

  const top = stack[stack.length - 1];
  const s = top.s;
  const rootTab = stack[0].s;

  /* Historique du navigateur : le bouton retour d'Android / du navigateur remonte d'un écran. */
  useEffect(() => {
    const onPop = () => {
      if (skipPop.current) { skipPop.current--; return; }
      setStack(st => (st.length > 1 ? st.slice(0, -1) : st));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (s === 'search' && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [stack, s]);

  useEffect(() => () => clearTimeout(toastT.current), []);

  const flash = useCallback(msg => {
    clearTimeout(toastT.current);
    setToast(msg);
    toastT.current = setTimeout(() => setToast(''), 1600);
  }, []);
  const flashRef = useRef(flash);
  const T = useTimers(flash, t => {
    if (canSpeak && getVoiceSettings().announceTimers) speak('Minuteur terminé. ' + speakable(t.label) + ' : le temps est écoulé.');
  });
  const openTimer = tm => { const id = tm.recipeId; if (!(s === 'cook' && top.id === id)) go({ s: 'cook', id }); setStep(tm.step); };

  const go = e => {
    if (e.s === 'recipe') setPortions(byId(e.id).p);
    if (e.s === 'cook') setStep(0);
    history.pushState({ zc: true }, '');
    setStack(st => [...st, e]);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const back = () => { if (depth.current > 1) history.back(); };
  const tab = t => {
    const extra = depth.current - 1;
    if (extra > 0) { skipPop.current++; history.go(-extra); }
    setStack([{ s: t }]);
  };

  const toggleFav = id => {
    const on = favs.includes(id);
    setFavs(f => (on ? f.filter(x => x !== id) : [...f, id]));
    flash(on ? 'Retiré des favoris' : 'Ajouté aux favoris');
  };

  const addCourses = r => {
    const items = ingList(r, portions);
    setCourses(cs => {
      const have = new Set(cs.map(c => c.n));
      return [...cs, ...items.filter(i => !have.has(i.n)).map(i => ({ n: i.n, q: i.q, done: false }))];
    });
    const ms = flyDots(appRef.current?.querySelectorAll('[data-ing]') || [], cartBtnRef.current, appRef.current);
    setTimeout(() => setCartBump({ n: items.length, key: Date.now() }), ms);
    flash(items.length + ' ingrédients ajoutés aux courses');
  };

  const addItem = () => {
    const n = newItem.trim();
    if (!n) return;
    setCourses(cs => [...cs, { n, q: '', done: false }]);
    setNewItem('');
  };

  /* ── données dérivées ── */
  const catTiles = useMemo(() => categories.map((c, i) => {
    const t = TINTS[i % 3];
    const n = recipes.filter(r => r.cats.includes(c)).length;
    return { name: c, n, countLabel: n ? plural(n, 'recette') : 'Vide', bg: `var(--color-${t}-200)`, fg: `var(--color-${t}-800)` };
  }), [recipes, categories]);
  // Tirage fait une fois par lancement de l'app : l'ordre reste stable pendant la visite.
  const [seed, setSeed] = useState(() => Math.random());
  const [rolling, setRolling] = useState(0);
  const random3 = useMemo(() => {
    const pool = recipes.filter(r => imgUrl(r));
    let s = Math.floor(seed * 2147483646) + 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 3);
  }, [recipes, seed]);
  // Les plus récentes d'abord ; à date égale, la dernière ajoutée à la liste passe devant.
  const byNewest = useMemo(() => recipes.map((r, i) => [r, addedOf(r) || '', i])
    .sort((a, b) => (a[1] === b[1] ? b[2] - a[2] : a[1] < b[1] ? 1 : -1)).map(x => x[0]), [recipes]);
  const latest = useMemo(() => byNewest.slice(0, 8), [byNewest]);
  // De saison : recettes de la saison actuelle, mélangées une fois par lancement.
  const [seasonSeed] = useState(() => Math.random());
  const nowSeason = currentSeason();
  const seasonal = useMemo(() => {
    let x = Math.floor(seasonSeed * 2147483646) + 1;
    const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const a = recipes.filter(r => imgUrl(r) && seasonsOf(r).includes(nowSeason));
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 8);
  }, [recipes, seasonSeed, nowSeason]);

  let rows = [], listTitle = '', listSub = '', emptyTitle = '', emptyText = '', browse = false, searchInfo = '';
  if (s === 'search') {
    const nq = norm(q.trim());
    browse = !nq && !fTime && !fIng;
    const res = recipes.filter(r =>
      (!nq || norm(r.name + ' ' + r.cats.join(' ') + ' ' + r.ing.map(i => i[2]).join(' ')).includes(nq)) &&
      (!fTime || totalT(r) <= fTime) && (!fIng || r.ing.length <= fIng));
    rows = browse ? [] : res;
    searchInfo = browse ? 'Ou parcours par catégorie' : plural(res.length, 'résultat');
    emptyTitle = 'Rien trouvé'; emptyText = 'Essaie un autre mot ou retire un filtre.';
  } else if (s === 'list') {
    rows = byNewest.filter(r => r.cats.includes(top.cat)); // les plus récentes d'abord
    listTitle = top.cat; listSub = plural(rows.length, 'recette');
    emptyTitle = 'Catégorie vide'; emptyText = 'Ouvre une recette et touche « Catégories » pour la ranger ici.';
  } else if (s === 'favs') {
    rows = recipes.filter(r => favs.includes(r.id));
    listTitle = 'Favoris';
    listSub = rows.length ? plural(rows.length, 'recette') + ' gardée' + (rows.length > 1 ? 's' : '') : '';
    emptyTitle = 'Aucun favori'; emptyText = 'Touche le cœur sur une recette pour la retrouver ici.';
  } else if (s === 'cats') {
    listTitle = 'Catégories'; listSub = recipes.length + ' recettes';
  }

  const recipe = (s === 'recipe' || s === 'cook') ? byId(top.id) : null;
  const isRecipe = !!recipe;
  const isCook = s === 'cook';
  const isEditor = s === 'new' || s === 'edit';
  const showListHeader = s === 'list' || s === 'favs' || s === 'cats';
  const showCatsGrid = s === 'cats' || (s === 'search' && browse);
  const showRows = (s === 'search' && !browse) || s === 'list' || s === 'favs';
  const left = courses.filter(c => !c.done).length;

  const openRecipe = (r, e) => withHeroTransition(e?.currentTarget?.querySelector('[data-thumb]'), () => go({ s: 'recipe', id: r.id }));
  const openCat = c => go({ s: 'list', cat: c });

  return (
    <div className="app" ref={appRef} style={{ '--frame-radius': IS_ANDROID ? '36px' : '54px' }}>
      <div className="statusbar" style={{ color: isCook ? 'var(--color-bg)' : 'var(--color-text)', background: isCook ? 'var(--color-accent-2-700)' : 'transparent' }}>
        <FakeStatus />
      </div>

      <div className="scroll" ref={scrollRef} style={wide && !isRecipe && !isEditor ? { marginLeft: 104 } : undefined}>
        {/* ── Accueil ── */}
        {s === 'home' && (
          <div className="screen" style={{ padding: wide ? '28px 40px 40px' : '12px 22px 28px', display: 'flex', flexDirection: 'column', gap: wide ? 28 : 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <img src={`${BASE}assets/logo-zero-chichi.png`} alt="Zéro Chichi" style={{ height: 64, width: 'auto' }} />
              <button className="reset press" onClick={() => setSheet({ type: 'app' })}
                style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px 0 12px', marginTop: 12, borderRadius: 999, background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', fontSize: 13, fontWeight: 700 }}>
                <Icon d={SHARE} size={16} sw={2.5} />Partager l'app
              </button>
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: wide ? -20 : -14 }}>Des recettes courtes. Rien de plus.</div>
            {install?.inapp && (
              <div className="screen" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px 12px 18px', borderRadius: 24, background: 'var(--color-accent-2-700)', color: 'var(--color-bg)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h" style={{ fontSize: 16 }}>Ouvre dans Chrome pour installer l'app</div>
                  <div style={{ fontSize: 12, color: 'var(--color-accent-2-200)', lineHeight: 1.35 }}>Menu ⋮ en haut à droite, puis « Ouvrir dans Chrome ». Ou copie le lien et colle-le dans Chrome.</div>
                </div>
                <button className="reset press" onClick={async () => { try { await navigator.clipboard.writeText(APP_URL); flash('Lien copié'); } catch { flash(APP_URL); } }}
                  style={{ flex: 'none', height: 38, padding: '0 12px', borderRadius: 999, background: 'var(--color-bg)', color: 'var(--color-accent-2-800)', fontFamily: 'var(--font-heading)', fontSize: 13.5 }}>
                  Copier le lien
                </button>
                <button className="icon-btn" onClick={install.dismiss} aria-label="Masquer" style={{ width: 36, height: 36, color: 'var(--color-bg)' }}><CloseIcon size={16} /></button>
              </div>
            )}
            {install && !install.inapp && (
              <div className="screen" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px 12px 18px', borderRadius: 24, background: 'var(--color-accent-2-700)', color: 'var(--color-bg)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h" style={{ fontSize: 16 }}>Installe l'app</div>
                  <div style={{ fontSize: 12, color: 'var(--color-accent-2-200)' }}>Sur ton écran d'accueil</div>
                </div>
                <button className="reset press" onClick={async () => { if (!(await install.install())) setSheet({ type: 'install' }); }}
                  style={{ flex: 'none', height: 38, padding: '0 14px', borderRadius: 999, background: 'var(--color-bg)', color: 'var(--color-accent-2-800)', fontFamily: 'var(--font-heading)', fontSize: 14 }}>
                  Installer
                </button>
                <button className="icon-btn" onClick={install.dismiss} aria-label="Masquer" style={{ width: 36, height: 36, color: 'var(--color-bg)' }}><CloseIcon size={16} /></button>
              </div>
            )}
            <div style={wide ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, alignItems: 'center' } : { display: 'contents' }}>
            <button className="reset press" onClick={() => tab('search')}
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 18px', borderRadius: 999, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', fontSize: 15, color: 'var(--color-neutral-700)' }}>
              <SearchIcon />Une recette, un ingrédient…
            </button>
            <button className="reset press" onClick={() => go({ s: 'new' })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 10px', borderRadius: 24, background: 'var(--color-accent-100)', marginTop: wide ? 0 : -8 }}>
              <span style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--color-accent)', display: 'grid', placeItems: 'center' }}><Icon d="M5 12h14M12 5v14" /></span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="h" style={{ fontSize: 16 }}>Ajouter une recette perso</span>
                <span className="muted" style={{ fontSize: 12 }}>{wide ? 'Visible seulement sur cet appareil' : 'Visible seulement sur ton téléphone'}</span>
              </span>
            </button>
            </div>
            {newsUnseen && (
              <div className="screen" style={{ position: 'relative', marginTop: wide ? -12 : -8 }}>
                <button className="reset press" onClick={openNews}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 52px 10px 10px', borderRadius: 24, background: 'var(--color-accent-2-100)' }}>
                  <span style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-2-200)', color: 'var(--color-accent-2-800)', display: 'grid', placeItems: 'center' }}><Icon d={NEWS_ICONS.sparkle} size={20} sw={2.2} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="h" style={{ fontSize: 16 }}>Quoi de neuf ?</span>
                      {newsNew && <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 999, background: 'var(--color-accent)', fontSize: 10.5, fontWeight: 700 }}>Nouveau</span>}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>{latestNews.title}</span>
                  </span>
                </button>
                <button className="icon-btn" onClick={seeNews} aria-label="Fermer « Quoi de neuf ? »"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, color: 'var(--color-accent-2-800)' }}>
                  <CloseIcon size={16} />
                </button>
              </div>
            )}

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h2 className="h" style={{ fontSize: 20, margin: 0 }}>Catégories</h2>
                <button className="btn btn-ghost" onClick={() => go({ s: 'cats' })}
                  style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14, whiteSpace: 'nowrap', flex: 'none' }}>Tout voir</button>
              </div>
              <div className={(wide ? 'wrap-row' : 'hscroll') + ' cascade'} style={{ gap: 8 }}>
                {catTiles.map(c => (
                  <button key={c.name} className="reset press" onClick={() => openCat(c.name)}
                    style={{ flex: 'none', height: 40, padding: '0 16px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 14, fontWeight: 600 }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="h" style={{ fontSize: 20, margin: 0 }}>Dernières recettes</h2>
              <div className={wide ? 'cascade' : 'hscroll cascade'} style={wide ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 18 } : { gap: 12, paddingBottom: 4 }}>
                {latest.map(r => (
                  <button key={r.id} className="reset press" onClick={e => openRecipe(r, e)}
                    style={{ flex: 'none', width: wide ? 'auto' : 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div data-thumb className="illus" style={{ position: 'relative', width: '100%', height: wide ? 170 : 150, borderRadius: 28, background: illus(r, 'accent-2'), backgroundOrigin: 'content-box', padding: 16 }}><SeasonBadge r={r} /></div>
                    <div className="h" style={{ fontSize: 16, lineHeight: 1.2 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>{meta(r)}</div>
                  </button>
                ))}
              </div>
            </section>

            {seasonal.length > 0 && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <h2 className="h" style={{ fontSize: 20, margin: 0 }}>De saison</h2>
                  <div className="muted" style={{ fontSize: 13 }}>Les recettes qui vont bien {({ printemps: 'au printemps', 'été': "en été", automne: 'en automne', hiver: 'en hiver' })[nowSeason]}</div>
                </div>
                <div className={wide ? 'cascade' : 'hscroll cascade'} style={wide ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 18 } : { gap: 12, paddingBottom: 4 }}>
                  {seasonal.map(r => (
                    <button key={r.id} className="reset press" onClick={e => openRecipe(r, e)}
                      style={{ flex: 'none', width: wide ? 'auto' : 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div data-thumb className="illus" style={{ width: '100%', height: wide ? 170 : 150, borderRadius: 28, background: illus(r, 'accent-2'), backgroundOrigin: 'content-box', padding: 16 }} />
                      <div className="h" style={{ fontSize: 16, lineHeight: 1.2 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>{meta(r)}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 className="h" style={{ fontSize: 20, margin: 0 }}>Au hasard</h2>
                <button key={'d' + rolling} className={'reset dice-btn' + (rolling ? ' rolling' : '')} aria-label="Tirer trois autres recettes"
                  onClick={() => { setSeed(Math.random()); setRolling(n => n + 1); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" /></svg>
                </button>
              </div>
              <div className={wide ? '' : 'hscroll'} style={wide ? { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 } : { gap: 12, paddingBottom: 4 }}>
                {random3.map(r => (
                  <button key={rolling + '-' + r.id} className="reset press flip-in" onClick={e => openRecipe(r, e)}
                    style={{ flex: 'none', width: wide ? 'auto' : 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div data-thumb className="illus" style={{ position: 'relative', width: '100%', height: wide ? 170 : 150, borderRadius: 28, background: illus(r, 'accent-2'), backgroundOrigin: 'content-box', padding: 16 }}><SeasonBadge r={r} /></div>
                    <div className="h" style={{ fontSize: 16, lineHeight: 1.2 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>{meta(r)}</div>
                  </button>
                ))}
              </div>
            </section>

            <button className="btn btn-ghost" onClick={openNews}
              style={{ alignSelf: 'center', fontSize: 13.5, color: 'var(--color-neutral-700)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Nouveautés de l'app
            </button>
            {canSpeak && (
              <button className="btn btn-ghost" onClick={() => setSheet({ type: 'voice' })}
                style={{ alignSelf: 'center', fontSize: 13.5, color: 'var(--color-neutral-700)', textDecoration: 'underline', textUnderlineOffset: 3, marginTop: -16 }}>
                Réglages de lecture
              </button>
            )}

          </div>
        )}

        {/* ── En-tête de liste ── */}
        {showListHeader && (
          <div className="screen" style={{ padding: `${wide ? 24 : 8}px ${PADX}px 0`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stack.length > 1 && (
              <button className="icon-btn" onClick={back} aria-label="Retour" style={{ alignSelf: 'flex-start', marginLeft: -8 }}>
                <BackIcon size={24} />
              </button>
            )}
            <div>
              <h1 className="h" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>{listTitle}</h1>
              <div className="muted" style={{ fontSize: 13 }}>{listSub}</div>
            </div>
          </div>
        )}

        {/* ── Recherche ── */}
        {s === 'search' && (
          <div className="screen" style={{ padding: `${wide ? 28 : 14}px ${PADX}px 0`, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: wide ? 760 : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 16px', borderRadius: 999, border: '2px solid var(--color-accent)', background: 'var(--color-surface)' }}>
              <SearchIcon stroke="var(--color-accent-700)" />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Pâtes, œufs, chocolat…"
                type="search" enterKeyHint="search" aria-label="Rechercher une recette"
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', font: 'inherit', fontSize: 16, color: 'var(--color-text)', outline: 'none', WebkitAppearance: 'none' }} />
              {q && (
                <button className="reset" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Effacer"
                  style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-neutral-300)', display: 'grid', placeItems: 'center' }}>
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ChipRow label="Temps" options={[30, 60, 120]} value={fTime} onChange={setFTime} render={m => '≤ ' + fmtT(m)} />
              <ChipRow label="Ingrédients" options={[6, 10]} value={fIng} onChange={setFIng} render={m => m + ' max'} />
            </div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 600 }} aria-live="polite">{searchInfo}</div>
          </div>
        )}

        {/* ── Grille des catégories ── */}
        {showCatsGrid && (
          <div className="cascade" style={{ padding: `16px ${PADX}px 28px`, display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(190px, 1fr))' : 'repeat(2,minmax(0,1fr))', gap: wide ? 14 : 10 }}>
            {catTiles.map(c => (
              <button key={c.name} className="reset press" onClick={() => openCat(c.name)}
                style={{ height: 96, padding: '14px 16px', borderRadius: 28, background: c.bg, color: c.fg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span lang="fr" className="h" style={{ fontSize: c.name.length > 12 ? 14.5 : 16, lineHeight: 1.1, hyphens: 'manual', overflowWrap: 'anywhere', maxWidth: '100%' }}>{c.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{c.countLabel}</span>
              </button>
            ))}
            {s === 'cats' && (
              <button className="reset press" onClick={() => setSheet({ type: 'newcat' })}
                style={{ height: 96, padding: '14px 16px', borderRadius: 28, border: '2px dashed var(--color-neutral-500)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="h" style={{ fontSize: 16, lineHeight: 1.1 }}>Nouvelle catégorie</span>
                <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>+</span>
              </button>
            )}
          </div>
        )}

        {/* ── Lignes de recettes ── */}
        {showRows && (
          <div className="cascade" style={wide ? { padding: `16px ${PADX}px 32px`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 } : { padding: '16px 22px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => {
              const fav = favs.includes(r.id);
              const row = (
                <div role="button" tabIndex={0} className="press" onClick={e => openRecipe(r, e)}
                  onKeyDown={e => { if (e.key === 'Enter') openRecipe(r, e); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 26, background: 'var(--color-surface)', cursor: 'pointer' }}>
                  <div data-thumb style={{ position: 'relative', width: 64, height: 64, flex: 'none', borderRadius: 20, background: illus(r, 'accent-2'), backgroundOrigin: 'content-box', padding: 6 }}><SeasonBadge r={r} small /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="h" style={{ fontSize: 17, lineHeight: 1.2 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{meta(r)}</div>
                  </div>
                  <HeartButton fav={fav} onToggle={() => toggleFav(r.id)} />
                </div>
              );
              return s === 'favs'
                ? <Swipeable key={r.id} radius={26} label="Retirer des favoris" onRemove={() => toggleFav(r.id)}>{row}</Swipeable>
                : <div key={r.id}>{row}</div>;
            })}
            {!rows.length && (
              <div style={{ padding: '40px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', gridColumn: '1 / -1' }}>
                <div className="h" style={{ fontSize: 20 }}>{emptyTitle}</div>
                <div className="muted" style={{ fontSize: 14, maxWidth: 260 }}>{emptyText}</div>
                {s === 'list' && !CORE_CATS.includes(top.cat) && (
                  <button className="btn btn-secondary" style={{ marginTop: 12, height: 42, padding: '0 18px' }}
                    onClick={async () => { if (await removeCategory(top.cat).catch(() => false)) { back(); flash('Catégorie supprimée'); } }}>
                    Supprimer cette catégorie
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Fiche recette ── */}
        {isRecipe && (
          <RecipeView r={recipe} land={tablet === 'land'} wide={wide} onVoice={() => setSheet({ type: 'voice' })} fav={favs.includes(recipe.id)} portions={portions} setPortions={setPortions}
            onBack={back} onFav={() => toggleFav(recipe.id)}
            onShare={() => setSheet({ type: 'share', id: recipe.id })}
            onCats={() => setSheet({ type: 'cats', id: recipe.id })}
            onEdit={() => go({ s: 'edit', id: recipe.id })} />
        )}

        {/* ── Nouvelle recette / modification ── */}
        {isEditor && (
          <div style={wide ? { maxWidth: 760, margin: '0 auto' } : { display: 'contents' }}>
          <RecipeEditor key={top.id || 'new'} initial={s === 'edit' ? byId(top.id) : null} cats={categories} onAddCat={addCat} onBack={back}
            onSave={async (fields, image) => {
              const orig = s === 'edit' ? byId(top.id) : null;
              const id = await updateRecipe(orig, fields, image).catch(() => null);
              if (!id) { flash('Enregistrement impossible, réessaie'); return false; }
              flash(orig ? 'Recette modifiée' : 'Recette ajoutée');
              if (orig) back();
              else { setStack(st => [...st.slice(0, -1), { s: 'recipe', id }]); setPortions(fields.p); }
              return true;
            }}
            onReset={async id => {
              await resetRecipe(id).catch(() => {});
              flash("Recette d'origine rétablie"); back();
            }}
            onDelete={async id => {
              await deleteRecipe(id).catch(() => {});
              setFavs(f => f.filter(x => x !== id));
              tab('home'); flash('Recette supprimée');
            }} />
          </div>
        )}

        {/* ── Nouveautés ── */}
        {s === 'news' && (
          <NewsView recipes={recipes} wide={wide} onBack={back} onOpen={openRecipe}
            onAction={a => {
              if (a === 'app') setSheet({ type: 'app' });
              else if (a === 'home') tab('home');
              else if (a === 'new') go({ s: 'new' });
              else if (a === 'voice') setSheet({ type: 'voice' });
              else if (a === 'random') { const pool = recipes.filter(r => !r.custom); go({ s: 'recipe', id: pool[Math.floor(Math.random() * pool.length)].id }); }
            }} />
        )}

        {/* ── Courses ── */}
        {s === 'courses' && (
          <div className="screen" style={{ padding: wide ? '24px 40px 40px' : '8px 22px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: wide ? 720 : undefined }}>
            <div>
              <h1 className="h" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>Courses</h1>
              <div className="muted" style={{ fontSize: 13 }}>{courses.length ? plural(left, 'article') + ' à acheter' : ''}</div>
            </div>
            <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); addItem(); }}>
              <input className="input" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Ajouter un article"
                enterKeyHint="done" aria-label="Ajouter un article" style={{ height: 46, fontSize: 15 }} />
              <button type="submit" className="btn btn-primary" aria-label="Ajouter" style={{ width: 46, height: 46, padding: 0, flex: 'none', borderRadius: '50%' }}>
                <Icon d="M5 12h14M12 5v14" />
              </button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {courses.map((c, i) => (
                <Swipeable key={c.n + i} onRemove={() => setCourses(cs => cs.filter((_, j) => j !== i))}>
                  <div role="checkbox" aria-checked={c.done} tabIndex={0} className={'course' + (c.done ? ' done' : '')}
                    onClick={() => setCourses(cs => cs.map((cc, j) => (j === i ? { ...cc, done: !cc.done } : cc)))}
                    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.currentTarget.click(); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', cursor: 'pointer', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
                    <div className="course-box">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                    <div style={{ flex: 1, fontSize: 16 }}><span className="course-txt">{c.n}</span></div>
                    <span className="muted course-q" style={{ fontSize: 13, fontWeight: 700 }}>{c.q}</span>
                  </div>
                </Swipeable>
              ))}
            </div>
            {courses.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>Astuce : fais glisser un article vers la gauche pour le retirer.</div>}
            {!courses.length && (
              <div style={{ padding: '36px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <div className="h" style={{ fontSize: 20 }}>Liste vide</div>
                <div className="muted" style={{ fontSize: 14, maxWidth: 260 }}>Ouvre une recette et ajoute ses ingrédients en un geste.</div>
              </div>
            )}
            {courses.some(c => c.done) && (
              <button className="btn btn-secondary" onClick={() => setCourses(cs => cs.filter(c => !c.done))}
                style={{ alignSelf: 'flex-start', height: 42, padding: '0 18px' }}>Retirer les articles cochés</button>
            )}
          </div>
        )}
      </div>

      {/* ── Barre d'actions de la fiche ── */}
      {isRecipe && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 18px', paddingBottom: 'max(28px, calc(14px + var(--bottom-safe)))', display: 'flex', gap: 10, justifyContent: wide ? 'flex-end' : undefined, paddingInline: wide ? 40 : undefined, background: 'var(--color-bg)', boxShadow: '0 -8px 24px color-mix(in srgb, var(--color-neutral-900) 8%, transparent)', zIndex: 10 }}>
          <button ref={cartBtnRef} key={cartBump?.key || 0} className={'btn btn-secondary' + (cartBump ? ' jiggle' : '')} onClick={() => addCourses(recipe)} style={{ flex: wide ? 'none' : 1, width: wide ? 220 : undefined, height: 52, fontSize: 15, position: 'relative' }}>
            + Aux courses
            {cartBump && <span className="count-pop" aria-hidden="true">+{cartBump.n}</span>}
          </button>
          <button className="btn btn-primary" onClick={() => go({ s: 'cook', id: recipe.id })} style={{ flex: wide ? 'none' : 1.2, width: wide ? 280 : undefined, height: 52, fontSize: 16 }}>Cuisiner</button>
        </div>
      )}

      {/* ── Mode cuisine ── */}
      {isCook && (
        <CookView r={recipe} onVoice={() => setSheet({ type: 'voice' })} wide={wide} portions={portions} step={step} setStep={setStep} onClose={back} T={T} onOpenTimer={openTimer}
          onDone={() => { back(); flash('Bon appétit'); setConfetti(true); }} />
      )}

      {sheet?.type === 'cats' && byId(sheet.id) && (
        <CatsSheet r={byId(sheet.id)} cats={categories} onAddCat={addCat} onClose={() => setSheet(null)}
          onSave={async cats => { setSheet(null); try { await setCats(sheet.id, cats); flash('Catégories enregistrées'); } catch { flash('Enregistrement impossible'); } }} />
      )}
      {sheet?.type === 'newcat' && (
        <NewCatSheet onClose={() => setSheet(null)} onAdd={async n => { const name = await addCat(n); if (name) setSheet(null); }} />
      )}
      {sheet?.type === 'app' && <AppShareSheet onClose={() => setSheet(null)} flash={flash} />}
      {sheet?.type === 'install' && <InstallGuide onClose={() => setSheet(null)} flash={flash} />}
      {sheet?.type === 'voice' && <VoiceSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'incoming' && (
        <IncomingSheet r={sheet.r}
          existing={recipes.find(x => x.custom && x.name === sheet.r.name && JSON.stringify(x.ing) === JSON.stringify(sheet.r.ing))}
          onClose={() => setSheet(null)}
          onOpen={x => { setSheet(null); go({ s: 'recipe', id: x.id }); }}
          onAdd={async () => {
            const r = sheet.r;
            const id = await updateRecipe(null, { ...r, cats: r.cats.filter(c => categories.includes(c)), shared: true }).catch(() => null);
            if (!id) { flash('Ajout impossible, réessaie'); return; }
            setSheet(null);
            history.pushState({ zc: true }, '');
            setStack(st => [...st, { s: 'recipe', id }]); setPortions(r.p);
            flash('Recette ajoutée à tes recettes');
          }} />
      )}
      {sheet?.type === 'share' && byId(sheet.id) && (
        <ShareSheet r={byId(sheet.id)} portions={portions} onClose={() => setSheet(null)} flash={flash} />
      )}

      {!isCook && T.timers.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(var(--status-h) + 14px)', right: 116, left: 66, zIndex: 45, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}><TimerPills timers={T.timers} T={T} onOpen={openTimer} /></div>
        </div>
      )}

      {confetti && <Confetti onEnd={() => setConfetti(false)} />}

      {toast && <div key={toast} className="toast" role="status">{toast}</div>}

      {/* ── Onglets ── */}
      {!isRecipe && !isEditor && (
        <nav style={wide
          ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: 104, padding: 'calc(28px + var(--status-h)) 0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'var(--color-bg)', boxShadow: '1px 0 0 var(--color-divider)', zIndex: 5 }
          : { flex: 'none', padding: '8px 10px', paddingBottom: 'max(22px, var(--bottom-safe))', display: 'flex', background: 'var(--color-bg)', boxShadow: '0 -1px 0 var(--color-divider)' }}>
          {TABS.map(([k, label]) => {
            const on = rootTab === k;
            return (
              <button key={k} className="reset" onClick={() => tab(k)} aria-current={on ? 'page' : undefined}
                style={{ flex: wide ? 'none' : 1, width: wide ? 88 : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: on ? 'var(--color-accent-700)' : 'var(--color-neutral-600)', fontSize: 11, fontWeight: 700, height: 54, justifyContent: 'center' }}>
                <div style={{ width: 58, height: 30, borderRadius: 999, background: on && (IS_ANDROID || wide) ? 'var(--color-accent-200)' : 'transparent', display: 'grid', placeItems: 'center', transition: 'background-color .15s' }}>
                  <span style={{ position: 'relative', display: 'grid' }}>
                    <Icon d={ICONS[k]} size={22} />
                    {k === 'courses' && left > 0 && <span key={left} className="tab-badge">{left}</span>}
                  </span>
                </div>
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/* ── composants ─────────────────────────────────────────── */
function FakeStatus() {
  return (
    <div className="statusbar-fake" aria-hidden="true">
      <span>9:41</span>
      {IS_ANDROID
        ? <div style={{ position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--color-neutral-900)' }} />
        : <div style={{ position: 'absolute', left: '50%', top: 11, transform: 'translateX(-50%)', width: 120, height: 34, borderRadius: 999, background: 'var(--color-neutral-900)' }} />}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <div style={{ width: 17, height: 11, borderRadius: 3, background: 'currentColor', opacity: 0.85 }} />
        <div style={{ width: 25, height: 12, borderRadius: 4, border: '2px solid currentColor', opacity: 0.85 }} />
      </div>
    </div>
  );
}

function ChipRow({ label, options, value, onChange, render }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} role="group" aria-label={label}>
      <span className="muted" style={{ fontSize: 12, fontWeight: 700, width: 78 }}>{label}</span>
      {options.map(m => {
        const on = value === m;
        return (
          <button key={m} className="reset" aria-pressed={on} onClick={() => onChange(on ? 0 : m)}
            style={{ height: 34, padding: '0 13px', borderRadius: 999, border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}`, background: on ? 'var(--color-text)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)', fontSize: 13, fontWeight: 600, transition: 'background-color .15s, color .15s' }}>
            {render(m)}
          </button>
        );
      })}
    </div>
  );
}

function RecipeView({ r, land, wide, onVoice, fav, portions, setPortions, onBack, onFav, onShare, onCats, onEdit }) {
  const ing = ingList(r, portions);
  const px = land ? 0 : wide ? 40 : 22;
  const hero = (
    <div className={supportsHeroTransition() ? '' : 'hero-in'} style={{ viewTransitionName: 'zc-hero', position: 'relative', background: illus(r, 'accent-2'), backgroundOrigin: 'content-box',
      ...(land
        ? { height: 'min(46vh, 360px)', borderRadius: 40, padding: '62px 20px 20px' }
        : { height: `calc(min(96vw, ${wide ? 460 : 380}px) + var(--status-h))`, marginTop: 'calc(-1 * var(--status-h))', borderRadius: '0 0 40px 40px', padding: 'calc(58px + var(--status-h)) 10px 14px' }) }}>
      {!imgUrl(r) && <div style={{ position: 'absolute', bottom: 16, left: 22, font: '500 10px ui-monospace,Menlo,monospace', color: 'var(--color-neutral-700)' }}>illustration du plat</div>}
      <div style={{ position: 'absolute', top: land ? 12 : 'calc(10px + var(--status-h))', left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
        <button className="icon-btn raised" onClick={onBack} aria-label="Retour"><BackIcon size={22} /></button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="icon-btn raised" onClick={onShare} aria-label="Partager en image"><Icon d={SHARE} /></button>
          <HeartButton className="icon-btn raised" fav={fav} onToggle={onFav} />
        </div>
      </div>
    </div>
  );
  const head = (
    <div style={{ padding: `20px ${px}px 0`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h1 className="h" style={{ fontSize: wide ? 34 : 30, lineHeight: 1.1, margin: 0 }}>{r.name}</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="tag tag-accent-2">{fmtT(r.t)}</span>
        {waitLabel(r) && <span className="tag tag-neutral">+ {waitLabel(r)}</span>}
        <span className="tag tag-accent">{r.ing.length} ingrédients</span>
        <span className={'tag ' + ({ Facile: 'tag-accent-2', Moyen: 'tag-accent', Long: 'tag-neutral' })[difficulty(r)]}>{difficulty(r)}</span>
        <SeasonTag r={r} />
        {r.cats.map(c => <span key={c} className="tag tag-neutral">{c}</span>)}
        <button className="reset tag" onClick={onCats} aria-label="Modifier les catégories"
          style={{ border: '1px dashed var(--color-neutral-500)', gap: 4, cursor: 'pointer' }}>
          <Icon d={PENCIL} size={12} sw={2.5} />Catégories
        </button>
      </div>
      {addedOf(r) && <div className="muted" style={{ fontSize: 13 }}>Ajoutée le {fmtDate(addedOf(r))}</div>}
      <ListenBar r={r} portions={portions} onSettings={onVoice} />
      <MacrosCard r={r} />
      {onEdit && (
        <button className="btn btn-ghost" onClick={onEdit} style={{ alignSelf: 'flex-start', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14, marginTop: -2 }}>
          Modifier la recette
        </button>
      )}
    </div>
  );
  const body = (
    <>
      <div style={{ padding: `${land ? 0 : 22}px ${px}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="h" style={{ fontSize: wide ? 24 : 20, margin: 0 }}>Ingrédients</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, background: 'var(--color-surface)' }}>
          <StepperBtn label="Moins" d="M5 12h14" onClick={() => setPortions(p => Math.max(1, p - 1))} />
          <span style={{ minWidth: 74, padding: '0 4px', textAlign: 'center', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }} aria-live="polite">{portionLabel(r, portions)}</span>
          <StepperBtn label="Plus" d="M5 12h14M12 5v14" onClick={() => setPortions(p => Math.min(Math.max(12, r.p * 2), p + 1))} />
        </div>
      </div>
      <div style={{ padding: `12px ${px}px 0`, display: wide ? 'grid' : 'flex', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 28, flexDirection: 'column', gap: wide ? undefined : 2 }}>
        {ing.map((i, k) => (
          <div key={k} data-ing style={{ display: 'flex', gap: 12, padding: '9px 0', fontSize: wide ? 17 : 16, borderBottom: '1px solid var(--color-divider)' }}>
            <span style={{ width: 84, flex: 'none', fontWeight: 700, color: 'var(--color-accent-700)' }}>{i.q}</span>
            <span>{i.n}</span>
          </div>
        ))}
      </div>

      <h2 className="h" style={{ padding: `26px ${px}px 0`, fontSize: wide ? 24 : 20, margin: 0 }}>Étapes</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: `12px ${px}px 0`, display: 'flex', flexDirection: 'column', gap: wide ? 16 : 12 }}>
        {r.steps.map((t, k) => (
          <li key={k} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div className="h" style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-2-200)', color: 'var(--color-accent-2-800)', display: 'grid', placeItems: 'center', fontSize: 15 }}>{k + 1}</div>
            <div style={{ fontSize: wide ? 18 : 16, lineHeight: 1.45, paddingTop: 4 }}>{t}</div>
          </li>
        ))}
      </ol>
    </>
  );
  if (land) return (
    <div className="screen" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 6fr)', gap: 44, alignItems: 'start', padding: 'calc(20px + var(--status-h)) 40px calc(110px + var(--bottom-safe))' }}>
      <div style={{ position: 'sticky', top: 20 }}>{hero}{head}</div>
      <div style={{ paddingTop: 8 }}>{body}</div>
    </div>
  );
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'calc(110px + var(--bottom-safe))' }}>
      {hero}{head}{body}
    </div>
  );
}

/* ── Saisons ─────────────────────────────────────────── */
const SEASON_ICON = {
  printemps: ['M12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5 4.5 4.5 0 1 1-4.5-4.5A4.5 4.5 0 1 1 12 7.5z', 'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4'],
  'été': ['M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'],
  automne: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
  hiver: ['M2 12h20', 'M12 2v20', 'm20 16-4-4 4-4', 'm4 8 4 4-4 4', 'm16 4-4 4-4-4', 'm8 20 4-4 4 4'],
};
const SEASON_COLOR = {
  printemps: ['#F9DDE6', '#8B3A5C'], 'été': ['#FCE7A6', '#7A5A00'], automne: ['#F6CFA8', '#8A4B16'], hiver: ['#D8E8F5', '#2D5674'],
};
const SEASON_VARIANT = 'C'; // badge « De saison » seulement sur les recettes de la saison actuelle

function SeasonBadge({ r, small }) {
  const ss = seasonsOf(r);
  if (!ss.length) return null;
  const pos = { position: 'absolute', top: small ? -4 : 10, left: small ? -4 : 10, zIndex: 1, pointerEvents: 'none' };
  if (SEASON_VARIANT === 'C') {
    if (!ss.includes(currentSeason())) return null;
    return small
      ? <span style={{ ...pos, width: 22, height: 22, borderRadius: '50%', background: 'var(--color-accent-2-700)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-md)' }}><Icon d={SEASON_ICON.automne} size={12} sw={2.6} /></span>
      : <span style={{ ...pos, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 999, background: 'var(--color-accent-2-700)', color: '#fff', fontSize: 11.5, fontWeight: 700, boxShadow: 'var(--shadow-md)' }}><Icon d={SEASON_ICON.automne} size={13} sw={2.6} />De saison</span>;
  }
  if (SEASON_VARIANT === 'B' || small) {
    return (
      <span style={{ ...pos, display: 'flex', gap: 3 }}>
        {ss.map(x => (
          <span key={x} title={SEASON_LABEL[x]} style={{ width: small ? 22 : 30, height: small ? 22 : 30, borderRadius: '50%', background: SEASON_COLOR[x][0], color: SEASON_COLOR[x][1], display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-md)' }}>
            <Icon d={SEASON_ICON[x]} size={small ? 12 : 16} sw={2.4} />
          </span>
        ))}
      </span>
    );
  }
  const [bg, fg] = SEASON_COLOR[ss[0]];
  return (
    <span style={{ ...pos, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, boxShadow: 'var(--shadow-md)' }}>
      <Icon d={SEASON_ICON[ss[0]]} size={13} sw={2.4} />{ss.map(x => SEASON_LABEL[x]).join(' · ')}
    </span>
  );
}

function SeasonTag({ r }) {
  const ss = seasonsOf(r);
  if (!ss.length) return <span className="tag tag-neutral">Toute l'année</span>;
  const [bg, fg] = SEASON_COLOR[ss[0]];
  return (
    <span className="tag" style={{ background: bg, color: fg, gap: 4 }}>
      <Icon d={SEASON_ICON[ss[0]]} size={12} sw={2.4} />{ss.map(x => SEASON_LABEL[x]).join(' · ')}{ss.includes(currentSeason()) ? ' · de saison' : ''}
    </span>
  );
}

/* ── Lecture à voix haute ─────────────────────────────── */
function ListenBar({ r, portions, onSettings }) {
  const [st, setSt] = useState(null); // { playing, paused, index, total }
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { stopSpeaking(); setSt(null); }, [r.id, portions]);
  if (!canSpeak) return null;
  const active = st && st.index >= 0;
  const btn = { height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 };
  return (
    <div style={{ marginTop: 2, padding: 8, borderRadius: 22, background: 'var(--color-accent-2-100)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {!active ? (
        <button className="reset press" onClick={() => speak(recipeScript(r, portions), setSt)}
          style={{ ...btn, padding: '0 16px 0 12px', background: 'var(--color-accent-2-700)', color: 'var(--color-bg)' }}>
          <Icon d={PLAY} size={16} fill="currentColor" sw={0} />Écouter la recette
        </button>
      ) : (
        <>
          <button className="reset press" onClick={() => (st.paused ? resumeSpeaking() : pauseSpeaking())}
            style={{ ...btn, padding: '0 16px 0 12px', background: 'var(--color-accent-2-700)', color: 'var(--color-bg)' }}>
            <Icon d={st.paused ? PLAY : PAUSE} size={16} fill="currentColor" sw={0} />{st.paused ? 'Reprendre' : 'Pause'}
          </button>
          <button className="reset press" onClick={() => { stopSpeaking(); setSt(null); }} aria-label="Arrêter la lecture"
            style={{ ...btn, width: 40, justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-accent-2-800)' }}>
            <Icon d={STOP} size={14} fill="currentColor" sw={0} />
          </button>
        </>
      )}
      <div style={{ flex: 1, minWidth: 80, fontSize: 12.5, color: 'var(--color-accent-2-800)', fontWeight: 600 }}>
        {active ? (st.paused ? 'En pause' : 'Lecture en cours') + ' · ' + Math.round(((st.index + 1) / st.total) * 100) + ' %' : 'Ingrédients et étapes lus à voix haute'}
      </div>
      <button className="icon-btn" onClick={onSettings} aria-label="Réglages de lecture" style={{ width: 40, height: 40, color: 'var(--color-accent-2-800)' }}>
        <Icon d={SLIDERS} size={18} sw={2.4} />
      </button>
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{label}</span>
        {hint && <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{hint}</span>}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
      <span aria-hidden="true" style={{ width: 48, height: 28, flex: 'none', borderRadius: 999, padding: 3, background: checked ? 'var(--color-accent-2-700)' : 'var(--color-neutral-300)', transition: 'background-color .15s' }}>
        <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: 'var(--color-bg)', transform: checked ? 'translateX(20px)' : 'none', transition: 'transform .15s' }} />
      </span>
    </label>
  );
}

const RATE_LABEL = v => (v <= 0.8 ? 'Très lente' : v < 0.95 ? 'Lente' : v <= 1.05 ? 'Normale' : v <= 1.2 ? 'Rapide' : 'Très rapide');

function VoiceSheet({ onClose }) {
  const [vs, setVoice] = useVoiceSettings();
  const voices = useVoices();
  const current = vs.voice && voices.some(v => v.voiceURI === vs.voice) ? vs.voice : defaultVoiceURI();
  const fr = voices.some(v => /^fr/i.test(v.lang));
  const tryIt = () => speak("Préchauffe le four à 180 degrés. Pendant ce temps, épluche les pommes et coupe-les en dés.");
  useEffect(() => () => stopSpeaking(), []);
  return (
    <Sheet title="Réglages de lecture" onClose={onClose}>
      <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>Ces réglages sont gardés sur cet appareil. Chacun règle sa voix et sa vitesse sur son téléphone.</div>
      {!fr && voices.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 16, background: 'var(--color-accent-100)', fontSize: 13.5 }}>
          Aucune voix française trouvée. Sur iPhone : Réglages, Accessibilité, Contenu énoncé, Voix, Français, pour en télécharger une.
        </div>
      )}
      <label htmlFor="zc-voice" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-neutral-700)' }}>
        Voix
        <select id="zc-voice" value={current} onChange={e => setVoice({ voice: e.target.value })}
          style={{ font: 'inherit', fontSize: 15, fontWeight: 500, color: 'var(--color-text)', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 14, padding: '10px 12px' }}>
          {voices.length === 0 && <option value="">Voix de l'appareil</option>}
          {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{voiceRegion(v) ? ' · ' + voiceRegion(v) : ''}{v.localService ? '' : ' · en ligne'}</option>)}
        </select>
      </label>
      <label htmlFor="zc-rate" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--color-neutral-700)' }}>
        <span>Vitesse : <span style={{ color: 'var(--color-text)' }}>{RATE_LABEL(vs.rate)}</span></span>
        <input id="zc-rate" type="range" min="0.7" max="1.4" step="0.05" value={vs.rate} onChange={e => setVoice({ rate: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--color-accent-2-700)', height: 32 }} />
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600 }}><span>Lente</span><span>Normale</span><span>Rapide</span></span>
      </label>
      <button className="btn btn-secondary" onClick={tryIt} style={{ height: 46, fontSize: 15, gap: 8 }}>
        <Icon d={SPEAKER} size={18} sw={2.4} />Essayer
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <Toggle id="zc-readsteps" label="Lire chaque étape dans « Cuisiner »" hint="Aussi activable avec le bouton haut-parleur du mode Cuisiner."
          checked={vs.readSteps} onChange={v => setVoice({ readSteps: v })} />
        <Toggle id="zc-announce" label="Annoncer la fin des minuteurs" hint="En plus de la sonnerie."
          checked={vs.announceTimers} onChange={v => setVoice({ announceTimers: v })} />
      </div>
      <button className="btn btn-primary" onClick={onClose} style={{ height: 50, fontSize: 15 }}>C'est réglé</button>
    </Sheet>
  );
}

function MacrosCard({ r }) {
  const m = macros(r);
  if (!m.counted) return null;
  const items = [['Énergie', m.kcal, 'kcal'], ['Protéines', m.p, 'g'], ['Glucides', m.g, 'g'], ['Lipides', m.l, 'g']];
  return (
    <div style={{ marginTop: 4, padding: '12px 14px 10px', borderRadius: 22, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {items.map(([label, v, unit], k) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '6px 2px', borderRadius: 14, background: k === 0 ? 'var(--color-accent-100)' : 'var(--color-neutral-100)' }}>
            <span className="h" style={{ fontSize: 18, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{v}<span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, marginLeft: 2 }}>{unit}</span></span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-700)' }}>{label}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>
        Par {m.per}{m.unknown.length ? ' · sans ' + m.unknown.join(', ') : ''}. Estimation calculée à partir des ingrédients (valeurs moyennes Ciqual).
      </div>
    </div>
  );
}

function StepperBtn({ label, d, onClick }) {
  return (
    <button className="reset press" onClick={onClick} aria-label={label}
      style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-bg)', display: 'grid', placeItems: 'center' }}>
      <Icon d={d} size={16} />
    </button>
  );
}

function CookView({ r, onVoice, wide, portions, step, setStep, onClose, onDone, T, onOpenTimer }) {
  const n = r.steps.length;
  const i = Math.min(step, n - 1);
  const last = i === n - 1;
  const durations = parseDurations(r.steps[i]);
  const keyOf = k => `${r.id}:${i}:${k}`;
  const others = T.timers.filter(t => !(t.recipeId === r.id && t.step === i));
  const long = r.steps[i].length > 80 || durations.length > 1;
  // Sens du glissement, figé pour chaque étape (le minuteur rafraîchit l'écran sans changer d'étape).
  const [slide, setSlide] = useState({ i, dir: 0 });
  if (slide.i !== i) setSlide({ i, dir: i > slide.i ? 1 : -1 });
  const dir = slide.i === i ? slide.dir : 0;

  /* Lecture à voix haute de chaque étape, si elle est activée. */
  const [vs, setVoice] = useVoiceSettings();
  useEffect(() => {
    if (canSpeak && vs.readSteps) speak(stepScript(r, i));
  }, [i, vs.readSteps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  /* Garde l'écran allumé pendant qu'on cuisine, quand le navigateur le permet. */
  useEffect(() => {
    let lock;
    navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--color-accent-2-700)', color: 'var(--color-bg)', padding: wide ? '28px 40px' : '24px 24px 34px', paddingTop: `calc(${wide ? 28 : 12}px + var(--status-h))`, paddingBottom: 'max(34px, calc(14px + var(--bottom-safe)))', display: 'flex', gap: 40 }}>
      {wide && (
        <aside style={{ width: 300, flex: 'none', alignSelf: 'stretch', overflowY: 'auto', scrollbarWidth: 'none', borderRadius: 28, background: 'var(--color-accent-2-800)', padding: '22px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div className="h" style={{ fontSize: 22, marginBottom: 2 }}>Ingrédients</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-2-200)', marginBottom: 10 }}>{portionLabel(r, portions)}</div>
          {ingList(r, portions).map((it, k) => (
            <div key={k} style={{ display: 'flex', gap: 10, padding: '8px 0', fontSize: 15, borderBottom: '1px solid var(--color-accent-2-600)' }}>
              <span style={{ width: 72, flex: 'none', fontWeight: 700, color: 'var(--color-accent-2-200)' }}>{it.q}</span>
              <span>{it.n}</span>
            </div>
          ))}
        </aside>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Étape {i + 1} sur {n}</div>
        {canSpeak && (
          <>
            <button className="icon-btn" onClick={onVoice} aria-label="Réglages de lecture" style={{ background: 'transparent', color: 'var(--color-bg)' }}>
              <Icon d={SLIDERS} size={20} sw={2.4} />
            </button>
            <button className="reset press" onClick={() => setVoice({ readSteps: !vs.readSteps })} aria-pressed={vs.readSteps}
              aria-label={vs.readSteps ? 'Couper la lecture des étapes' : 'Lire les étapes à voix haute'}
              style={{ height: 44, padding: '0 14px 0 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
                background: vs.readSteps ? 'var(--color-bg)' : 'var(--color-accent-2-600)', color: vs.readSteps ? 'var(--color-accent-2-800)' : 'var(--color-bg)' }}>
              <Icon d={vs.readSteps ? SPEAKER : SPEAKER_OFF} size={18} sw={2.4} />{vs.readSteps ? 'Lecture' : 'Muet'}
            </button>
          </>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Fermer" style={{ background: 'var(--color-accent-2-600)', color: 'var(--color-bg)' }}>
          <CloseIcon />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {r.steps.map((_, k) => (
          <div key={k} style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-accent-2-500)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: k <= i ? '100%' : '0%', background: 'var(--color-bg)', transition: 'width .45s ease' }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-2-200)' }}>{r.name}</div>
      <TimerPills timers={others.map(t => (t.recipeId === r.id ? t : { ...t, short: t.recipeName }))} T={T} onOpen={onOpenTimer} dark />
      <div key={i} className={dir > 0 ? 'step-next' : dir < 0 ? 'step-prev' : 'screen'} style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
        <div className="h" style={{ fontSize: (long ? 72 : 96) * (wide ? 1.4 : 1), lineHeight: 0.9, color: 'var(--color-accent-2-400)' }}>{i + 1}</div>
        <div className="h" aria-live="polite" style={{ fontSize: wide ? (long ? 36 : 46) : (long ? 26 : 32), lineHeight: 1.15, textWrap: 'pretty', maxWidth: 820 }}>{r.steps[i]}</div>
        {canSpeak && vs.readSteps && (
          <button className="reset press" onClick={() => speak(stepScript(r, i))}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px 0 12px', borderRadius: 999, border: '2px solid var(--color-accent-2-400)', color: 'var(--color-bg)', fontSize: 14, fontWeight: 700 }}>
            <Icon d={SPEAKER} size={18} sw={2.4} />Relire l'étape
          </button>
        )}
        {durations.map((d, k) => (
          <StepTimer key={k} T={T} timer={T.timers.find(t => t.key === keyOf(k))}
            d={{ ...d, onStart: () => T.start(keyOf(k), d.sec, r.name + ', étape ' + (i + 1), { recipeId: r.id, recipeName: r.name, step: i, short: 'Étape ' + (i + 1) }) }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="reset" onClick={() => setStep(Math.max(0, i - 1))} disabled={i === 0}
          style={{ flex: 1, height: 58, borderRadius: 999, border: '2px solid var(--color-accent-2-400)', color: 'var(--color-bg)', fontFamily: 'var(--font-heading)', fontSize: 16, textAlign: 'center', opacity: i === 0 ? 0.4 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>
          Précédent
        </button>
        <button className="reset press" onClick={() => (last ? onDone() : setStep(i + 1))}
          style={{ flex: 1.4, height: 58, borderRadius: 999, background: 'var(--color-bg)', color: 'var(--color-accent-2-800)', fontFamily: 'var(--font-heading)', fontSize: 17, textAlign: 'center' }}>
          {last ? "C'est prêt" : 'Suivant'}
        </button>
      </div>
      </div>
    </div>
  );
}

/* ── feuilles modales ─────────────────────────────────── */
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'color-mix(in srgb, var(--color-neutral-900) 45%, transparent)', display: 'flex', alignItems: 'flex-end', animation: 'screen-in .15s ease-out' }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '88%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: '32px 32px 0 0', padding: '12px 22px', paddingBottom: 'max(24px, calc(12px + var(--bottom-safe)))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 5, borderRadius: 999, background: 'var(--color-neutral-300)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="h" style={{ fontSize: 22, margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CatsSheet({ r, cats: allCats, onAddCat, onClose, onSave }) {
  const [cats, setCatsState] = useState(r.cats);
  const toggle = c => setCatsState(v => (v.includes(c) ? v.filter(x => x !== c) : [...v, c]));
  return (
    <Sheet title="Catégories" onClose={onClose}>
      <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>{r.name}</div>
      <CatPicker cats={allCats} value={cats} onToggle={toggle} onAdd={onAddCat} />
      <button className="btn btn-primary" disabled={!cats.length} onClick={() => onSave(cats)} style={{ height: 50, fontSize: 16 }}>
        {cats.length ? 'Enregistrer' : 'Choisis au moins une catégorie'}
      </button>
    </Sheet>
  );
}

function ShareSheet({ r, portions, onClose, flash }) {
  const [img, setImg] = useState(null); // { blob, url }
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    let url, alive = true;
    renderRecipeCard(r, portions).then(blob => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setImg({ blob, url });
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [r, portions]);

  const send = async () => {
    if (!img) return;
    setBusy(true); setHint('');
    const filename = cardFilename(r);
    const file = new File([img.blob], filename, { type: 'image/png' });
    // 1. Partage natif du téléphone (app installée, navigateur mobile).
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: r.name });
        setBusy(false); onClose(); return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') { setBusy(false); return; }
    }
    // 2. Dans Claude : l'app iPhone ouvre le menu de partage, ailleurs le fichier est enregistré.
    const downloads = await getCapability('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: img.blob });
        setBusy(false); flash('Image prête à envoyer'); onClose(); return;
      } catch (e) {
        if (e?.code === 'declined') { setBusy(false); return; }
      }
    }
    setBusy(false);
    setHint("Appuie longuement sur l'image pour l'enregistrer ou la partager.");
  };

  return (
    <Sheet title="Partager la recette" onClose={onClose}>
      <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>
        Une image de la recette ({portionLabel(r, portions)}) à envoyer par WhatsApp, SMS ou mail.
      </div>
      <div style={{ borderRadius: 24, overflow: 'hidden', background: 'var(--color-neutral-200)', boxShadow: 'var(--shadow-md)', maxHeight: 360, overflowY: 'auto' }}>
        {img ? <img src={img.url} alt={'Fiche ' + r.name} style={{ width: '100%', display: 'block' }} />
          : <div style={{ height: 240, display: 'grid', placeItems: 'center', fontSize: 14 }} className="muted">Préparation de l'image…</div>}
      </div>
      {hint && <div role="status" style={{ fontSize: 14, fontWeight: 600 }}>{hint}</div>}
      <button className="btn btn-primary" disabled={!img || busy} onClick={send} style={{ height: 52, fontSize: 16 }}>
        {busy ? 'Un instant…' : "Envoyer l'image"}
      </button>
      {r.custom && (
        <button className="btn btn-secondary" onClick={async () => {
          const url = await recipeShareUrl(r);
          const res = await shareLink({ title: r.name, text: `Je t'envoie ma recette « ${r.name} ». Ouvre le lien pour l'ajouter à ton app Zéro Chichi :`, url });
          if (res === 'shared') onClose();
          else if (res === 'copied') { flash('Lien copié'); onClose(); }
          else if (res === 'failed') setHint("Partage impossible ici. Essaie depuis l'app installée.");
        }} style={{ height: 50, fontSize: 15, marginTop: -6 }}>
          Envoyer la recette à un ami
        </button>
      )}
      {!r.custom && (
        <button className="btn btn-secondary" onClick={async () => {
          const res = await shareLink({ title: r.name, text: r.name + ', une recette Zéro Chichi', url: recipeUrl(r) });
          if (res === 'shared') onClose();
          else if (res === 'copied') { flash('Lien copié'); onClose(); }
          else if (res === 'failed') setHint('Lien de la recette : ' + recipeUrl(r));
        }} style={{ height: 50, fontSize: 15, marginTop: -6 }}>
          Envoyer le lien de la recette
        </button>
      )}
      <div className="muted" style={{ fontSize: 12.5, marginTop: -4, textAlign: 'center' }}>
        {r.custom
          ? "Ton ami reçoit un lien pour l'ajouter à son app d'un geste." + (r.imgAsset || r.imgData ? ' Ta photo ne voyage pas avec le lien.' : '')
          : "Le lien ouvre la recette dans l'app, avec les minuteurs et la liste de courses."}
      </div>
    </Sheet>
  );
}

function AppShareSheet({ onClose, flash }) {
  const [hint, setHint] = useState('');
  const send = async () => {
    const res = await shareLink({ title: 'Zéro Chichi', text: 'Zéro Chichi, des recettes courtes. Rien de plus. Installe l\'app sur ton téléphone :', url: APP_URL });
    if (res === 'shared') onClose();
    else if (res === 'copied') { flash('Lien copié'); onClose(); }
    else if (res === 'failed') setHint('Copie ce lien : ' + APP_URL);
  };
  return (
    <Sheet title="Partager l'app" onClose={onClose}>
      <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>
        Envoie le lien à tes proches : ils pourront installer Zéro Chichi sur leur téléphone. Ou fais-leur scanner ce code.
      </div>
      <div style={{ alignSelf: 'center', padding: 14, borderRadius: 28, background: '#fff', boxShadow: 'var(--shadow-md)' }}>
        <QRCode text={APP_URL} size={176} label="QR code du lien de l'app" />
      </div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, userSelect: 'all' }}>{APP_URL_SHORT}</div>
      {hint && <div role="status" style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{hint}</div>}
      <button className="btn btn-primary" onClick={send} style={{ height: 52, fontSize: 16 }}>Envoyer le lien</button>
    </Sheet>
  );
}

function NewsItem({ it, onAction }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 24, background: 'var(--color-surface)' }}>
      <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 14, background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', display: 'grid', placeItems: 'center' }}>
        <Icon d={NEWS_ICONS[it.icon]} size={20} sw={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="h" style={{ fontSize: 16, lineHeight: 1.2 }}>{it.title}</div>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.4 }}>{it.text}</div>
        {it.action && onAction && (
          <button className="btn btn-ghost" onClick={() => onAction(it.action)} style={{ alignSelf: 'flex-start', marginTop: 4, marginLeft: -4, fontSize: 13.5, textDecoration: 'underline', textUnderlineOffset: 3 }}>Essayer</button>
        )}
      </div>
    </div>
  );
}

function NewsView({ recipes, wide, onBack, onOpen, onAction }) {
  const px = wide ? 40 : 22;
  return (
    <div className="screen" style={{ padding: `${wide ? 24 : 8}px ${px}px 32px`, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: wide ? 900 : undefined }}>
      <button className="icon-btn" onClick={onBack} aria-label="Retour" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><BackIcon size={24} /></button>
      <div>
        <h1 className="h" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>Nouveautés</h1>
        <div className="muted" style={{ fontSize: 13 }}>Ce qui a changé dans Zéro Chichi</div>
      </div>
      {NEWS.map(n => {
        return (
          <section key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="tag tag-accent" style={{ alignSelf: 'flex-start' }}>{fmtDate(n.date)}</span>
              <h2 className="h" style={{ fontSize: 24, margin: 0 }}>{n.title}</h2>
            </div>
            {n.groups.map(g => (
              <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>{g.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 10 }}>
                  {g.items.map(it => <NewsItem key={it.title} it={it} onAction={onAction} />)}
                </div>
              </div>
            ))}
            {n.fixes?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>Petites retouches</div>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14.5, lineHeight: 1.4 }}>
                  {n.fixes.map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function IncomingSheet({ r, existing, onAdd, onOpen, onClose }) {
  const [busy, setBusy] = useState(false);
  const shown = r.ing.slice(0, 4);
  return (
    <Sheet title="Une recette pour toi" onClose={onClose}>
      <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>On t'a envoyé une recette perso. Ajoute-la à ton app pour la retrouver, la cuisiner et la modifier.</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 10, borderRadius: 26, background: 'var(--color-surface)' }}>
        <div style={{ width: 84, height: 84, flex: 'none', borderRadius: 22, background: illus(r, 'accent-2'), backgroundOrigin: 'content-box', padding: 8 }} />
        <div style={{ minWidth: 0 }}>
          <div className="h" style={{ fontSize: 20, lineHeight: 1.15 }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{meta(r)} · {portionLabel(r, r.p)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((i, k) => (
          <div key={k} style={{ display: 'flex', gap: 12, padding: '7px 0', fontSize: 15, borderBottom: '1px solid var(--color-divider)' }}>
            <span style={{ width: 76, flex: 'none', fontWeight: 700, color: 'var(--color-accent-700)' }}>{ingList({ ...r, ing: [i] }, r.p)[0]?.q}</span>
            <span>{i[2]}</span>
          </div>
        ))}
        {r.ing.length > shown.length && <div className="muted" style={{ fontSize: 13, paddingTop: 8 }}>{(n => `et ${n} autre${n > 1 ? 's' : ''} ingrédient${n > 1 ? 's' : ''}`)(r.ing.length - shown.length)} · {plural(r.steps.length, 'étape')}</div>}
      </div>
      {existing ? (
        <>
          <div role="status" style={{ fontSize: 14, fontWeight: 600 }}>Cette recette est déjà dans tes recettes.</div>
          <button className="btn btn-primary" onClick={() => onOpen(existing)} style={{ height: 52, fontSize: 16 }}>Ouvrir la recette</button>
        </>
      ) : (
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onAdd(); setBusy(false); }} style={{ height: 52, fontSize: 16 }}>
          {busy ? 'Un instant…' : 'Ajouter à mes recettes'}
        </button>
      )}
      <button className="btn btn-ghost" onClick={onClose} style={{ alignSelf: 'center', fontSize: 14, marginTop: -6 }}>Non merci</button>
    </Sheet>
  );
}

const IOS_SHARE = ['M12 3v12', 'm8 7 4-4 4 4', 'M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1'];
const IOS_ADD = ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M12 8v8M8 12h8'];
const SIMS = [['ios-safari', 'iPhone · Safari'], ['ios-inapp', 'iPhone · WhatsApp, Insta…'], ['ios-other', 'iPhone · Chrome']];

/* Guide d'installation : sur iPhone, une page web ne peut pas s'ajouter seule à l'écran d'accueil. */
function InstallGuide({ onClose, flash }) {
  const [sim, setSim] = useState(INSTALL_PREVIEW ? 'ios-safari' : null);
  const platform = sim || installPlatform();
  const ipad = !sim && isIPad();
  const top = ipad || platform === 'ios-other'; // bouton Partager en haut (iPad, Chrome iPhone)
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  const copy = async () => { try { await navigator.clipboard.writeText(APP_URL); flash('Lien copié'); } catch { flash(APP_URL); } };

  const mock = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 14, background: '#F2F2F7', color: '#1C1C1E', fontSize: 15, fontFamily: '-apple-system, system-ui, sans-serif' };
  const Step = ({ n, children, visual }) => (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div className="h" style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-2-200)', color: 'var(--color-accent-2-800)', display: 'grid', placeItems: 'center', fontSize: 14 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        <div style={{ fontSize: 15.5, lineHeight: 1.4 }}>{children}</div>
        {visual}
      </div>
    </li>
  );
  let title, intro, steps, note;
  if (platform === 'ios-inapp') {
    title = 'Ouvre d’abord Safari';
    intro = 'Cette page est ouverte dans une autre app. L’ajout à l’écran d’accueil n’est possible que dans Safari.';
    steps = [
      <Step key={1} n={1} visual={<button className="btn btn-secondary" onClick={copy} style={{ alignSelf: 'flex-start', height: 40 }}>Copier le lien</button>}>Copie le lien de l'app.</Step>,
      <Step key={2} n={2}>Ouvre <b>Safari</b> et colle le lien dans la barre d'adresse.</Step>,
      <Step key={3} n={3}>Touche <b>Installer</b> sur la page qui s'ouvre, et laisse-toi guider.</Step>,
    ];
    note = <>Sinon, cherche dans le menu <b>•••</b> de cette app une option « Ouvrir dans Safari » ou « Ouvrir dans le navigateur ».</>;
  } else {
    title = 'Installer en 3 gestes';
    intro = 'Sur iPhone, l’app s’ajoute depuis le menu Partager de ton navigateur.';
    steps = [
      <Step key={1} n={1}>
        Touche le bouton <b>Partager</b> <span style={{ display: 'inline-grid', verticalAlign: '-5px', padding: 3, borderRadius: 8, background: '#F2F2F7', color: '#007AFF' }}><Icon d={IOS_SHARE} size={18} sw={2} /></span>, {top ? 'en haut de l’écran' : 'en bas de l’écran'}.
      </Step>,
      <Step key={2} n={2} visual={<div style={{ ...mock, justifyContent: 'space-between' }}><span>Sur l'écran d'accueil</span><Icon d={IOS_ADD} size={22} sw={1.8} /></div>}>
        Fais défiler et choisis <b>Sur l'écran d'accueil</b>.
      </Step>,
      <Step key={3} n={3}>
        Touche <b style={{ color: '#007AFF' }}>Ajouter</b>, en haut à droite. C'est fait !
      </Step>,
    ];
    note = platform === 'ios-safari'
      ? <>Pas de bouton Partager ? Touche d'abord <b>•••</b> à côté de l'adresse. Lien ouvert depuis WhatsApp ? Touche d'abord la <b>boussole</b> pour passer dans Safari.</>
      : <>Pas de bouton Partager ? Ouvre plutôt la page dans <b>Safari</b>.</>;
  }
  const arrow = platform.startsWith('ios') && platform !== 'ios-inapp';
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'color-mix(in srgb, var(--color-neutral-900) 55%, transparent)', display: 'flex', flexDirection: 'column', justifyContent: top ? 'flex-end' : 'flex-start', padding: 14, paddingTop: 'calc(14px + var(--status-h))', paddingBottom: 'calc(14px + var(--bottom-safe))', animation: 'screen-in .15s ease-out' }}>
      {arrow && top && <div className="install-arrow up" aria-hidden="true" style={{ position: 'absolute', top: 'calc(6px + var(--status-h))', right: ipad ? 90 : 18 }}>↑</div>}
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-bg)', borderRadius: 28, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '86%', overflowY: 'auto', maxWidth: 520, width: '100%', alignSelf: 'center', boxShadow: 'var(--shadow-lg)' }}>
        {INSTALL_PREVIEW && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, borderRadius: 14, border: '1px dashed var(--color-neutral-500)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, width: '100%', color: 'var(--color-neutral-700)' }}>APERÇU · téléphone simulé (absent de l'app publiée)</span>
            {SIMS.map(([k, l]) => <button key={k} className="reset" onClick={() => setSim(k)} style={{ fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 999, background: sim === k ? 'var(--color-text)' : 'var(--color-surface)', color: sim === k ? 'var(--color-bg)' : 'var(--color-text)' }}>{l}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={`${BASE}icon-192.png`} alt="" style={{ width: 40, height: 40, borderRadius: 10, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="h" style={{ fontSize: 21, margin: 0, lineHeight: 1.1 }}>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><CloseIcon /></button>
        </div>
        <div className="muted" style={{ fontSize: 14, marginTop: -6 }}>{intro}</div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>{steps}</ol>
        {note && <div style={{ fontSize: 13, lineHeight: 1.45, padding: '10px 12px', borderRadius: 16, background: 'var(--color-accent-100)' }}>{note}</div>}
        <button className="btn btn-primary" onClick={onClose} style={{ height: 48, fontSize: 15 }}>J'ai compris</button>
      </div>
      {arrow && !top && <div className="install-arrow" aria-hidden="true" style={{ alignSelf: 'center', marginTop: 'auto' }}>↓</div>}
    </div>
  );
}

function NewCatSheet({ onClose, onAdd }) {
  const [name, setName] = useState('');
  return (
    <Sheet title="Nouvelle catégorie" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) onAdd(name); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input id="new-cat-name" className="input" autoFocus value={name} maxLength={30} onChange={e => setName(e.target.value)}
          placeholder="Soupes, Petit-déjeuner, Fêtes…" style={{ height: 48, fontSize: 16 }} />
        <div className="muted" style={{ fontSize: 13 }}>Range ensuite tes recettes dedans avec le bouton « Catégories » de chaque fiche.</div>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()} style={{ height: 50, fontSize: 16 }}>Créer la catégorie</button>
      </form>
    </Sheet>
  );
}
