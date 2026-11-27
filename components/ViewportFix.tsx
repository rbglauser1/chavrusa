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
    let raf = 0, touching = false, settleT = 0, againT = 0;
    // Nov 23: a shift found wrong (it put the buttons off the screen) is remembered and not tried again until the
    // screen really changes (the keyboard, a turn, a zoom): applying it and taking it back on every scroll made the
    // page counter at the bottom flash.
    let bad: { shift: number; h: number } | null = null;
    const pinned = () => document.querySelector<HTMLElement>('.st-full-ctl, .daf-dock .daf-bar, .min-full-ctl, .gl-full-controls');
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Nov 22: not while a finger is on the screen or the page is bouncing past its end (the iPhone reports a
        // stretched screen then, and the shift measured mid-bounce stuck and pushed the buttons off the screen; he had
        // auto-scroll on and pulled the page). Measured again once it settles.
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        if (touching || window.scrollY < -1 || window.scrollY > maxY + 1) { settleSoon(); return; }
        let shift = Math.round(vv.offsetTop + vv.height - window.innerHeight);
        if (bad && Math.abs(vv.height - bad.h) > 40) bad = null; // the screen really changed: measure afresh
        if (bad && Math.abs(shift - bad.shift) <= 4) shift = 0;
        // Only while not zoomed in, and only a real gap (a pixel or two is just rounding).
        if (vv.scale < 1.05 && Math.abs(shift) > 2) root.style.setProperty('--vv-shift', `${shift}px`);
        else root.style.removeProperty('--vv-shift');
        // And check it: a pinned button must end up on the screen that is seen. If the shift put it below (or above)
        // what is visible, the shift is wrong: drop it.
        if (root.style.getPropertyValue('--vv-shift')) {
          requestAnimationFrame(() => {
            const el = pinned(); if (!el) return;
            const r = el.getBoundingClientRect(), top = vv.offsetTop, bottom = vv.offsetTop + vv.height;
            // Nov 26: also when it put them far ABOVE the bottom (floating in the middle of the page, as in full screen
            // after the next amud came in): pinned buttons always sit at the bottom of what is seen.
            if (r.height && (r.bottom > bottom + 2 || r.top < top - 2 || r.bottom < bottom - 160)) { bad = { shift: Math.round(vv.offsetTop + vv.height - window.innerHeight), h: vv.height }; root.style.removeProperty('--vv-shift'); }
          });
        }
      });
    };
    const settleSoon = () => {
      window.clearTimeout(settleT); window.clearTimeout(againT);
      settleT = window.setTimeout(fit, 350);
      againT = window.setTimeout(fit, 1200);
    };
    const tStart = () => { touching = true; };
    const tEnd = () => { touching = false; settleSoon(); };
    document.addEventListener('touchstart', tStart, { passive: true });
    document.addEventListener('touchend', tEnd, { passive: true });
    document.addEventListener('touchcancel', tEnd, { passive: true });
    fit();
    // Nov 17, for two days only: the phone writes what it measures of the bottom row (where each button is, and why),
    // so a display bug on the iPhone can be found without guessing. Written only when something changed.
    let lastDiag = '';
    const diagT = window.setInterval(() => {
      if (Date.now() > Date.parse('2026-11-20T05:00:00Z') || !/iPhone|iPad/.test(navigator.userAgent)) return;
      const q = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), h: Math.round(r.height), pos: cs.position, disp: cs.display, vis: cs.visibility, op: cs.opacity, tr: cs.translate, z: cs.zIndex }; };
      const h = document.documentElement;
      const d = { at: new Date().toISOString(), path: location.pathname, ih: window.innerHeight, iw: window.innerWidth, vv: { h: Math.round(vv.height), top: Math.round(vv.offsetTop), sc: vv.scale }, shift: h.style.getPropertyValue('--vv-shift'), sy: Math.round(window.scrollY), sh: h.scrollHeight,
        attrs: [...h.attributes].map((a) => a.name).filter((n) => /full|fh-|tex|look/.test(n)).join(','), hideDaf: document.body.hasAttribute('data-hide-daf'),
        dock: q('.daf-dock'), bar: q('.daf-dock .daf-bar'), ctl: q('.st-full-ctl'), hub: q('.ai-hub-btn'), foot: q('.st-study-footer'), mg: !!document.querySelector('.daf-page'),
        // Nov 17: which English font the page asks for and whether the phone has it
        font: (() => { const e = document.querySelector('.line .en, .lib-item, .sg-title') as HTMLElement | null; const ff = e ? getComputedStyle(e).fontFamily : ''; const first = ff.split(',')[0]?.trim() ?? ''; let has = false; try { has = document.fonts.check(`16px ${first}`); } catch { /* */ } return { el: e?.className.slice(0, 30), ff: ff.slice(0, 80), body: h.style.getPropertyValue('--f-body').slice(0, 60), enfont: h.dataset.enfont, has, loaded: document.fonts.status }; })() };
      const key = JSON.stringify({ ...d, at: '' });
      if (key === lastDiag) return;
      lastDiag = key;
      fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diag: JSON.stringify(d) }) }).catch(() => {});
    }, 4000);
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    // Nov 26: a shift measured mid-change (the page grew or shrank as an amud came in or went) is checked again every
    // couple of seconds while one is set, so a stale one can't stay.
    const recheck = window.setInterval(() => { if (!touching && root.style.getPropertyValue('--vv-shift')) fit(); }, 2000);
    window.addEventListener('scroll', fit, { passive: true }); window.addEventListener('orientationchange', fit);
    return () => { window.clearInterval(diagT); window.clearInterval(recheck); cancelAnimationFrame(raf); window.clearTimeout(settleT); window.clearTimeout(againT); document.removeEventListener('touchstart', tStart); document.removeEventListener('touchend', tEnd); document.removeEventListener('touchcancel', tEnd); vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit); window.removeEventListener('orientationchange', fit); };
  }, []);
  return null;
}
