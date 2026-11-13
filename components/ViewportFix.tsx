'use client';
// iPhone: buttons pinned to the bottom of the screen (full-screen Talk, the amud counter) are placed against Safari's
// "layout" screen. After the keyboard, a zoom or a rotation, that can fall out of step with what you actually see, and
// the buttons then ride up the page as it scrolls. This measures the visible screen and keeps them at its bottom edge.
import { useEffect } from 'react';

export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const shift = Math.round(vv.offsetTop + vv.height - window.innerHeight);
        // Only while not zoomed in, and only a real gap (a pixel or two is just rounding).
        if (vv.scale < 1.05 && Math.abs(shift) > 2) root.style.setProperty('--vv-shift', `${shift}px`);
        else root.style.removeProperty('--vv-shift');
      });
    };
    fit();
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit, { passive: true }); window.addEventListener('orientationchange', fit);
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit); window.removeEventListener('orientationchange', fit); };
  }, []);
  return null;
}
