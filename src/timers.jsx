// Minuteurs du mode cuisine : plusieurs en parallèle, sonnerie et vibration à la fin.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtClock } from './lib.js';

const CLOCK = ['M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 9v4l2 2M10 2h4'];

export function useTimers(flash) {
  const [timers, setTimers] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef(null);

  const unlockAudio = () => {
    try {
      if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)();
      audio.current.resume?.();
    } catch { /* son indisponible */ }
  };

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    try {
      [0, 0.22, 0.44].forEach(d => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.18);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.2);
      });
    } catch { /* son indisponible */ }
    try { navigator.vibrate?.([300, 150, 300]); } catch { /* vibration indisponible */ }
  }, []);

  const running = timers.some(t => !t.paused && !t.done);
  const ringing = timers.some(t => t.done);

  // Horloge : une mise à jour par seconde tant qu'un minuteur tourne.
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [running]);

  // Fin d'un minuteur.
  useEffect(() => {
    const due = timers.filter(t => !t.paused && !t.done && t.endsAt <= now);
    if (!due.length) return;
    setTimers(ts => ts.map(t => (due.some(d => d.id === t.id) ? { ...t, done: true } : t)));
    flash('Minuteur terminé : ' + due[0].label);
  }, [now, timers, flash]);

  // Sonnerie répétée tant qu'on n'a pas validé (1 minute au plus).
  useEffect(() => {
    if (!ringing) return;
    beep();
    let n = 0;
    const i = setInterval(() => { if (++n > 24) clearInterval(i); else beep(); }, 2500);
    return () => clearInterval(i);
  }, [ringing, beep]);

  const start = (key, sec, label, meta) => {
    unlockAudio();
    const t0 = Date.now();
    setNow(t0);
    setTimers(ts => [...ts.filter(t => t.key !== key), { id: key + ':' + t0, key, label, total: sec * 1000, endsAt: t0 + sec * 1000, paused: false, left: 0, done: false, ...meta }]);
  };
  const update = (id, fn) => setTimers(ts => ts.map(t => (t.id === id ? fn(t) : t)));
  const pause = id => update(id, t => ({ ...t, paused: true, left: Math.max(0, t.endsAt - Date.now()) }));
  const resume = id => { unlockAudio(); setNow(Date.now()); update(id, t => ({ ...t, paused: false, endsAt: Date.now() + t.left })); };
  const addMinute = id => update(id, t => (t.paused ? { ...t, left: t.left + 60000, total: t.total + 60000 } : { ...t, endsAt: t.endsAt + 60000, total: t.total + 60000, done: false }));
  const stop = id => setTimers(ts => ts.filter(t => t.id !== id));
  const remaining = t => (t.done ? 0 : t.paused ? t.left : Math.max(0, t.endsAt - now));

  return { timers, remaining, start, pause, resume, addMinute, stop };
}

function Clock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CLOCK.map(d => <path key={d} d={d} />)}
    </svg>
  );
}

const roundBtn = { width: 40, height: 40, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 };

/** Le minuteur d'une étape, sur le fond vert du mode cuisine. */
export function StepTimer({ d, timer, T }) {
  if (!timer) {
    return (
      <button className="reset press" onClick={d.onStart}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 10, height: 48, padding: '0 20px 0 16px', borderRadius: 999, border: '2px solid var(--color-accent-2-400)', color: 'var(--color-bg)', fontSize: 15, fontWeight: 700 }}>
        <Clock size={20} />Minuteur {d.label}
        {d.upTo && <span style={{ fontWeight: 600, opacity: 0.75, fontSize: 13 }}>(jusqu'à {d.upTo})</span>}
      </button>
    );
  }
  const left = T.remaining(timer);
  const pct = timer.total ? 1 - left / timer.total : 1;
  return (
    <div role="timer" aria-live="off" aria-label={'Minuteur ' + d.label}
      style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 12px', borderRadius: 28, background: timer.done ? 'var(--color-accent)' : 'var(--color-bg)', color: 'var(--color-text)', animation: timer.done ? 'timer-pulse 1s ease-in-out infinite' : 'none' }}>
      {/* Anneau qui se vide pendant le décompte, puis se balance quand c'est fini. */}
      <svg className={timer.done ? 'ring-swing' : ''} width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style={{ flex: 'none' }}>
        <circle cx="26" cy="26" r="22" fill="none" stroke={timer.done ? 'var(--color-text)' : 'var(--color-accent-2-200)'} strokeWidth="6" />
        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-accent-2-600)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray="138.23" strokeDashoffset={(138.23 * pct).toFixed(2)} transform="rotate(-90 26 26)"
          style={{ transition: 'stroke-dashoffset .25s linear', opacity: timer.done ? 0 : 1 }} />
        {timer.done && <path d="M20 26l4 4 8-9" fill="none" stroke="var(--color-text)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="h" style={{ fontSize: 34, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{timer.done ? 'Terminé !' : fmtClock(left)}</div>
      </div>
      {timer.done ? (
        <button className="reset press" onClick={() => T.stop(timer.id)} style={{ height: 44, padding: '0 20px', borderRadius: 999, background: 'var(--color-text)', color: 'var(--color-bg)', fontWeight: 700 }}>OK</button>
      ) : (
        <>
          <button className="reset press" onClick={() => T.addMinute(timer.id)} aria-label="Ajouter une minute" style={{ ...roundBtn, background: 'var(--color-accent-2-200)' }}>+1</button>
          <button className="reset press" onClick={() => (timer.paused ? T.resume(timer.id) : T.pause(timer.id))} aria-label={timer.paused ? 'Reprendre' : 'Pause'} style={{ ...roundBtn, background: 'var(--color-accent-2-200)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{timer.paused ? <path d="M7 4.5v15l13-7.5z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}</svg>
          </button>
          <button className="reset press" onClick={() => T.stop(timer.id)} aria-label="Arrêter le minuteur" style={{ ...roundBtn, background: 'transparent' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </>
      )}
    </div>
  );
}

/** Les minuteurs des autres étapes, en petites pastilles. */
export function TimerPills({ timers, T, onOpen, dark }) {
  if (!timers.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: dark ? 'flex-start' : 'center' }}>
      {timers.map(t => (
        <button key={t.id} className="reset press" onClick={() => onOpen(t)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            background: t.done ? 'var(--color-accent)' : dark ? 'var(--color-accent-2-600)' : 'var(--color-text)',
            color: t.done ? 'var(--color-text)' : 'var(--color-bg)', boxShadow: dark ? 'none' : 'var(--shadow-md)',
            animation: t.done ? 'timer-pulse 1s ease-in-out infinite' : 'none' }}>
          <Clock size={15} />
          {t.short} · {t.done ? 'terminé' : (t.paused ? '⏸ ' : '') + fmtClock(T.remaining(t))}
        </button>
      ))}
    </div>
  );
}
