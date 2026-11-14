// Petites animations de l'app : cœur, confettis, glisser pour retirer, pastilles vers les courses.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lance un changement d'écran avec une transition « vignette → fiche » quand le navigateur sait le faire. */
export function withHeroTransition(thumbEl, change) {
  if (!thumbEl || reducedMotion() || typeof document.startViewTransition !== 'function') { change(); return; }
  thumbEl.style.viewTransitionName = 'zc-hero';
  const t = document.startViewTransition(() => { flushSync(change); });
  t.finished.finally(() => { if (thumbEl) thumbEl.style.viewTransitionName = ''; });
}
export const supportsHeroTransition = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

/* ── 1. Cœur qui bat ── */
const HEART = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
export function HeartButton({ fav, onToggle, className = 'icon-btn', size = 20 }) {
  const [burst, setBurst] = useState(0);
  return (
    <button className={className + ' heart-btn'} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={fav}
      onClick={e => { e.stopPropagation(); if (!fav) setBurst(Date.now()); onToggle(); }}>
      <svg key={burst} className={burst && fav ? 'heart-beat' : ''} width={size} height={size} viewBox="0 0 24 24" fill={fav ? 'var(--color-accent)' : 'none'}
        stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={HEART} /></svg>
      {burst > 0 && fav && Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <i key={burst + '-' + i} className="heart-spark" style={{ '--dx': Math.cos(a) * 26 + 'px', '--dy': Math.sin(a) * 26 + 'px' }} />;
      })}
    </button>
  );
}

/* ── 9. Confettis ── */
const CONF_COLORS = ['#F2A541', '#CFE3C4', '#1F3A2E', '#F8DDB4', '#587062'];
export function Confetti({ onEnd }) {
  const [pieces] = useState(() => Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100, color: CONF_COLORS[i % CONF_COLORS.length], dx: Math.random() * 90 - 45,
    r: Math.random() * 720 - 360, delay: Math.random() * 0.5, w: 6 + Math.random() * 4,
  })));
  const end = useRef(onEnd);
  useEffect(() => { end.current = onEnd; });
  useEffect(() => { const t = setTimeout(() => end.current(), 2300); return () => clearTimeout(t); }, []);
  if (reducedMotion()) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => <i key={i} style={{ left: p.left + '%', background: p.color, width: p.w, '--dx': p.dx + 'px', '--r': p.r + 'deg', animationDelay: p.delay + 's' }} />)}
    </div>
  );
}

/* ── 11. Glisser pour retirer ── */
export function Swipeable({ onRemove, label = 'Retirer', children, radius = 0 }) {
  const ref = useRef(null);
  const st = useRef({ x0: 0, y0: 0, dx: 0, active: false, moved: false, id: null });
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const width = () => ref.current?.offsetWidth || 300;

  const down = e => { if (e.pointerType === 'mouse' && e.button !== 0) return; st.current = { x0: e.clientX, y0: e.clientY, dx: 0, active: true, moved: false, id: e.pointerId }; };
  const move = e => {
    const s = st.current; if (!s.active) return;
    const ddx = e.clientX - s.x0, ddy = e.clientY - s.y0;
    if (!s.moved) {
      if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { s.active = false; return; } // défilement vertical
      if (Math.abs(ddx) < 10) return;
      s.moved = true; ref.current?.setPointerCapture?.(s.id);
    }
    s.dx = Math.min(0, ddx); setDx(s.dx);
  };
  const up = () => {
    const s = st.current; if (!s.active) return; s.active = false;
    if (s.moved && -s.dx > width() * 0.35) { setLeaving(true); setDx(-width()); setTimeout(onRemove, 260); }
    else setDx(0);
  };
  const clickCapture = e => { if (st.current.moved) { e.stopPropagation(); e.preventDefault(); st.current.moved = false; } };

  return (
    <div ref={ref} className={'swipe' + (leaving ? ' swipe-leave' : '')} style={{ borderRadius: radius }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={clickCapture}>
      <div className="swipe-under" style={{ borderRadius: radius, opacity: Math.min(1, -dx / 60) }}>{label}</div>
      <div className="swipe-over" style={{ transform: `translateX(${dx}px)`, transition: st.current.active ? 'none' : undefined }}>{children}</div>
    </div>
  );
}

/* ── 4. Pastilles qui filent vers une cible ── */
export function flyDots(fromEls, toEl, host) {
  if (!toEl || !host || reducedMotion()) return 0;
  const hr = host.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
  const x1 = tr.left - hr.left + tr.width / 2 - 6, y1 = tr.top - hr.top + tr.height / 2 - 6;
  const els = [...fromEls].filter(el => { const r = el.getBoundingClientRect(); return r.bottom > hr.top && r.top < hr.bottom; }).slice(0, 8);
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect(); const d = document.createElement('i'); d.className = 'fly-dot';
    const x0 = r.left - hr.left + 30, y0 = r.top - hr.top + r.height / 2 - 6;
    d.style.left = x0 + 'px'; d.style.top = y0 + 'px'; host.appendChild(d);
    d.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${(x1 - x0) / 2}px, ${(y1 - y0) / 2 - 50}px) scale(1.2)`, offset: 0.5 },
      { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.4)`, opacity: 0.5 },
    ], { duration: 650, delay: i * 70, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }).onfinish = () => d.remove();
  });
  return 650 + Math.max(0, els.length - 1) * 70;
}
