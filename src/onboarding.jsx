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

/* first : affichée d'office au premier lancement (bouton « Passer ») ; sinon ouverte depuis l'accueil (« Fermer »). */
export default function Onboarding({ first, onClose }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    track(first ? 'presentation-auto' : 'presentation-ouverte', first ? 'Présentation vidéo (1er lancement)' : 'Présentation vidéo (depuis l’accueil)');
    const v = ref.current;
    if (v) v.play().catch(() => setPaused(true)); // lecture automatique refusée : on attend un appui
    const onKey = e => { if (e.key === 'Escape') close('passee'); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Barre de progression fluide pendant la lecture.
  useEffect(() => {
    if (paused || ended) return;
    let raf;
    const tick = () => { const v = ref.current; if (v && v.duration) setProgress(v.currentTime / v.duration); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, ended]);

  const close = how => {
    const v = ref.current;
    if (how === 'passee') track('presentation-passee', 'Présentation passée à ' + Math.round(v?.currentTime || 0) + ' s');
    else track('presentation-terminee', 'Présentation regardée jusqu’au bout');
    v?.pause();
    onClose();
  };
  const toggle = () => {
    const v = ref.current;
    if (!v || ended) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
  };
  const replay = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0; setEnded(false); setPaused(false); setProgress(0);
    v.play().catch(() => setPaused(true));
  };

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Présentation de Zéro Chichi">
      <video ref={ref} src={ONBOARDING_VIDEO} poster={ONBOARDING_POSTER} muted playsInline preload="auto"
        onClick={toggle} onEnded={() => { setEnded(true); setProgress(1); }} />

      <div className="onboarding-top">
        <div className="onboarding-bar" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
        {!ended && (
          <button className="reset press onboarding-skip" onClick={() => close('passee')}>
            {first ? 'Passer' : 'Fermer'}
          </button>
        )}
      </div>

      {paused && !ended && (
        <button className="reset onboarding-play" onClick={toggle} aria-label="Lire la vidéo">
          <Svg d={PLAY} size={34} fill="currentColor" sw={0} />
        </button>
      )}

      {ended && (
        <div className="onboarding-end">
          <button className="btn btn-primary" onClick={() => close('terminee')} style={{ height: 56, fontSize: 17, width: '100%' }}>C'est parti</button>
          <button className="btn btn-ghost" onClick={replay} style={{ height: 44, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
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
