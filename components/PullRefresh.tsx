'use client';
// Pull down to refresh, for the app saved to the home screen (it has no browser bar, so no reload button and no
// built-in pull-to-refresh). Pull down from the top of whatever is scrolled (the page, the chat) past the mark, and
// let go: the app reloads. Not in the Sefer, where pulling down at the top brings in the amud before. Not while pinching or zooming, nor in the full-screen daf.
import { useEffect, useRef, useState } from 'react';

const NEED = 90; // how far to pull (px) before letting go reloads

function scrollerAt(el: Element | null): Element | null {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const st = getComputedStyle(e);
    if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) return e;
  }
  return null;
}

export function PullRefresh() {
  const [pull, setPull] = useState(0);
  const start = useRef<{ y: number; x: number } | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return; // in the browser, Safari's own pull-to-refresh does it
    const down = (e: TouchEvent) => {
      start.current = null;
      if (e.touches.length !== 1 || document.body.dataset.dafull || document.querySelector('.ht, .daf-full')) return;
      const t = e.target as Element;
      // Not in the Sefer: pulling down at the top there brings in the amud before.
      if (t.closest('input, textarea, select, [contenteditable], .no-pull, .sefer-body, .min-text, .smap')) return;
      const sc = scrollerAt(t);
      if ((sc && sc.scrollTop > 0) || window.scrollY > 0) return;
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const move = (e: TouchEvent) => {
      if (!start.current || e.touches.length !== 1) { if (start.current) { start.current = null; setPull(0); } return; }
      const dy = e.touches[0].clientY - start.current.y, dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy) { setPull(0); return; }
      setPull(Math.min(dy * 0.6, NEED * 1.4));
    };
    const up = () => {
      if (start.current && pullRef.current >= NEED) { setPull(NEED); window.location.reload(); return; }
      start.current = null; setPull(0);
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    return () => {
      document.removeEventListener('touchstart', down); document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up); document.removeEventListener('touchcancel', up);
    };
  }, []);
  const pullRef = useRef(0);
  pullRef.current = pull;
  if (pull <= 4) return null;
  const ready = pull >= NEED;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${Math.min(pull, NEED) - 44}px)`, opacity: Math.min(1, pull / NEED) }} aria-hidden="true">
      <span className={`ptr-arrow ${ready ? 'ready' : ''}`}>↓</span>
      <span>{ready ? 'Let go to refresh' : 'Pull to refresh'}</span>
    </div>
  );
}
