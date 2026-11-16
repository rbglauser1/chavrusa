'use client';
// "Learn with me" (the ✦; rebuilt Nov 15 at the learner's request: simpler, hand in hand with the sefer).
//   1. The opening: a short card that gets him into the sugya or sefer — the puzzle or big question, why it matters,
//      and one thing to watch for (app/api/guide/intro). "Let's learn ›".
//   2. Then the learning happens in the sefer itself: the line he's on lights up in the text (never shown again here),
//      and a slim strip at the bottom says in one sentence what this line is doing (app/api/guide/lines). Explain
//      opens the line's explanation in the strip. Next › moves the light down the sefer.
//   3. Every few lines, and at the turning points, the strip asks one question: answer it, "Show me", or just Next.
//   4. At the end: well learned, and on to the next section.
// The opening, the line guide and the explanations are each made once and kept.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Thinking from './Thinking';
import { WithSources } from './LineExtras';
import { useBackLayer } from '@/lib/back';
import { useSwipeDown } from '@/lib/swipeDown';
import { setVoiceGuide } from '@/lib/voiceGuide';

type Row = { n: number; where: string; ask: string; hint: string };

function useJson<T>(url: string | null): { data: T | null; err: boolean; retry: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let gone = false;
    setData(null); setErr(false);
    fetch(url).then((r) => r.json()).then((d) => { if (!gone) { if (d && !d.error) setData(d); else setErr(true); } }).catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [url, tick]);
  return { data, err, retry: () => setTick((n) => n + 1) };
}

