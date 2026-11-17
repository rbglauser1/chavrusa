'use client';
// Focus help (Nov 16; Settings → Focus help), for learners who find it hard to get into the learning or stay in it
// (ADHD and anyone else). It works on the sefer's own lines ([data-line]) from outside, so the reading screen itself
// is unchanged:
//  - the line you're on: from a tap, the voice (the session's place), or, when you scroll, the line at the reading point;
//  - One line at a time: only that line clear, the rest faint; Next / Back below, or swipe sideways;
//  - Soft glow: that line gently lit (slow, no blinking; still for "reduce motion");
//  - Small wins: a quiet ✓ after each Step, every 5 lines, and at the end of the amud, with the days-in-a-row count;
//  - Where was I?: from the ✦, or offered by itself after 3 minutes away: a sentence or two on where you are.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Settings } from '@/lib/config';
import { cheer, markLearned, streak } from '@/lib/focus';

type Props = { settings: Settings; refText: string; total: number; focus?: number; picked: number | null };

const lineEl = (n: number) => document.querySelector<HTMLElement>(`.sefer-flow [data-line="${n}"]`);
const numbered = () => Array.from(document.querySelectorAll<HTMLElement>('.sefer-flow [data-line]')).filter((e) => /^\d+$/.test(e.dataset.line ?? ''));

