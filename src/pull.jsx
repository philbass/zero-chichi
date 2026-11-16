// Tirer pour actualiser : iPhone et iPad n'ont pas ce geste dans une app web (Android l'a déjà).
import { useEffect, useRef, useState } from 'react';
import { isIOS } from './share.jsx';

const THRESHOLD = 70;

/** Active le geste sur l'élément qui défile. Renvoie la distance tirée (0 au repos) et l'état. */
export function usePullToRefresh(ref, enabled) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const st = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !isIOS() || document.documentElement.classList.contains('embed')) return;
    const start = e => {
      if (el.scrollTop > 0 || e.touches.length !== 1) { st.current = null; return; }
      st.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, active: false };
    };
    const move = e => {
      const s = st.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y, dx = e.touches[0].clientX - s.x;
      if (!s.active) {
        if (dy < 8 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) { if (dy < 0 || Math.abs(dx) > 8) st.current = null; return; }
        s.active = true;
      }
      e.preventDefault();
      setPull(Math.min(120, (dy - 8) * 0.5));
    };
    const end = () => {
      const s = st.current; st.current = null;
      if (!s?.active) return;
      setPull(p => {
        if (p >= THRESHOLD * 0.75) {
          setRefreshing(true);
          Promise.resolve(navigator.serviceWorker?.getRegistration?.()).then(r => r?.update?.()).catch(() => {})
            .finally(() => setTimeout(() => location.reload(), 300));
          return 56;
        }
        return 0;
      });
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled]);
  return { pull, refreshing, ready: pull >= THRESHOLD * 0.75 };
}

/** Petit rond qui descend en haut de l'écran pendant le geste. */
export function PullIndicator({ pull, refreshing, ready }) {
  if (!pull && !refreshing) return null;
  return (
    <div aria-hidden={!refreshing} role={refreshing ? 'status' : undefined}
      style={{ position: 'absolute', left: '50%', top: 'calc(var(--status-h) + 6px)', zIndex: 35, transform: `translate(-50%, ${pull - 44}px)`, transition: st0(refreshing), pointerEvents: 'none' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-bg)', boxShadow: 'var(--shadow-md)', display: 'grid', placeItems: 'center', color: 'var(--color-accent-2-800)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          className={refreshing ? 'ptr-spin' : ''} style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)`, opacity: ready || refreshing ? 1 : 0.55 }}>
          <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
        </svg>
      </div>
      {refreshing && <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actualisation…</span>}
    </div>
  );
}
const st0 = r => (r ? 'transform .2s ease-out' : 'none');
