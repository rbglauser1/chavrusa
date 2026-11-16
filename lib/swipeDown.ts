'use client';
// Swipe a bottom sheet down to close it (Nov 16). Works when the sheet is scrolled to its top: drag down and the sheet
// follows the finger; let go past the mark and it closes, otherwise it springs back.
import { useEffect, useRef } from 'react';

const NEED = 90;

export function useSwipeDown<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let y0: number | null = null, x0 = 0, dy = 0, on = false;
    const set = (v: number, anim: boolean) => { el.style.transition = anim ? 'transform .2s ease' : 'none'; el.style.transform = v ? `translateY(${v}px)` : ''; };
    const down = (e: TouchEvent) => {
      y0 = null; dy = 0; on = false;
      if (e.touches.length !== 1 || el.scrollTop > 0) return;
      if ((e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    };
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (!on) {
        if (d < 6 && dx < 6) return;
        if (d <= 0 || dx > d || el.scrollTop > 0) { y0 = null; return; }
        on = true;
      }
      e.preventDefault(); // the sheet moves, not the page
      dy = Math.max(0, d);
      set(dy, false);
    };
    const up = () => {
      if (y0 === null || !on) { y0 = null; return; }
      y0 = null; on = false;
      if (dy >= NEED) { set(window.innerHeight, true); window.setTimeout(() => close.current(), 180); }
      else set(0, true);
      dy = 0;
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up);
    };
  });
  return ref;
}
