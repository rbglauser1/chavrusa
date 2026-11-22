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

type Phrase = { he: string; en: string; note: string; ask?: string; hint?: string; before?: { kind: string; text: string } };
// Nov 18: a line is a row of steps: some phrases have something before their text (a challenge, a chakira, a kashya to
// hold, the scene), shown first, alone; Next then brings the text.
type Step = { k: number; part: 'before' | 'text' };
const stepsOf = (ps: Phrase[]): Step[] => ps.flatMap((p, k) => (p.before ? [{ k, part: 'before' as const }, { k, part: 'text' as const }] : [{ k, part: 'text' as const }]));
const BEFORE_LABEL: Record<string, string> = { think: 'Think first', chakira: 'A chakira', kashya: 'Hold this kashya', setup: 'Before we read' };
const got = new Map<string, Promise<{ phrases: Phrase[] }>>();
const weave = (ref: string, n: number) => {
  const d0 = typeof document !== 'undefined' ? document.documentElement.dataset : {} as DOMStringMap;
  const k = `${d0.ailang ?? 'en'}|${d0.lwtone ?? 'awake'}|${ref}:${n}`;
  if (!got.has(k)) {
    const p = fetch(`/api/weave?ref=${encodeURIComponent(ref)}&n=${n}`).then((r) => r.json()).then((d) => { if (!d.phrases?.length) throw new Error(d.error || 'none'); return d as { phrases: Phrase[] }; });
    got.set(k, p); p.catch(() => got.delete(k));
  }
  return got.get(k)!;
};

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

  // Nov 21: Cards (Settings → Learn with me looks like): one card at a time over the page; swipe it off the screen
  // either way, or tap its ✕, and the next card rises up from the stack behind it.
  const cards = typeof document !== 'undefined' && document.documentElement.dataset.lwview === 'cards';
  const [dx, setDx] = useState(0);
  const [fly, setFly] = useState(0);
  const sw = useRef<{ x: number; y: number; lock?: 'h' | 'v' } | null>(null);
  const toss = (dir: number) => {
    if (fly) return;
    setFly(dir || 1);
    window.setTimeout(() => { setFly(0); setDx(0); next(); }, 230);
  };
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, button, a')) return;
      sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const g = sw.current; if (!g) return;
      const mx = e.touches[0].clientX - g.x, my = e.touches[0].clientY - g.y;
      if (!g.lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) g.lock = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (g.lock === 'h') setDx(mx);
    },
    onTouchEnd: () => {
      const g = sw.current; sw.current = null;
      if (g?.lock === 'h' && Math.abs(dx) > 80) toss(dx > 0 ? 1 : -1); else setDx(0);
    },
  };
  useEffect(() => {
    if (!cards) return;
    document.body.classList.add('lw-cards-open');
    return () => document.body.classList.remove('lw-cards-open');
  }, [cards]);

  if (cards) {
    const cur = steps[shown - 1];
    const more = !done && (shown < steps.length || n < total);
    const moved = fly ? `translateX(${fly * 130}vw) rotate(${fly * 16}deg)` : `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const nextLabel = atEnd ? (n < total ? 'Next line' : onNext ? 'Next amud' : 'Finish') : 'Next';
    return createPortal(
      <div className="lwc" role="dialog" aria-label="Learn with me">
        <div className="lwc-top">
          <span className="lw-where">{done ? 'Done' : `Line ${n} of ${total}`}{document.documentElement.dataset.lwtonename ? <small className="lw-tone">{document.documentElement.dataset.lwtonename}</small> : null}</span>
          <span className="lw-bar"><span style={{ width: `${Math.min(100, ((Math.min(n, total) - 1 + (steps.length ? shown / steps.length : 0)) / total) * 100)}%` }} /></span>
          {onVoice && <button className="lw-icon" onClick={onVoice} aria-label="Learn by voice">🎙</button>}
          <button className="lwc-stop" onClick={onClose}>Stop</button>
        </div>
        <div className="lwc-stack">
          {more && <div className="lwc-under" aria-hidden="true" />}
          <div
            key={`${n}-${shown}`}
            className="lwc-card"
            style={{ transform: moved, transition: dx && !fly ? 'none' : 'transform .23s ease-out, opacity .23s', opacity: fly ? 0 : 1 }}
            {...swipe}
          >
            {!done && phrases.length > 0 && <button className="lwc-x" onClick={() => toss(1)} aria-label={nextLabel}>✕</button>}
            <div className="lwc-body">
              {done ? (
                <div className="lw-done">
                  <p>Well learned! That’s the end of this {/^Mishnah /.test(refText) ? 'perek' : 'section'}.</p>
                  {onNext && <button className="lw-next" onClick={onNext}>On to the next ›</button>}
                </div>
              ) : err ? (
                <div className="muted">It couldn’t be prepared just now. <button className="linklike" onClick={() => setTick((k) => k + 1)}>Try again</button></div>
              ) : !phrases.length || !cur ? (
                <div className="muted"><span className="wait-dots"><span /><span /><span /></span> Preparing line {n}…</div>
              ) : renderStep(cur, shown - 1)}
            </div>
            {!done && phrases.length > 0 && (
              <div className="lwc-foot">
                <button className="lwc-back" onClick={back} disabled={n === 1 && shown <= 1} aria-label="Back">‹ Back</button>
                <span className="lwc-hint">Swipe away or ✕ · {nextLabel.toLowerCase()}</span>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="lw-sheet" role="dialog" aria-label="Learn with me" style={{ height: `calc(${SIZES[size] * 100}dvh - ${drag}px)`, transition: drag ? 'none' : 'height .22s ease' }}>
      <div className="lw-grab" aria-hidden="true" {...grab} />
      <div className="lw-head" {...grab}>
        <span className="lw-where">{done ? 'Done' : `Line ${n} of ${total}`}{typeof document !== 'undefined' && document.documentElement.dataset.lwtonename ? <small className="lw-tone">{document.documentElement.dataset.lwtonename}</small> : null}</span>
        <span className="lw-bar"><span style={{ width: `${Math.min(100, ((Math.min(n, total) - 1 + (steps.length ? shown / steps.length : 0)) / total) * 100)}%` }} /></span>
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
        ) : steps.slice(0, shown).map((st, idx) => renderStep(st, idx))}
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
  );
}
