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

type Props = { settings: Settings; refText: string; total: number; focus?: number; picked: number | null; talkOn?: boolean };

// Text that is mostly Hebrew letters is set right to left, in the Hebrew font, a little larger.
const heCls = (t?: string | null) => (t && (t.match(/[\u0590-\u05FF]/g)?.length ?? 0) > (t.match(/[A-Za-z]/g)?.length ?? 0) ? 'fh-he' : undefined);
const lineEl = (n: number) => document.querySelector<HTMLElement>(`.sefer-flow [data-line="${n}"]`);
const numbered = () => Array.from(document.querySelectorAll<HTMLElement>('.sefer-flow [data-line]')).filter((e) => /^\d+$/.test(e.dataset.line ?? ''));

const GOAL_KEY = 'chavrusa-goal';
const dayKey = () => new Date().toLocaleDateString('en-CA');

export default function FocusHelp({ settings, refText, total, focus, picked, talkOn }: Props) {
  const quiet = !!settings.quietMode, bar = !!settings.amudBar, goal = settings.goal && settings.goal !== 'off' ? settings.goal : null;
  const along = !!settings.readAlong && !!talkOn; // in a call: the line the voice is on is lit and followed
  // "One line" from the Continue card (Nov 17): one line at a time for this visit only, with a ✕ to leave it.
  const [oneOnce, setOneOnce] = useState(false);
  useEffect(() => { try { setOneOnce(sessionStorage.getItem('chavrusa-oneline') === '1'); } catch { /* optional */ } }, []);
  const leaveOnce = () => { try { sessionStorage.removeItem('chavrusa-oneline'); } catch { /* optional */ } setOneOnce(false); };
  const one = !!settings.oneLine || oneOnce, glow = !!settings.glowLine || along, wins = settings.wins !== false, where = settings.whereWasI !== false;
  const base = refText.replace(/:\d+(-\d+)?$/, '');
  const [cur, setCur] = useState<number | null>(null);
  const curRef = useRef<number | null>(null); curRef.current = cur;
  const [toast, setToast] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  type Rc = { n: number; text: string | null; err?: boolean; words?: { line: number; phrase: string }[]; ask?: string };
  const [recap, setRecap] = useState<Rc | null>(null);
  const [lit, setLit] = useState<{ line: number; phrase: string }[] | null>(null);
  const best = useRef(0), sinceWin = useRef(0);

  // A minute of learning counts as a day learned (the days-in-a-row count).
  useEffect(() => { const t = window.setTimeout(() => markLearned(), 60_000); return () => window.clearTimeout(t); }, []);
  // Where you are, for "a question for next time" (components/LeaveQuestion.tsx).
  useEffect(() => {
    const line = cur ?? numbered().find((e) => e.getBoundingClientRect().bottom > 140)?.dataset.line;
    (window as unknown as { __chavrusaPlace?: { ref: string; line: number } }).__chavrusaPlace = { ref: base, line: Number(line) || 1 };
  }, [cur, base]);
  useEffect(() => () => { (window as unknown as { __chavrusaPlace?: unknown }).__chavrusaPlace = undefined; }, []);
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
    root.toggleAttribute('data-fh-quiet', quiet);
    return () => { root.removeAttribute('data-fh-one'); root.removeAttribute('data-fh-glow'); root.removeAttribute('data-fh-quiet'); };
  }, [one, glow, quiet]);
  // Read along: when the voice moves to a line, bring it to the middle of the screen.
  useEffect(() => {
    if (!along || !focus) return;
    const t = window.setTimeout(() => lineEl(focus)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
    return () => window.clearTimeout(t);
  }, [along, focus]);
  // Today's goal: so many new lines (or one Step) from where you started today. Kept for the day on this phone.
  const [goalDone, setGoalDone] = useState(false);
  const [goalCard, setGoalCard] = useState(false);
  const [goalAt, setGoalAt] = useState(0);
  const goalStart = useRef<number | null>(null), stepsSeen = useRef(0);
  useEffect(() => { try { setGoalDone(localStorage.getItem(GOAL_KEY) === `${dayKey()}|${goal}`); } catch { /* optional */ } goalStart.current = null; stepsSeen.current = 0; setGoalAt(0); }, [goal, base]);
  const goalN = goal === 'step' ? 1 : Number(goal) || 0;
  useEffect(() => {
    if (!goal || goalDone || cur == null) return;
    if (goalStart.current == null) { goalStart.current = cur; return; }
    if (cur <= goalStart.current + goalAt && goal !== 'step') return;
    let at = Math.max(0, cur - goalStart.current);
    if (goal === 'step') {
      const hasSteps = !!document.querySelector('.sefer-flow .move');
      if (hasSteps) { const el = lineEl(cur); if (cur > goalStart.current && (el?.previousElementSibling as HTMLElement | null)?.classList.contains('move')) stepsSeen.current = 1; at = stepsSeen.current; }
      else at = cur - goalStart.current >= 5 ? 1 : 0; // no Steps on this page: five lines stand for a Step
    }
    at = Math.min(at, goalN);
    if (at > goalAt) setGoalAt(at);
    if (at >= goalN) {
      setGoalDone(true);
      try { localStorage.setItem(GOAL_KEY, `${dayKey()}|${goal}`); } catch { /* optional */ }
      markLearned();
      setGoalCard(true);
    }
  }, [cur, goal, goalDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.querySelectorAll('.fh-cur').forEach((e) => e.classList.remove('fh-cur'));
    if (cur == null) return;
    const mark = () => { document.querySelectorAll('.fh-cur').forEach((e) => e.classList.remove('fh-cur')); lineEl(cur)?.classList.add('fh-cur'); };
    mark(); const t = window.setTimeout(mark, 400); // the page may still be drawing
    return () => window.clearTimeout(t);
  }, [cur, base, one, glow]);
  // One line at a time (and Quiet mode) starts on the line in view.
  useEffect(() => {
    if (!(one || quiet) || cur != null) return;
    const t = window.setTimeout(() => { const l = numbered().find((e) => e.getBoundingClientRect().bottom > 140); if (l) setCur(Number(l.dataset.line)); }, 500);
    return () => window.clearTimeout(t);
  }, [one, quiet, cur, base]);

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
    if (!one && !quiet) return;
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
  }, [one, quiet, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Teasers (Nov 17): pop-ups that draw you into the exact text, one at a time at natural moments. All of a page's
  // teasers come from one call, kept (app/api/teasers). Seen ones aren't shown again that day.
  type Tz = { line: number; kind: string; text: string; answer?: string; answerLine?: number; words?: string };
  const tzOn = settings.teasers !== false;
  const [tz, setTz] = useState<{ base: string; hook: string; items: Tz[] } | null>(null);
  const [tzShow, setTzShow] = useState<{ kind: string; line?: number; text: string; answer?: string; answerLine?: number; open?: boolean } | null>(null);
  const lastTz = useRef(0);
  const tzPrev = useRef<number | null>(null);
  const seenKey = (k: string) => `chavrusa-tz|${new Date().toLocaleDateString('en-CA')}|${base}|${k}`;
  const seen = (k: string) => { try { return localStorage.getItem(seenKey(k)) === '1'; } catch { return false; } };
  const markSeen = (k: string) => { try { localStorage.setItem(seenKey(k), '1'); } catch { /* optional */ } };
  useEffect(() => {
    setTz(null); setTzShow(null);
    if (!tzOn || !base) return;
    let off = false;
    fetch(`/api/teasers?ref=${encodeURIComponent(base)}`).then((r) => r.json()).then((d) => { if (!off) setTz({ base, hook: d.hook ?? '', items: Array.isArray(d.items) ? d.items : [] }); }).catch(() => {});
    return () => { off = true; };
  }, [base, tzOn]);
  // Before you start: the page's hook, once, soon after it opens (not over another card).
  useEffect(() => {
    if (!tz || tz.base !== base || !tz.hook || seen('hook')) return;
    const t = window.setTimeout(() => {
      if (document.querySelector('.five-done, .fh-recap')) return;
      markSeen('hook'); lastTz.current = Date.now();
      setTzShow({ kind: 'hook', text: tz.hook });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [tz, base]); // eslint-disable-line react-hooks/exhaustive-deps
  // On reaching a line with a teaser (going forward), at most one every 40 seconds.
  useEffect(() => {
    if (!tz || tz.base !== base || cur == null || tzShow || recap) return;
    if (Date.now() - lastTz.current < 40_000) return;
    // The teaser on this line, or else the nearest one on a line just passed over (scrolling skips lines).
    const from = Math.max(1, (tzPrev.current ?? cur) - 0), back = cur - 3;
    tzPrev.current = cur;
    const fresh = (x: Tz) => !seen(`${x.line}-${x.kind}`);
    const it = tz.items.find((x) => x.line === cur && fresh(x)) ?? [...tz.items].reverse().find((x) => x.line < cur && x.line >= Math.min(from, back) && fresh(x));
    if (!it) return;
    markSeen(`${it.line}-${it.kind}`); lastTz.current = Date.now();
    setTzShow({ kind: it.kind, line: it.line, text: it.text, answer: it.answer, answerLine: it.answerLine });
    if (it.words) setLit([{ line: it.line, phrase: it.words }]);
  }, [cur, tz, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const TZ_LABEL: Record<string, string> = { hook: 'Before you start', guess: 'What would you say?', notice: 'Did you notice?', rishon: 'A Rishon asks', practice: 'In practice today', change: 'What changed in the case?', rashi: 'What caught Rashi’s eye?' };

  // A question for next time, left last visit: shown beside its line when you come back.
  const lq = settings.leftQ && settings.leftQ.ref === base ? settings.leftQ : null;
  const [lqShown, setLqShown] = useState(false);
  useEffect(() => { setLqShown(false); }, [base]);
  useEffect(() => {
    if (!lq || lqShown) return;
    const t = window.setTimeout(() => { setLqShown(true); lineEl(lq.line)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setCur(lq.line); }, 900);
    return () => window.clearTimeout(t);
  }, [lq, lqShown]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lqClosed, setLqClosed] = useState(false);
  useEffect(() => { setLqClosed(false); }, [base]);

  // Where was I? lights up the words it's talking about, in the text itself (the browser's highlight, no change to the page).
  useEffect(() => {
    const H = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
    const HL = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!H || !HL) return;
    if (!lit?.length) { H.delete('fh-words'); return; }
    const ranges: Range[] = [];
    const NIK = /[\u0591-\u05C7]/;
    for (const w of lit) {
      const el = lineEl(w.line); if (!el) continue;
      const want = w.phrase.replace(/[\u0591-\u05C7]/g, '').replace(/[^\u05D0-\u05EA ]/g, '').replace(/\s+/g, ' ').trim();
      if (want.length < 2) continue;
      // The line's Hebrew letters, without vowels or punctuation, each remembered with where it sits.
      const map: { node: Text; i: number }[] = []; let flat = '';
      el.querySelectorAll('.he').forEach((he) => {
        const walk = document.createTreeWalker(he, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
          const v = t.data;
          for (let i = 0; i < v.length; i++) {
            const c = v[i];
            if (NIK.test(c)) continue;
            if (/[\u05D0-\u05EA]/.test(c)) { flat += c; map.push({ node: t, i }); }
            else if (/\s/.test(c) && !flat.endsWith(' ')) { flat += ' '; map.push({ node: t, i }); }
          }
        }
        if (!flat.endsWith(' ')) { flat += ' '; map.push(map[map.length - 1]); }
      });
      const at = flat.indexOf(want);
      if (at < 0) continue;
      const a = map[at], b = map[at + want.length - 1];
      if (!a || !b) continue;
      const r = document.createRange(); r.setStart(a.node, a.i); r.setEnd(b.node, b.i + 1);
      ranges.push(r);
    }
    if (ranges.length) H.set('fh-words', new HL(...ranges)); else H.delete('fh-words');
    return () => { H.delete('fh-words'); };
  }, [lit]);
  // The lit words stay after the card closes, until the next tap on the text.
  useEffect(() => { if (recap?.words?.length) setLit(recap.words); }, [recap]);
  useEffect(() => {
    if (!lit) return;
    const off = (e: MouseEvent) => { if ((e.target as Element).closest?.('.sefer-flow')) setLit(null); };
    const t = window.setTimeout(() => document.addEventListener('click', off, true), 600);
    return () => { window.clearTimeout(t); document.removeEventListener('click', off, true); };
  }, [lit]);
  // Where was I?
  const ask = (n?: number) => {
    const line = n ?? curRef.current ?? numbered().find((e) => e.getBoundingClientRect().bottom > 140)?.dataset.line;
    const k = Number(line) || 1;
    setOffer(false);
    setRecap({ n: k, text: null });
    fetch(`/api/recap?ref=${encodeURIComponent(`${base}:${k}`)}`).then((r) => r.json())
      .then((d) => setRecap((x) => (x && x.n === k ? { n: k, text: d.text || null, err: !d.text, words: d.words, ask: d.ask } : x)))
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
      {bar && <div className="fh-bar" role="progressbar" aria-label="How far through" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(best.current, cur ?? 0)}><i style={{ width: `${Math.min(100, (Math.max(best.current, cur ?? 0) / Math.max(1, total)) * 100)}%` }} /></div>}
      {goal && <div className={`fh-goal ${goalDone ? 'done' : ''}`}>🎯 {goalDone ? '✓' : goal === 'step' ? 'one Step' : `${goalAt}/${goalN}`}</div>}
      {(one || quiet) && <div className="fh-nav" role="group" aria-label="One line at a time">
        <button onClick={() => go(-1)} disabled={(cur ?? 1) <= 1} aria-label="Previous line">‹ Back</button>
        <span>Line {cur ?? '–'} of {total}</span>
        <button onClick={() => go(1)} disabled={(cur ?? 1) >= total} aria-label="Next line">Next ›</button>
        {oneOnce && !settings.oneLine && <button className="fh-nav-x" onClick={leaveOnce} aria-label="Back to the whole page">✕</button>}
      </div>}
      {toast && <div className="fh-toast" role="status">{toast}</div>}
      {lq && lqShown && !lqClosed && <div className="fh-recap fh-lq" role="dialog" aria-label="Your question from last time">
        <div className="fh-recap-top"><b>Your question from last time · line {lq.line}</b><button onClick={() => setLqClosed(true)} aria-label="Close">✕</button></div>
        <p dir="auto" className="fh-lq-text">“{lq.text}”</p>
        <div className="fh-tz-btns">
          <button className="fh-recap-go" onClick={() => setLqClosed(true)}>Let’s pick it up</button>
          <button className="fh-recap-go" onClick={() => { setLqClosed(true); window.dispatchEvent(new CustomEvent('chavrusa-settings', { detail: { leftQ: null } })); }}>Answered: clear it</button>
        </div>
      </div>}
      {tzShow && !(lq && lqShown && !lqClosed) && <div className="fh-recap fh-tz" role="dialog" aria-label={TZ_LABEL[tzShow.kind] ?? 'Something to think about'}>
        <div className="fh-recap-top"><b>✦ {TZ_LABEL[tzShow.kind] ?? 'Something to think about'}{tzShow.line ? ` · line ${tzShow.line}` : ''}</b><button onClick={() => { setTzShow(null); setLit(null); }} aria-label="Close">✕</button></div>
        <p dir="auto" className={heCls(tzShow.text)}>{tzShow.text}</p>
        {tzShow.kind === 'guess' && tzShow.open && tzShow.answer && <p dir="auto" className={`fh-recap-ask ${heCls(tzShow.answer) ?? ''}`}><b>The answer:</b> {tzShow.answer}</p>}
        <div className="fh-tz-btns">
          {tzShow.kind === 'guess' && !tzShow.open && <button className="fh-recap-go" onClick={() => setTzShow(null)}>Let me think</button>}
          {tzShow.kind === 'guess' && !tzShow.open && tzShow.answer && <button className="fh-recap-go" onClick={() => setTzShow((x) => (x ? { ...x, open: true } : x))}>Show the answer</button>}
          {tzShow.kind === 'guess' && tzShow.open && tzShow.answerLine && <button className="fh-recap-go" onClick={() => { const n = tzShow.answerLine!; setTzShow(null); setCur(n); lineEl(n)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>Go to it in the text</button>}
          {tzShow.kind !== 'guess' && <button className="fh-recap-go" onClick={() => setTzShow(null)}>{tzShow.kind === 'hook' ? 'Let’s see' : 'Got it'}</button>}
        </div>
        <div className="ai-note left">Written by AI · AI makes mistakes</div>
      </div>}
      {goalCard && <div className="five-done" role="dialog" aria-label="Goal reached">
        <div className="five-card">
          <div className="five-check">🎯</div>
          <h2>{goal === 'step' ? 'You finished this Step' : 'Today’s goal reached'}</h2>
          <p>{cheer()}. This is a good place to stop, and your place is kept.</p>
          <button className="five-main" onClick={() => setGoalCard(false)}>Keep learning</button>
          <button className="five-more" onClick={() => { setGoalCard(false); window.dispatchEvent(new Event('chavrusa-leave-q')); }}>Leave myself a question</button>
          <button className="five-stop" onClick={() => { setGoalCard(false); window.dispatchEvent(new Event('chavrusa-home')); }}>Stop here</button>
        </div>
      </div>}
      {offer && !recap && <button className="fh-offer" onClick={() => ask()}>↩ Where was I?</button>}
      {recap && <div className="fh-recap" role="dialog" aria-label="Where was I?">
        <div className="fh-recap-top"><b>↩ Where was I? · line {recap.n}</b><button onClick={() => setRecap(null)} aria-label="Close">✕</button></div>
        <p dir="auto" className={heCls(recap.text)}>{recap.text ?? (recap.err ? 'Couldn’t get it right now. Try again in a moment.' : 'Thinking…')}</p>
        {recap.text && recap.words?.length ? <p className="fh-recap-hint">The words it’s about are lit up in the text.</p> : null}
        {recap.ask && <p dir="auto" className={`fh-recap-ask ${heCls(recap.ask) ?? ''}`}><b>Think about it:</b> {recap.ask}</p>}
        {recap.text && <button className="fh-recap-go" onClick={() => { const n = recap.n; setRecap(null); setCur(n); lineEl(n)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>Take me to the line</button>}
        <div className="ai-note left">Written by AI · AI makes mistakes</div>
      </div>}
    </>,
    document.body,
  );
}
