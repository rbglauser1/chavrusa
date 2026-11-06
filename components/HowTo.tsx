'use client';
// The how-to movie (see lib/howto.ts): scenes play one after another with a caption, like a short film.
// Tap ‹ › to move, the middle button to pause, ✕ to close. The last scene stays, with "Start learning".
import { useEffect, useRef, useState } from 'react';
import { HOWTO_SCENES, HOWTO_SEEN_KEY } from '@/lib/howto';

export function HowTo({ onClose, onStart }: { onClose: () => void; onStart?: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const leftRef = useRef(HOWTO_SCENES[0].dur * 1000); // ms left in this scene (kept across a pause)
  const shownI = useRef(0);
  const scene = HOWTO_SCENES[i];
  const last = i === HOWTO_SCENES.length - 1;

  useEffect(() => { try { localStorage.setItem(HOWTO_SEEN_KEY, '1'); } catch { /* ignore */ } }, []);
  // The clock: runs only while playing; a new scene starts it from the top; the scene moves on when it's up.
  useEffect(() => {
    if (shownI.current !== i) { shownI.current = i; leftRef.current = HOWTO_SCENES[i].dur * 1000; }
    if (paused || !HOWTO_SCENES[i].dur) return;
    const began = Date.now(), had = leftRef.current;
    const t = window.setTimeout(() => setI((n) => Math.min(n + 1, HOWTO_SCENES.length - 1)), had);
    return () => { window.clearTimeout(t); leftRef.current = Math.max(0, had - (Date.now() - began)); };
  }, [paused, i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, HOWTO_SCENES.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
      if (e.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const go = (n: number) => { setPaused(false); setI(Math.max(0, Math.min(n, HOWTO_SCENES.length - 1))); };

  return (
    <div className="ht" role="dialog" aria-modal="true" aria-label="How to use the app">
      <div className="ht-bars" aria-hidden="true">
        {HOWTO_SCENES.map((s, n) => (
          <span key={n} className={`ht-bar ${n < i ? 'done' : n === i ? 'now' : ''}`}>
            <i key={`${n}-${i}`} style={n === i && s.dur ? { animationDuration: `${s.dur}s`, animationPlayState: paused ? 'paused' : 'running' } : undefined} />
          </span>
        ))}
      </div>
      <button className="ht-x" onClick={onClose} aria-label="Close">×</button>

      <div className="ht-cap" key={`c${i}`}>
        <h2>{scene.caption}</h2>
        <p>{scene.sub}</p>
      </div>

      <div className={`ht-stage ${paused ? 'paused' : ''}`} onClick={() => !last && setPaused((p) => !p)}>
        <div key={i} className="ht-scene" dangerouslySetInnerHTML={{ __html: scene.html }} />
        {paused && <div className="ht-paused">Paused · tap to play</div>}
      </div>

      <div className="ht-ctrl">
        <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back">‹</button>
        {last ? (
          <>
            <button className="ht-again" onClick={() => go(0)}>Watch again</button>
            <button className="ht-start" onClick={() => { onClose(); onStart?.(); }}>Start learning</button>
          </>
        ) : (
          <button className="ht-play" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
        )}
        <button onClick={() => go(i + 1)} disabled={last} aria-label="Next">›</button>
      </div>
    </div>
  );
}

/** Whether the movie has been seen on this device (it opens by itself once, the first time). */
export function howToSeen(): boolean {
  try { return localStorage.getItem(HOWTO_SEEN_KEY) === '1'; } catch { return true; }
}