export default function FocusHelp({ settings, refText, total, focus, picked }: Props) {
  const one = !!settings.oneLine, glow = !!settings.glowLine, wins = settings.wins !== false, where = settings.whereWasI !== false;
  const base = refText.replace(/:\d+(-\d+)?$/, '');
  const [cur, setCur] = useState<number | null>(null);
  const curRef = useRef<number | null>(null); curRef.current = cur;
  const [toast, setToast] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  const [recap, setRecap] = useState<{ n: number; text: string | null; err?: boolean } | null>(null);
  const best = useRef(0), sinceWin = useRef(0);

  // A minute of learning counts as a day learned (the days-in-a-row count).
  useEffect(() => { const t = window.setTimeout(() => markLearned(), 60_000); return () => window.clearTimeout(t); }, []);
  // A new amud: start over.
  useEffect(() => { best.current = 0; sinceWin.current = 0; setCur(null); setRecap(null); }, [base]);
  // The line you're on: the voice's place, or the line you tapped.
  useEffect(() => { if (focus) setCur(focus); }, [focus]);
  useEffect(() => { if (picked != null) setCur(picked + 1); }, [picked]);
  // A tap on a line makes it the line you're on (in One line at a time, a tap on a faint line too).
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.('.sefer-flow [data-line]') as HTMLElement | null;
      if (el && /^\d+$/.test(el.dataset.line ?? '')) setCur(Number(el.dataset.line));
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, []);
  // Scrolling (not in One line at a time): the line at the reading point becomes the line you're on, once the page stops.
  useEffect(() => {
    if (one) return;
    let t = 0;
    const settle = () => {
      const lines = numbered(); if (!lines.length) return;
      const point = window.innerHeight * 0.38;
      const at = lines.find((e) => { const r = e.getBoundingClientRect(); return r.top <= point && r.bottom >= point; })
        ?? lines.find((e) => e.getBoundingClientRect().top > point);
      if (!at) return;
      const n = Number(at.dataset.line);
      const c = curRef.current, ce = c ? lineEl(c) : null;
      const visible = ce ? (() => { const r = ce.getBoundingClientRect(); return r.bottom > 80 && r.top < window.innerHeight - 120; })() : false;
      if (!visible || (c != null && n > c)) setCur(n);
    };
    const onScroll = () => { window.clearTimeout(t); t = window.setTimeout(settle, 220); };
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('scroll', onScroll, true); window.clearTimeout(t); };
  }, [one]);

  // Mark the line on the page, and the modes on the page as a whole.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-fh-one', one);
    root.toggleAttribute('data-fh-glow', glow);
    return () => { root.removeAttribute('data-fh-one'); root.removeAttribute('data-fh-glow'); };
  }, [one, glow]);
  useEffect(() => {
    document.querySelectorAll('.fh-cur').forEach((e) => e.classList.remove('fh-cur'));
    if (cur == null) return;
    const mark = () => { document.querySelectorAll('.fh-cur').forEach((e) => e.classList.remove('fh-cur')); lineEl(cur)?.classList.add('fh-cur'); };
    mark(); const t = window.setTimeout(mark, 400); // the page may still be drawing
    return () => window.clearTimeout(t);
  }, [cur, base, one, glow]);
  // One line at a time starts on the line in view.
  useEffect(() => {
    if (!one || cur != null) return;
    const t = window.setTimeout(() => { const l = numbered().find((e) => e.getBoundingClientRect().bottom > 140); if (l) setCur(Number(l.dataset.line)); }, 500);
    return () => window.clearTimeout(t);
  }, [one, cur, base]);

  // Small wins: going forward to new lines.
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2800); };
  useEffect(() => {
    if (cur == null || cur <= best.current) return;
    const step = best.current > 0 && cur > best.current;
    const passed = cur - Math.max(best.current, 0);
    const prevBest = best.current;
    best.current = cur;
    if (!wins || prevBest === 0) return; // the first line you land on isn't a win yet
    const first = markLearned();
    const days = streak();
    const tail = first && days >= 2 ? ` · 🔥 ${days} days in a row` : '';
    const el = lineEl(cur);
    const newStep = !!el && (el.previousElementSibling as HTMLElement | null)?.classList.contains('move');
    sinceWin.current += passed;
    if (cur >= total) { sinceWin.current = 0; say(`✓ Finished ${base.replace('Berakhot', 'Berachos')} · ${cheer()}${tail}`); return; }
    if (newStep && step) { sinceWin.current = 0; say(`✓ Step done · ${cheer()}${tail}`); return; }
    if (sinceWin.current >= 5) { sinceWin.current = 0; say(`✓ 5 more lines · ${cheer()}${tail}`); return; }
    if (tail) say(`✓ Learning today${tail}`);
  }, [cur, wins, total, base]);

  // One line at a time: Next and Back, and a sideways swipe.
  const go = (d: number) => {
    const c = curRef.current ?? 1;
    const n = Math.max(1, Math.min(total, c + d));
    setCur(n);
    window.setTimeout(() => lineEl(n)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  };
  useEffect(() => {
    if (!one) return;
    let x0 = 0, y0 = 0;
    const start = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const end = (e: TouchEvent) => {
      if (!(e.target as Element).closest?.('.sefer-flow')) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchend', end); };
  }, [one, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where was I?
  const ask = (n?: number) => {
    const line = n ?? curRef.current ?? numbered().find((e) => e.getBoundingClientRect().bottom > 140)?.dataset.line;
    const k = Number(line) || 1;
    setOffer(false);
    setRecap({ n: k, text: null });
    fetch(`/api/recap?ref=${encodeURIComponent(`${base}:${k}`)}`).then((r) => r.json())
      .then((d) => setRecap((x) => (x && x.n === k ? { n: k, text: d.text || null, err: !d.text } : x)))
      .catch(() => setRecap((x) => (x && x.n === k ? { n: k, text: null, err: true } : x)));
  };
  useEffect(() => {
    const on = (e: Event) => ask((e as CustomEvent<number | undefined>).detail);
    window.addEventListener('chavrusa-where', on);
    return () => window.removeEventListener('chavrusa-where', on);
  }); // ask uses the line you're on now
  useEffect(() => {
    if (!where) return;
    let away = 0, t = 0;
    const vis = () => {
      if (document.visibilityState === 'hidden') { away = Date.now(); return; }
      if (away && Date.now() - away > 3 * 60_000) { setOffer(true); window.clearTimeout(t); t = window.setTimeout(() => setOffer(false), 25_000); }
      away = 0;
    };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); window.clearTimeout(t); };
  }, [where]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {one && <div className="fh-nav" role="group" aria-label="One line at a time">
        <button onClick={() => go(-1)} disabled={(cur ?? 1) <= 1} aria-label="Previous line">‹ Back</button>
        <span>Line {cur ?? '–'} of {total}</span>
        <button onClick={() => go(1)} disabled={(cur ?? 1) >= total} aria-label="Next line">Next ›</button>
      </div>}
      {toast && <div className="fh-toast" role="status">{toast}</div>}
      {offer && !recap && <button className="fh-offer" onClick={() => ask()}>↩ Where was I?</button>}
      {recap && <div className="fh-recap" role="dialog" aria-label="Where was I?">
        <div className="fh-recap-top"><b>↩ Where was I? · line {recap.n}</b><button onClick={() => setRecap(null)} aria-label="Close">✕</button></div>
        <p>{recap.text ?? (recap.err ? 'Couldn’t get it right now. Try again in a moment.' : 'Thinking…')}</p>
        {recap.text && <button className="fh-recap-go" onClick={() => { const n = recap.n; setRecap(null); setCur(n); lineEl(n)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>Take me to the line</button>}
        <div className="ai-note left">Written by AI · AI makes mistakes</div>
      </div>}
    </>,
    document.body,
  );
}
