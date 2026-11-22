'use client';
// "Learn with me", woven (Nov 18, rebuilt at the learner's request). A panel rises by itself to 3/4 of the screen and
// learns the text with him phrase by phrase, the way a rebbi learns inside: a few words of the text, their English,
// and a short explanation woven in; "Go deeper" on any phrase opens more (Rashi, Tosafos, the sevara). Now and then, at a
// real turning point, one question with a hint, which he can answer. "Next ›" brings the next phrase (and at the end of a
// line, the next line); the line he is on is lit in the sefer above the panel.
// Made once per line and kept (app/api/weave), so it costs once, ever; the next line is prepared ahead of time.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '@/lib/back';
import { isHebText } from './AiNote';
import SugyaChart, { chartKept, loadChart, topicStartOf } from './SugyaChart';

// Nov 21: once he has opened the sugya chart, it stays "on" for the session: the chart of each new amud is drawn ahead
// of time, and when a new topic begins Learn with me says so (with the chart one tap away).
let chartUsed = false;

type Phrase = { he: string; en: string; note: string; ask?: string; hint?: string; before?: { kind: string; text: string } };
// Nov 18: a line is a row of steps: some phrases have something before their text (a challenge, a chakira, a kashya to
// hold, the scene), shown first, alone; Next then brings the text.
type Step = { k: number; part: 'before' | 'text' };
const stepsOf = (ps: Phrase[]): Step[] => ps.flatMap((p, k) => (p.before ? [{ k, part: 'before' as const }, { k, part: 'text' as const }] : [{ k, part: 'text' as const }]));
const BEFORE_LABEL: Record<string, string> = { think: 'Think first', chakira: 'A chakira', kashya: 'Hold this kashya', setup: 'Before we read' };
const got = new Map<string, Promise<{ phrases: Phrase[] }>>();
const weave = (ref: string, n: number) => {
  const d0 = typeof document !== 'undefined' ? document.documentElement.dataset : {} as DOMStringMap;
  const k = `${d0.ailang ?? 'en'}|${d0.lwtone ?? 'awake'}|${d0.lstyle ?? ''}|${ref}:${n}`;
  if (!got.has(k)) {
    const p = fetch(`/api/weave?ref=${encodeURIComponent(ref)}&n=${n}`).then((r) => r.json()).then((d) => { if (!d.phrases?.length) throw new Error(d.error || 'none'); return d as { phrases: Phrase[] }; });
    got.set(k, p); p.catch(() => got.delete(k));
  }
  return got.get(k)!;
};

// Nov 21: on the phone, the tap that follows a lifted finger after a drag can land on whatever is under it (with the
// card lowered, that is the Home button in the bar at the bottom, and it took him Home). After any drag of the card,
// stray taps are swallowed for a moment (the same fix as the panel's, Nov 19).
function eatTaps() {
  const eat = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
  window.addEventListener('click', eat, true);
  window.setTimeout(() => window.removeEventListener('click', eat, true), 450);
}