// The explanations, shared on the device (Nov 15: "it shouldn't take more time to show the answer"): the line's
// explanation, and the next line's, start being made as soon as the line comes up, so Explain / Show me opens at once.
// One request per line, ever: the prefetch and the button use the same one.
type Explained = { text: string; sources: string[] };
const explained = new Map<string, Promise<Explained>>();
function getExplain(ref: string): Promise<Explained> {
  let p = explained.get(ref);
  if (!p) {
    p = fetch(`/api/explain?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => { if (!d?.text) throw new Error(d?.error || 'none'); return d as Explained; });
    explained.set(ref, p);
    p.catch(() => explained.delete(ref));
  }
  return p;
}

const Wait = () => <div className="muted"><span className="wait-dots"><span /><span /><span /></span><Thinking /></div>;

export default function LearnWithMe({ refText, total, start, lineEl, onNext, onClose, onVoice, onVoiceTalk }: {
  refText: string; total: number; start: number;         // start: the line to begin on (1-based)
  lineEl: (n: number) => HTMLElement | null;            // the line in the sefer, to light it up
  onNext?: () => void; onClose: () => void;
  onVoice?: () => void;                                 // the voice call leads instead (lib/voiceGuide)
  onVoiceTalk?: (n: number) => void;                    // an ordinary voice call (back and forth) from line n
}) {
  useBackLayer(true, onClose);
  const introSheet = useSwipeDown<HTMLDivElement>(onClose);
  const [phase, setPhase] = useState<'intro' | 'learn'>('intro');
  const [n, setN] = useState(Math.min(Math.max(1, start), total));
  const done = n > total;
  const enc = encodeURIComponent(refText);
  const intro = useJson<{ hook: string; watch: string }>(`/api/guide/intro?ref=${enc}`);
  const guide = useJson<{ lines: Row[] }>(`/api/guide/lines?ref=${enc}`); // starts during the opening
  const row = guide.data?.lines.find((r) => r.n === n) ?? null;
  const lineRef = `${refText}:${n}`;
  // Per line: the explanation open, the question's answer, the hint.
  const [xOpen, setXOpen] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');
  const [reply, setReply] = useState<string | null>(null); // the text, or 'wait' / 'err'
  const [hint, setHint] = useState(false);
  const [voicePick, setVoicePick] = useState(false); // the 🎙 in the strip: guided or back and forth, by voice
  // The explanation of this line (and the next one, ahead of time), started as soon as the line comes up.
  const [expl, setExpl] = useState<{ ref: string; data: Explained | null; err: boolean }>({ ref: '', data: null, err: false });
  const [xTry, setXTry] = useState(0);
  useEffect(() => {
    if (done) return;
    let gone = false;
    setExpl({ ref: lineRef, data: null, err: false });
    getExplain(lineRef).then((d) => { if (!gone) setExpl({ ref: lineRef, data: d, err: false }); }).catch(() => { if (!gone) setExpl({ ref: lineRef, data: null, err: true }); });
    if (n < total) void getExplain(`${refText}:${n + 1}`).catch(() => {});
    return () => { gone = true; };
  }, [lineRef, xTry]); // eslint-disable-line react-hooks/exhaustive-deps
  const explain = { data: expl.ref === lineRef ? expl.data : null, err: expl.ref === lineRef && expl.err, retry: () => setXTry((k) => k + 1) };

  // Light the line up in the sefer and bring it into view above the strip.
  useEffect(() => {
    setXOpen(false); setAnswering(false); setAnswer(''); setReply(null); setHint(false);
    if (phase !== 'learn' || done) return;
    const el = lineEl(n);
    if (!el) return;
    el.classList.add('lwm-on');
    const t = window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 40);
    return () => { window.clearTimeout(t); el.classList.remove('lwm-on'); };
  }, [n, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.body.classList.toggle('lwm-learning', phase === 'learn');
    return () => document.body.classList.remove('lwm-learning');
  }, [phase]);

  const send = () => {
    if (!row?.ask || !answer.trim()) return;
    setReply('wait');
    fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: lineRef, question: row.ask, answer }) })
      .then((r) => r.json()).then((d) => setReply(d.text ? d.text : 'err')).catch(() => setReply('err'));
  };
  const voice = onVoice ? () => { setVoiceGuide({ mode: 'ask', at: lineRef }); onClose(); onVoice(); } : undefined;
  const replied = reply && reply !== 'wait' && reply !== 'err' ? reply : null;

  if (typeof document === 'undefined') return null;

  if (phase === 'intro') {
    return createPortal(
      <div className="lwm-scrim" onClick={onClose}>
        <div ref={introSheet} className="lwm-intro" role="dialog" aria-label="Guided learning" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn lwm-x" onClick={onClose} aria-label="Close">✕</button>
          <div className="lwm-kicker">✦ Guided learning · before we start</div>
          {intro.data ? (
            <>
              <p className="lwm-hook" dir="auto">{intro.data.hook}</p>
              {intro.data.watch && <p className="lwm-watch" dir="auto"><b>Watch for:</b> {intro.data.watch}</p>}
            </>
          ) : intro.err ? (
            <p className="muted">The opening couldn’t be made just now. <button className="linklike" onClick={intro.retry}>Try again</button>, or just start.</p>
          ) : <Wait />}
          <div className="lwm-go">
            <button className="btn primary" onClick={() => setPhase('learn')}>Let’s learn ›</button>
            {voice && <button className="btn" onClick={voice}>🎙 Learn by voice</button>}
          </div>
          <div className="ai-note left">Written by AI · AI makes mistakes · check it inside</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="lwm-strip" role="region" aria-label="Guided learning">
      <div className="lwm-strip-top">
        <span className="lwm-count">{done ? 'Finished' : `Line ${n} of ${total}`}</span>
        <div className="lwm-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ((done ? total : n - 1) / Math.max(1, total)) * 100)}%` }} /></div>
        {(voice || onVoiceTalk) && !done && <button className="lwm-mic" onClick={() => setVoicePick((v) => !v)} aria-label="Switch to voice" aria-expanded={voicePick}>🎙</button>}
        <button className="icon-btn" onClick={onClose} aria-label="Stop learning with me">✕</button>
      </div>
      {voicePick && !done && (
        <div className="lwm-voice-pick">
          {voice && <button className="btn primary" onClick={voice}>🎙 Guided, by voice</button>}
          {onVoiceTalk && <button className="btn" onClick={() => { onClose(); onVoiceTalk(n); }}>🎙 Back and forth, by voice</button>}
          <small className="muted">From line {n}. The voice reads the text to you.</small>
        </div>
      )}
      <div className="lwm-strip-body">
        {done ? (
          <p className="lwm-where">Well learned! You finished this section.</p>
        ) : (
          <>
            {row ? <p className="lwm-where" dir="auto">{row.where}</p>
              : guide.err ? <p className="muted">The guide couldn’t be made. <button className="linklike" onClick={guide.retry}>Try again</button></p>
              : <Wait />}
            {row?.ask && (
              <div className="lwm-ask">
                <p dir="auto"><b>Think:</b> {row.ask}</p>
                {hint && row.hint && <p className="lwm-hint" dir="auto">💡 {row.hint}</p>}
                {replied ? <p className="lwm-reply" dir="auto">{replied}</p>
                  : answering ? (
                    <>
                      <textarea dir="auto" rows={2} value={answer} autoFocus onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer (or the keyboard’s mic)" />
                      <div className="lwm-row">
                        <button className="btn primary" disabled={!answer.trim() || reply === 'wait'} onClick={send}>{reply === 'wait' ? 'Reading…' : 'Send'}</button>
                        <button className="btn" onClick={() => setAnswering(false)}>Never mind</button>
                      </div>
                      {reply === 'err' && <p className="muted">That didn’t go through. Try again.</p>}
                    </>
                  ) : (
                    <div className="lwm-row">
                      <button className="btn" onClick={() => setAnswering(true)}>Answer</button>
                      {row.hint && !hint && <button className="btn" onClick={() => setHint(true)}>Hint</button>}
                      {!xOpen && <button className="btn" onClick={() => setXOpen(true)}>Show me</button>}
                    </div>
                  )}
              </div>
            )}
            {xOpen && (
              <div className="lwm-x-box">
                {explain.data ? <WithSources text={explain.data.text} sources={explain.data.sources ?? []} />
                  : explain.err ? <p className="muted">It couldn’t be made just now. <button className="linklike" onClick={explain.retry}>Try again</button></p>
                  : <Wait />}
              </div>
            )}
          </>
        )}
      </div>
      <div className="lwm-strip-nav">
        {done ? (
          <>
            <button className="btn" onClick={() => setN(1)}>Start again</button>
            {onNext ? <button className="btn primary" onClick={() => { onClose(); onNext(); }}>Next section ›</button> : <button className="btn primary" onClick={onClose}>Done</button>}
          </>
        ) : (
          <>
            <button className="btn lwm-back" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label="Back a line">‹</button>
            <button className="btn" onClick={() => setXOpen((v) => !v)}>{xOpen ? 'Hide' : '✦ Explain'}</button>
            <button className="btn primary" onClick={() => setN(n + 1)}>{n === total ? 'Finish' : 'Next ›'}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
