'use client';
// The continuous-scroll button (Quiet chat, beside Talk). Tap: start / stop. Press and hold: it grows into a
// speed picker; slide up for faster, down for slower, and let go to start at that speed. The speed is remembered.
import { useEffect, useRef, useState } from 'react';

const SPEEDS = 5;
function savedSpeed() { try { return Math.min(SPEEDS, Math.max(1, Number(localStorage.getItem('autoscroll-speed')) || 2)); } catch { return 2; } }

export default function AutoScroll() {
  const [on, setOn] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [picking, setPicking] = useState(false);
  const hold = useRef<{ timer: number; y: number; start: number; picked: boolean } | null>(null);
  useEffect(() => { setSpeed(savedSpeed()); }, []);
  // The text was touched (or the page changed): it stopped by itself.
  useEffect(() => {
    const off = () => setOn(false);
    window.addEventListener('chavrusa-autoscroll-stopped', off);
    return () => { window.removeEventListener('chavrusa-autoscroll-stopped', off); window.dispatchEvent(new CustomEvent('chavrusa-autoscroll', { detail: { speed: 0 } })); };
  }, []);
  const send = (v: number) => window.dispatchEvent(new CustomEvent('chavrusa-autoscroll', { detail: { speed: v } }));
  const start = (v: number) => { setOn(true); send(v); };
  const stop = () => { setOn(false); send(0); };

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const s0 = speed;
    hold.current = { y: e.clientY, start: s0, picked: false, timer: window.setTimeout(() => { if (hold.current) { hold.current.picked = true; setPicking(true); } }, 320) };
  }
  function move(e: React.PointerEvent) {
    const h = hold.current;
    if (!h?.picked) return;
    const v = Math.min(SPEEDS, Math.max(1, h.start + Math.round((h.y - e.clientY) / 26)));
    if (v !== speed) { setSpeed(v); try { navigator.vibrate?.(6); } catch { /* optional */ } }
  }
  function up() {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (h.picked) {
      setPicking(false);
      try { localStorage.setItem('autoscroll-speed', String(speed)); } catch { /* optional */ }
      start(speed);
      return;
    }
    if (on) stop(); else start(speed);
  }

  return (
    <div className={`ascroll ${on ? 'on' : ''} ${picking ? 'picking' : ''}`}>
      {picking && (
        <div className="ascroll-pick" aria-hidden="true">
          <span className="ascroll-word">Faster</span>
          {Array.from({ length: SPEEDS }, (_, k) => SPEEDS - k).map((v) => <span key={v} className={`ascroll-dot ${v <= speed ? 'lit' : ''} ${v === speed ? 'cur' : ''}`} />)}
          <span className="ascroll-word">Slower</span>
        </div>
      )}
      <button
        className="ascroll-btn"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={on ? 'Stop scrolling' : `Scroll the text continuously (speed ${speed}); press and hold to change the speed`}
        aria-pressed={on}
      >
        {on ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 6l5 5 5-5M7 13l5 5 5-5" /></svg>
        )}
        <span className="ascroll-n">{speed}</span>
      </button>
    </div>
  );
}