function Deeper({ refText, n, k }: { refText: string; n: number; k: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const go = () => {
    setOpen((v) => !v);
    if (text || open) return;
    setErr(false);
    fetch('/api/weave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refText, n, k }) })
      .then((r) => r.json()).then((d) => { if (d.text) setText(d.text); else setErr(true); }).catch(() => setErr(true));
  };
  const he = !!text && isHebText(text);
  return (
    <>
      <button className="lw-deeper" onClick={go}>{open ? 'Less ▴' : 'Go deeper ▾'}</button>
      {open && <div className={`lw-deep ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>{text ?? (err ? 'It couldn’t be written just now. Tap again.' : <span className="wait-dots"><span /><span /><span /></span>)}</div>}
    </>
  );
}

function Ask({ refText, n, q, hint }: { refText: string; n: number; q: string; hint?: string }) {
  const [showHint, setShowHint] = useState(false);
  const [ans, setAns] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const send = (reveal = false) => {
    if (!reveal && !ans.trim()) return;
    setReply('wait');
    fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `${refText}:${n}`, question: q, answer: ans, reveal }) })
      .then((r) => r.json()).then((d) => setReply(d.text || 'It couldn’t answer just now.')).catch(() => setReply('It couldn’t answer just now.'));
  };
  return (
    <div className="lw-ask">
      <div className="lw-ask-q"><span className="ai-star">✦</span> {q}</div>
      {showHint && hint && <div className="lw-ask-hint">{hint}</div>}
      {reply == null ? (
        <div className="lw-ask-row">
          <input value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Your answer…" onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
          <button className="lw-small" onClick={() => send()} disabled={!ans.trim()}>Answer</button>
          {hint && !showHint && <button className="lw-small" onClick={() => setShowHint(true)}>Hint</button>}
        </div>
      ) : null}
      {reply == null ? (
        <button className="lw-show-ans" onClick={() => send(true)}>Show the answer</button>
      ) : <div className="lw-ask-reply">{reply === 'wait' ? <span className="wait-dots"><span /><span /><span /></span> : reply}</div>}
    </div>
  );
}

export default function LearnWoven({ refText, total, start, lineEl, onNext, onVoice, onClose }: {
  refText: string; total: number; start: number;
  lineEl: (n: number) => HTMLElement | null;
  onNext?: () => void; onVoice?: () => void; onClose: () => void;
}) {
  useBackLayer(true, onClose);
  // Nov 18: drag the top edge to move it: up for bigger, down for smaller, and down from the smallest (or one long pull
  // down) takes it away. It follows the finger while dragging.
  const SIZES = [0.42, 0.82, 0.94];
  const [size, setSize] = useState(1);
  const [drag, setDrag] = useState(0);
  const y0 = useRef<number | null>(null);
  const grab = {
    onTouchStart: (e: React.TouchEvent) => { y0.current = e.touches[0].clientY; },
    onTouchMove: (e: React.TouchEvent) => { if (y0.current != null) setDrag(e.touches[0].clientY - y0.current); },
    onTouchEnd: (e: React.TouchEvent) => {
      const d = drag; y0.current = null; setDrag(0);
      if (d > 220 || (d > 50 && size === 0)) {
        // Nov 19: the phone's tap that follows the lifted finger would land on whatever is under it once the sheet is
        // gone (it took him Home). Stop it, and swallow any stray tap for a moment.
        if (e.cancelable) e.preventDefault();
        const eat = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        window.addEventListener('click', eat, true);
        window.setTimeout(() => window.removeEventListener('click', eat, true), 450);
        onClose(); return;
      }
      if (d > 50) setSize((v) => Math.max(0, v - 1));
      else if (d < -50) setSize((v) => Math.min(SIZES.length - 1, v + 1));
    },
  };
  const [n, setN] = useState(Math.min(Math.max(1, start), total));
  const [data, setData] = useState<{ n: number; phrases: Phrase[] } | null>(null);
  const [err, setErr] = useState(false);
  const [shown, setShown] = useState(1); // how many phrases of this line are out
  const [tick, setTick] = useState(0);
  const body = useRef<HTMLDivElement | null>(null);
  const done = n > total;
  const firstRef = useRef(refText);
  useEffect(() => { if (firstRef.current !== refText) { firstRef.current = refText; setN(Math.min(Math.max(1, start), total)); } }, [refText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done) return;
    let gone = false;
    setData(null); setErr(false); setShown(1);
    weave(refText, n).then((d) => { if (!gone) setData({ n, phrases: d.phrases }); }).catch(() => { if (!gone) setErr(true); });
    if (n < total) void weave(refText, n + 1).catch(() => {}); // the next line, ready ahead of time
    return () => { gone = true; };
  }, [refText, n, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const [chartOpen, setChartOpen] = useState(false);
  const [, setChartTick] = useState(0);
  useBackLayer(chartOpen, () => setChartOpen(false));
  const openChart = () => { chartUsed = true; setChartOpen(true); };
  useEffect(() => {
    if (!chartUsed || chartKept.has(refText)) return;
    let gone = false;
    loadChart(refText).then(() => { if (!gone) setChartTick((k) => k + 1); }).catch(() => {});
    return () => { gone = true; };
  }, [refText, chartOpen]);
  const chartTitle = /\d+[ab]$/.test(refText) ? 'Sugya chart' : /^Mishnah |^[A-Z][A-Za-z' ]+ \d+$/.test(refText) ? 'Perek chart' : 'Chart';
  const goLine = (l: number) => { setChartOpen(false); const to = Math.min(Math.max(1, l), total); if (to !== n) setN(to); };
  // A new topic begins on this line (only known once the chart is in hand): said on its first card.
  const newTopic = (() => {
    const cd = chartKept.get(refText);
    if (!cd || cd.topics.length < 2 || shown !== 1) return null;
    const ti = cd.topics.findIndex((t, i) => i > 0 && topicStartOf(t) === n);
    return ti > 0 ? { i: ti + 1, of: cd.topics.length, title: cd.topics[ti].title } : null;
  })();
  const topicChip = newTopic ? (
    <button className="lw-topic-chip" onClick={openChart}>
      <span>New topic {newTopic.i} of {newTopic.of}{newTopic.title ? ` · ${newTopic.title}` : ''}</span><b>🗺 Chart ›</b>
    </button>
  ) : null;
  const chart = chartOpen ? <SugyaChart refText={refText} title={chartTitle} here={Math.min(n, total)} total={total} onGo={goLine} onClose={() => setChartOpen(false)} /> : null;

  // The line he is on, lit in the sefer and brought up into the space above the panel.
  useEffect(() => {
    if (done) return;
    const el = lineEl(n);
    if (!el) return;
    el.classList.add('lwm-on');
    const t = window.setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    return () => { window.clearTimeout(t); el.classList.remove('lwm-on'); };
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.body.classList.add('lw-open'); return () => document.body.classList.remove('lw-open'); }, []);

  // A new phrase comes in near the top, with the end of the one before still in view above it.
  useEffect(() => {
    const box = body.current;
    if (!box || shown <= 1) { box?.scrollTo({ top: 0 }); return; }
    const el = box.querySelector<HTMLElement>(`[data-ph="${shown - 1}"]`);
    if (el) box.scrollTo({ top: Math.max(0, el.offsetTop - 70), behavior: 'smooth' });
  }, [shown, data?.n]);

  const phrases = data?.n === n ? data.phrases : [];
  const steps = stepsOf(phrases);
  const atEnd = steps.length > 0 && shown >= steps.length;
  const next = () => {
    if (!atEnd) { setShown((v) => v + 1); return; }
    if (n >= total && onNext) { onNext(); return; } // straight on into the next amud, the panel stays open
    setN((v) => v + 1);
  };
  const back = () => { if (shown > 1) setShown((v) => v - 1); else if (n > 1) setN((v) => v - 1); };

  const renderStep = (st: Step, idx: number) => {
    const p = phrases[st.k], k = st.k;
    if (st.part === 'before' && p.before) {
      const he = isHebText(p.before.text);
      return (
        <div key={`b${k}`} className="lw-before" data-ph={idx}>
          <span className="lw-before-label"><span className="ai-star">✦</span> {BEFORE_LABEL[p.before.kind] ?? 'Think first'}</span>
          <div dir={he ? 'rtl' : 'ltr'} className={he ? 'he-note' : ''}>{p.before.text}</div>
        </div>
      );
    }
    const heNote = isHebText(p.note);
    return (
      <div key={k} className="lw-ph" data-ph={idx}>
        <div className="lw-he" dir="rtl">{p.he}</div>
        {p.en && <div className="lw-en">{p.en}</div>}
        {p.note && <div className={`lw-note ${heNote ? 'he-note' : ''}`} dir={heNote ? 'rtl' : 'ltr'}>{p.note}</div>}
        <Deeper refText={refText} n={n} k={k} />
        {p.ask && <Ask refText={refText} n={n} q={p.ask} hint={p.hint} />}
      </div>
    );
  };

  // Nov 21: Cards (Settings → Learn with me looks like): one card at a time over the page; flick it off the screen
  // either way, or tap its ✕, and the next card rises up from the stack behind it.
  const cards = typeof document !== 'undefined' && document.documentElement.dataset.lwview === 'cards';
  const [dx, setDx] = useState(0);
  const [fly, setFly] = useState(0);
  const toss = (dir: number) => {
    if (fly) return;
    setFly(dir || 1);
    window.setTimeout(() => { setFly(0); setDx(0); next(); }, 230);
  };
  useEffect(() => {
    if (!cards) return;
    document.body.classList.add('lw-cards-open');
    return () => document.body.classList.remove('lw-cards-open');
  }, [cards]);

  // Nov 21 (2): the cards float: move them anywhere by their top bar, and size them by the corner. Kept for next time.
  type Geom = { x: number; y: number; w: number; h: number | null };
  const [geom, setGeom] = useState<Geom | null>(null);
  const live = useRef<Geom | null>(null);
  useEffect(() => {
    if (!cards) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let g: Geom | null = null;
    try { g = JSON.parse(localStorage.getItem('chavrusa-lwc-geom') || 'null'); } catch { g = null; }
    const w0 = Math.min(vw - 24, 560);
    const start: Geom = g && typeof g.x === 'number' ? g : { x: (vw - w0) / 2, y: Math.round(vh * 0.36), w: w0, h: null };
    const fit = fitIn(start);
    live.current = fit; setGeom(fit);
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  function fitIn(g: Geom): Geom {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(Math.max(g.w, 240), vw - 8);
    const h = g.h == null ? null : Math.min(Math.max(g.h, 160), vh - 80);
    // Nov 21 (4): the card stays centered across; it moves only up and down.
    return { w, h, x: Math.round((vw - w) / 2), y: Math.min(Math.max(g.y, 4), vh - 90) };
  }
  const keepGeom = () => { try { if (live.current) localStorage.setItem('chavrusa-lwc-geom', JSON.stringify(live.current)); } catch { /* not kept */ } };
  const handle = (kind: 'move' | 'size') => {
    let from: { px: number; py: number; g: Geom } | null = null;
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (kind === 'move' && (e.target as HTMLElement).closest('button')) return;
        const g = live.current; if (!g) return;
        e.preventDefault(); e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const card = (e.currentTarget as HTMLElement).closest('.lwc')?.querySelector<HTMLElement>('.lwc-card');
        from = { px: e.clientX, py: e.clientY, g: { ...g, h: g.h ?? (card?.offsetHeight ?? 320) } };
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!from) return;
        e.stopPropagation();
        const dx2 = e.clientX - from.px, dy2 = e.clientY - from.py;
        const g = kind === 'move'
          ? fitIn({ ...from.g, h: live.current?.h ?? null, y: from.g.y + dy2 })
          : fitIn({ ...from.g, w: from.g.w + 2 * dx2, h: (from.g.h ?? 320) + dy2 }); // centered, so it grows both ways
        live.current = g; setGeom(g);
      },
      onPointerUp: () => { if (from) { from = null; keepGeom(); eatTaps(); } },
      onPointerCancel: () => { if (from) { from = null; keepGeom(); } },
    };
  };
  const moveBy = useRef<ReturnType<typeof handle> | null>(null);
  const sizeBy = useRef<ReturnType<typeof handle> | null>(null);
  if (!moveBy.current) moveBy.current = handle('move');
  if (!sizeBy.current) sizeBy.current = handle('size');

  // Is the card's text longer than the card? Then an up/down drag on the text scrolls it rather than moving the card.
  const bodyEl = useRef<HTMLDivElement | null>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const b = bodyEl.current; if (!cards || !b) return;
    const check = () => setScrolls(b.scrollHeight > b.clientHeight + 4);
    check();
    const ro = new ResizeObserver(check); ro.observe(b);
    const mo = new MutationObserver(check); mo.observe(b, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [cards, n, shown]);
  // Nov 21 (4), at his request: back to the swipe as it was (a sideways swipe tilts the card and sends it off), and an
  // up/down drag on the card moves it up or down and it stays there. Nothing moves it sideways.
  const sw = useRef<{ x: number; y: number; lock?: 'h' | 'v'; inText: boolean; gy: number | null } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, button, a, .lwc-size')) return;
      sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, inText: !!(e.target as HTMLElement).closest('.lwc-body.scrolls'), gy: live.current?.y ?? null };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const g = sw.current; if (!g) return;
      const mx = e.touches[0].clientX - g.x, my = e.touches[0].clientY - g.y;
      if (!g.lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) g.lock = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (g.lock === 'h') setDx(mx);
      else if (g.lock === 'v' && !g.inText && g.gy != null && live.current) { // (long text scrolls instead)
        const ng = fitIn({ ...live.current, y: g.gy + my });
        live.current = ng; setGeom(ng);
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const g = sw.current; sw.current = null;
      if (g?.lock && !(g.lock === 'v' && g.inText)) { if (e.cancelable) e.preventDefault(); eatTaps(); } // it was a drag, not a tap
      if (g?.lock === 'h' && Math.abs(dx) > 80) toss(dx > 0 ? 1 : -1); else setDx(0);
      if (g?.lock === 'v' && !g.inText) keepGeom();
    },
    onTouchCancel: () => { const g = sw.current; sw.current = null; setDx(0); if (g?.lock === 'v' && !g.inText) keepGeom(); },
  };

  // Nov 21 (3): he can ask the chavrusa his own question right on the card. The answer comes on the card; then he
  // chooses: ask again (a follow-up, it remembers what was asked on this card) or go on to the next card.
  type QA = { q: string; a: string | null; bad?: boolean };
  const [thread, setThread] = useState<QA[]>([]);
  const [askOpen, setAskOpen] = useState(true);
  const [myQ, setMyQ] = useState('');
  const askInput = useRef<HTMLInputElement | null>(null);
  const cardKey = `${refText}|${n}|${shown}`;
  const cardNow = useRef(cardKey);
  cardNow.current = cardKey;
  useEffect(() => { setThread([]); setAskOpen(true); setMyQ(''); }, [cardKey]);
  const cardText = (st: Step | undefined) => {
    if (!st) return '';
    const p = phrases[st.k]; if (!p) return '';
    if (st.part === 'before' && p.before) return `(${BEFORE_LABEL[p.before.kind] ?? 'Think first'}) ${p.before.text}`;
    return [p.he, p.en, p.note, p.ask ? `(You asked him: ${p.ask})` : ''].filter(Boolean).join('\n');
  };
  const askNow = (st: Step | undefined) => {
    const q = myQ.trim(); if (!q) return;
    const key = cardKey;
    const before = thread.filter((x) => x.a && !x.bad).map((x) => ({ q: x.q, a: x.a as string }));
    setThread((t) => [...t, { q, a: null }]); setMyQ(''); setAskOpen(false);
    askInput.current?.blur();
    const put = (a: string, bad = false) => {
      if (cardNow.current !== key) return;
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a, bad } : x)));
    };
    fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `${refText}:${n}`, ask: q, card: cardText(st), thread: before }) })
      .then((r) => r.json()).then((d) => (d.text ? put(d.text) : put(d.error || 'It couldn’t answer just now.', true)))
      .catch(() => put('It couldn’t answer just now.', true));
  };
  useEffect(() => { // the newest answer is brought into view
    const b = bodyEl.current; if (!b || !thread.length) return;
    const last = b.querySelector<HTMLElement>('.lwc-qa:last-child');
    if (last) b.scrollTo({ top: Math.max(0, last.offsetTop - 12), behavior: 'smooth' });
  }, [thread]);

  // When the phone's keyboard comes up for his question, lift the card just enough that the box stays in sight.
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!cards) return;
    const vv = window.visualViewport;
    const fit = () => {
      const a = askInput.current;
      if (!vv || !a || document.activeElement !== a) { setLift(0); return; }
      setLift((cur) => {
        const r = a.getBoundingClientRect();
        const bottom = r.bottom + cur; // where it would be without the lift
        const see = vv.offsetTop + vv.height - 10;
        return Math.max(0, Math.min(bottom - see, (live.current?.y ?? 0) - 4));
      });
    };
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    document.addEventListener('focusin', fit); document.addEventListener('focusout', fit);
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); document.removeEventListener('focusin', fit); document.removeEventListener('focusout', fit); };
  }, [cards]);

  if (cards) {
    const cur = steps[shown - 1];
    const more = !done && (shown < steps.length || n < total);
    const moved = fly ? `translateX(${fly * 130}vw) rotate(${fly * 16}deg)` : `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const nextLabel = atEnd ? (n < total ? 'Next line' : onNext ? 'Next amud' : 'Finish') : 'Next';
    const waiting = thread.length > 0 && thread[thread.length - 1].a == null;
    const ready = !done && !err && phrases.length > 0 && !!cur;
    return <>{createPortal(
      <div className="lwc" role="dialog" aria-label="Learn with me" style={geom ? { left: geom.x, top: geom.y - lift, width: geom.w, transition: lift ? 'top .18s ease' : undefined } : { visibility: 'hidden' }}>
        <div className="lwc-top" {...moveBy.current}>
          <span className="lwc-grip" aria-hidden="true">⠿</span>
          <span className="lw-where">{done ? 'Done' : `Line ${n} of ${total}`}{document.documentElement.dataset.lwtonename ? <small className="lw-tone">{document.documentElement.dataset.lwtonename}</small> : null}</span>
          <span className="lw-bar"><span style={{ width: `${Math.min(100, ((Math.min(n, total) - 1 + (steps.length ? shown / steps.length : 0)) / total) * 100)}%` }} /></span>
          <button className="lw-icon" onClick={openChart} aria-label={chartTitle}>🗺</button>
          {onVoice && <button className="lw-icon" onClick={onVoice} aria-label="Learn by voice">🎙</button>}
          <button className="lwc-stop" onClick={onClose}>Stop</button>
        </div>
        <div className="lwc-stack">
          {more && <div className="lwc-under" aria-hidden="true" />}
          <div
            key={`${n}-${shown}`}
            className="lwc-card"
            style={{ height: geom?.h ?? undefined, maxHeight: geom?.h ? 'none' : undefined, transform: moved, transition: dx && !fly ? 'none' : 'transform .23s ease-out, opacity .23s', opacity: fly ? 0 : 1 }}
            {...swipe}
          >
            {/* Nov 21: the ✕ closes the cards (it used to bring the next card; a swipe does that) */}
            <button className="lwc-x" onClick={onClose} aria-label="Close">✕</button>
            <div className={`lwc-body${scrolls ? ' scrolls' : ''}`} ref={bodyEl}>
              {done ? (
                <div className="lw-done">
                  <p>Well learned! That’s the end of this {/^Mishnah /.test(refText) ? 'perek' : 'section'}.</p>
                  {onNext && <button className="lw-next" onClick={onNext}>On to the next ›</button>}
                </div>
              ) : err ? (
                <div className="muted">It couldn’t be prepared just now. <button className="linklike" onClick={() => setTick((k) => k + 1)}>Try again</button></div>
              ) : !phrases.length || !cur ? (
                <div className="muted"><span className="wait-dots"><span /><span /><span /></span> Preparing line {n}…</div>
              ) : <>{topicChip}{renderStep(cur, shown - 1)}</>}
              {ready && thread.length > 0 && (
                <div className="lwc-thread">
                  {thread.map((x, i) => {
                    const he = !!x.a && isHebText(x.a);
                    return (
                      <div key={i} className="lwc-qa">
                        <div className="lwc-myq" dir="auto">{x.q}</div>
                        <div className={`lwc-ans ${x.bad ? 'bad' : ''} ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>
                          <span className="ai-star">✦</span>{' '}
                          {x.a == null ? <span className="wait-dots"><span /><span /><span /></span> : x.a}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {ready && (
              <div className="lwc-foot">
                <button className="lwc-back" onClick={back} disabled={n === 1 && shown <= 1} aria-label="Back">‹ Back</button>
                {askOpen ? (
                  <form className="lwc-askrow" onSubmit={(e) => { e.preventDefault(); askNow(cur); }}>
                    <input
                      ref={askInput}
                      value={myQ}
                      onChange={(e) => setMyQ(e.target.value)}
                      placeholder={thread.length ? 'Ask a follow-up…' : 'Ask about this…'}
                      enterKeyHint="send"
                      dir="auto"
                    />
                    <button type="submit" className="lwc-asksend" disabled={!myQ.trim()} aria-label="Ask">Ask</button>
                  </form>
                ) : (
                  <div className="lwc-choose">
                    <button className="lwc-again" disabled={waiting} onClick={() => { setAskOpen(true); window.setTimeout(() => askInput.current?.focus(), 30); }}>Ask again</button>
                    <button className="lwc-go" onClick={() => toss(1)}>{nextLabel} ›</button>
                  </div>
                )}
              </div>
            )}
            <span className="lwc-size" aria-label="Drag to resize" role="separator" {...sizeBy.current} />
          </div>
        </div>
      </div>,
      document.body,
    )}{chart}</>;
  }

  return <>{createPortal(
    <div className="lw-sheet" role="dialog" aria-label="Learn with me" style={{ height: `calc(${SIZES[size] * 100}dvh - ${drag}px)`, transition: drag ? 'none' : 'height .22s ease' }}>
      <div className="lw-grab" aria-hidden="true" {...grab} />
      <div className="lw-head" {...grab}>
        <span className="lw-where">{done ? 'Done' : `Line ${n} of ${total}`}{typeof document !== 'undefined' && document.documentElement.dataset.lwtonename ? <small className="lw-tone">{document.documentElement.dataset.lwtonename}</small> : null}</span>
        <span className="lw-bar"><span style={{ width: `${Math.min(100, ((Math.min(n, total) - 1 + (steps.length ? shown / steps.length : 0)) / total) * 100)}%` }} /></span>
        <button className="lw-icon" onClick={openChart} aria-label={chartTitle}>🗺</button>
        {onVoice && <button className="lw-icon" onClick={onVoice} aria-label="Learn by voice">🎙</button>}
        <button className="lw-icon" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="lw-body" ref={body}>
        {done ? (
          <div className="lw-done">
            <p>Well learned! That’s the end of this {/^Mishnah /.test(refText) ? 'perek' : 'section'}.</p>
            {onNext && <button className="lw-next" onClick={onNext}>On to the next ›</button>}
          </div>
        ) : err ? (
          <div className="muted">It couldn’t be prepared just now. <button className="linklike" onClick={() => setTick((k) => k + 1)}>Try again</button></div>
        ) : !phrases.length ? (
          <div className="muted"><span className="wait-dots"><span /><span /><span /></span> Preparing line {n}…</div>
        ) : <>{topicChip}{steps.slice(0, shown).map((st, idx) => renderStep(st, idx))}</>}
        {!done && phrases.length > 0 && <div className="ai-note left">Explanations written by AI · AI makes mistakes · ask your rav</div>}
      </div>
      {!done && (
        <div className="lw-foot">
          <button className="lw-back" onClick={back} disabled={n === 1 && shown <= 1} aria-label="Back">‹</button>
          <button className="lw-next" onClick={next} disabled={!phrases.length}>{atEnd ? (n < total ? 'Next line ›' : onNext ? (/^Mishnah |^[A-Z][a-z]+ \d+$/.test(refText) && !/\d+[ab]$/.test(refText) ? 'Next perek ›' : 'Next amud ›') : 'Finish ›') : steps[shown - 1]?.part === 'before' ? 'Show the text ›' : 'Next ›'}</button>
        </div>
      )}
    </div>,
    document.body,
  )}{chart}</>;
}
