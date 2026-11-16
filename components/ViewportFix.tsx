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
    // Nov 16: the app draws under the clock (black-translucent). On iOS 26 the screen it lays out against can then come
    // out shorter than the phone's screen, leaving a gap under everything pinned to the bottom. Measure how much is
    // missing and hand it to the page as --ios-gap; the bottom bar and buttons move down by it and full-height boxes
    // grow by it. Only when the page really is under the clock (a top safe area) and in portrait.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const gapFit = () => {
      const underClock = probe.getBoundingClientRect().height > 0;
      const portrait = window.innerHeight > window.innerWidth;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const gap = underClock && portrait && standalone && vv.scale < 1.05 && vv.height > window.innerHeight * 0.8 ? Math.round(screen.height - window.innerHeight) : 0;
      if (gap > 4 && gap < 200) root.style.setProperty('--ios-gap', `${gap}px`); else root.style.removeProperty('--ios-gap');
    };
    gapFit(); window.setTimeout(gapFit, 400);
    window.addEventListener('resize', gapFit); window.addEventListener('orientationchange', gapFit);
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit, { passive: true }); window.addEventListener('orientationchange', fit);
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit); window.removeEventListener('orientationchange', fit); };
  }, []);
  return null;
}
