// Présentation vidéo de l'app : plein écran au premier lancement, puis depuis la carte « Découvrir l'appli » de l'accueil.
import { useEffect, useRef, useState } from 'react';
import { track } from './stats.js';

export const ONBOARDING_VIDEO = 'assets/onboarding.mp4';
export const ONBOARDING_POSTER = 'assets/onboarding-poster.jpg';
export const ONBOARDING_LENGTH = 'en 45 secondes';

const PLAY = 'M7 4.5v15l12-7.5z';
const REPLAY = ['M3 12a9 9 0 1 0 3-6.7', 'M3 3v6h6'];

function Svg({ d, size = 22, sw = 2.75, fill = 'none' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/* Chapitres de la vidéo (début en secondes), comme des Stories : un segment de barre par chapitre. */
const CHAPTERS = [
  { t: 0, name: 'Bienvenue' },
  { t: 6.3, name: 'Recherche' },
  { t: 9.2, name: 'La recette' },
  { t: 14.35, name: 'Courses et cuisine' },
  { t: 26.0, name: 'Tes recettes perso' },
  { t: 36.5, name: 'Sur tablette' },
];
const chapterAt = t => { let i = 0; while (i + 1 < CHAPTERS.length && t >= CHAPTERS[i + 1].t - 0.05) i++; return i; };
const HOLD_MS = 220; // appui long : pause, comme sur Instagram

/* first : affichée d'office au premier lancement (bouton « Passer ») ; sinon ouverte depuis l'accueil (« Fermer »). */
export default function Onboarding({ first, onClose }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false); // lecture automatique refusée par le navigateur
  const [held, setHeld] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [hint, setHint] = useState(true);
  const press = useRef(null);
  const endedRef = useRef(false);
  endedRef.current = ended;

  useEffect(() => {
    track(first ? 'presentation-auto' : 'presentation-ouverte', first ? 'Présentation vidéo (1er lancement)' : 'Présentation vidéo (depuis l’accueil)');
    const v = ref.current;
    if (v) v.play().catch(() => setBlocked(true));
    const h = setTimeout(() => setHint(false), 4500);
    const onKey = e => {
      if (e.key === 'Escape') close('passee');
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === ' ') { e.preventDefault(); const vv = ref.current; if (vv) vv.paused ? vv.play().catch(() => {}) : vv.pause(); }
    };
    addEventListener('keydown', onKey);
    return () => { clearTimeout(h); removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Avancement fluide des segments.
  useEffect(() => {
    let raf;
    const tick = () => { const v = ref.current; if (v) setTime(v.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = how => {
    const v = ref.current;
    if (how === 'passee') track('presentation-passee', 'Présentation passée au chapitre ' + (chapterAt(v?.currentTime || 0) + 1) + ' (' + Math.round(v?.currentTime || 0) + ' s)');
    else track('presentation-terminee', 'Présentation regardée jusqu’au bout');
    v?.pause();
    onClose();
  };
  const seek = t => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = t; setTime(t); setEnded(false);
    v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };
  const step = dir => {
    const v = ref.current;
    if (!v) return;
    setHint(false);
    const t = v.currentTime, i = chapterAt(t);
    if (dir > 0) {
      if (i + 1 < CHAPTERS.length) seek(CHAPTERS[i + 1].t);
      else { v.currentTime = v.duration; v.pause(); setEnded(true); } // dernier chapitre : directement à la fin
    } else if (endedRef.current) seek(CHAPTERS[CHAPTERS.length - 1].t);
    else seek(t - CHAPTERS[i].t > 1.5 || i === 0 ? CHAPTERS[i].t : CHAPTERS[i - 1].t); // comme les Stories : d'abord le début du chapitre
  };

  // Toucher : côté gauche = chapitre précédent, ailleurs = suivant ; glisser aussi ; appui long = pause tant qu'on garde le doigt.
  const onDown = e => {
    if (ended) return;
    const x = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth;
    press.current = { x, cx: e.clientX, cy: e.clientY, timer: setTimeout(() => { press.current.hold = true; setHeld(true); ref.current?.pause(); }, HOLD_MS) };
  };
  const onUp = e => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.hold) { setHeld(false); ref.current?.play().catch(() => {}); return; }
    if (blocked) { seek(ref.current?.currentTime || 0); return; }
    // Glisser vers la gauche = chapitre suivant, vers la droite = précédent ; sinon simple toucher.
    const dx = e.clientX - p.cx, dy = e.clientY - p.cy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
    step(p.x < 0.3 ? -1 : 1);
  };
  const onCancel = () => { const p = press.current; press.current = null; if (p) { clearTimeout(p.timer); if (p.hold) { setHeld(false); ref.current?.play().catch(() => {}); } } };

  const dur = ref.current?.duration || 44.3;
  const cur = chapterAt(time);

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Présentation de Zéro Chichi">
      <video ref={ref} src={ONBOARDING_VIDEO} poster={ONBOARDING_POSTER} muted playsInline preload="auto"
        onEnded={() => setEnded(true)} />
      <div className="onboarding-touch" onPointerDown={onDown} onPointerMove={e => { const p = press.current; if (p && !p.hold && Math.abs(e.clientX - p.cx) > 12) clearTimeout(p.timer); }} onPointerUp={onUp} onPointerCancel={onCancel} onPointerLeave={onCancel}
        onContextMenu={e => e.preventDefault()} aria-hidden="true" />

      <div className={'onboarding-top' + (held ? ' dim' : '')}>
        <div className="onboarding-bars" role="progressbar" aria-label={'Chapitre ' + (cur + 1) + ' sur ' + CHAPTERS.length + ' : ' + CHAPTERS[cur].name}
          aria-valuemin={1} aria-valuemax={CHAPTERS.length} aria-valuenow={cur + 1}>
          {CHAPTERS.map((c, i) => {
            const a = c.t, b = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].t : dur;
            const k = ended ? 1 : Math.max(0, Math.min(1, (time - a) / (b - a)));
            return <span key={i}><i style={{ transform: `scaleX(${k})` }} /></span>;
          })}
        </div>
        <div className="onboarding-head">
          <span className="onboarding-chapter">{CHAPTERS[cur].name}</span>
          {!ended && (
            <button className="reset press onboarding-skip" onClick={() => close('passee')}>
              {first ? 'Passer' : 'Fermer'}
            </button>
          )}
        </div>
      </div>

      {hint && !blocked && !ended && <div className="onboarding-hint" aria-hidden="true">Touche ou glisse pour avancer · Appui long : pause</div>}

      {blocked && !ended && (
        <button className="reset onboarding-play" onClick={() => seek(ref.current?.currentTime || 0)} aria-label="Lire la vidéo">
          <Svg d={PLAY} size={34} fill="currentColor" sw={0} />
        </button>
      )}

      {ended && (
        <div className="onboarding-end">
          <button className="btn btn-primary" onClick={() => close('terminee')} style={{ height: 56, fontSize: 17, width: '100%' }}>C'est parti</button>
          <button className="btn btn-ghost" onClick={() => seek(0)} style={{ height: 44, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Svg d={REPLAY} size={18} sw={2.5} />Revoir la vidéo
          </button>
        </div>
      )}
    </div>
  );
}

/* Carte de l'accueil : ouvre la présentation ; la croix la masque (on la retrouve dans les nouveautés). */
export function DiscoverCard({ onOpen, onHide, wide }) {
  return (
    <div className="screen" style={{ position: 'relative', marginTop: wide ? -12 : -8 }}>
      <button className="reset press" onClick={onOpen}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 52px 10px 10px', borderRadius: 24, background: 'var(--color-accent-2-100)' }}>
        <span style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-2-700)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center' }}>
          <Svg d={PLAY} size={16} fill="currentColor" sw={0} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span className="h" style={{ fontSize: 16 }}>Découvrir l'appli</span>
          <span className="muted" style={{ fontSize: 12 }}>La visite guidée {ONBOARDING_LENGTH}</span>
        </span>
      </button>
      <button className="icon-btn" onClick={onHide} aria-label="Masquer la visite guidée"
        style={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)', width: 40, height: 40 }}>
        <Svg d="M18 6 6 18M6 6l12 12" size={16} />
      </button>
    </div>
  );
}
