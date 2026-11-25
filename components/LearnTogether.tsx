'use client';
// Nov 25: new ways to learn together, on the Learn with me cards (the doc "new ways to learn together"):
// - FlowTag: a small tag for the line ("Abaye asks", "Answers line 4"), tap to see the step it answers.
// - LostBox: "I'm lost": only three things: the topic, the question on the table now, and how this line fits.
// - QuestionBack: a question he asked earlier (or a kashya he held) comes back where the Gemara answers it.
// - LineEnd, at the end of each line: What would you answer? (when the line asks), Let me say it over (teach it back),
//   and Got it / Shaky (shaky lines come back in Chazara).
// All of the flow comes from the sugya map (made once per amud and kept); only his answers cost a reply.
import { useEffect, useState } from 'react';
import { loadChart, chartKept, topicStartOf, labelOf, type ChartData, type ChartStep, type ChartTopic } from './SugyaChart';
import { isHebText } from './AiNote';
import { addOpenQ, closeOpenQ, lineMark, markLine, openQs, type OpenQ } from '@/lib/learnMarks';

const ANSWERS = new Set(['Answer', 'Proof', 'Rejection', 'Conclusion', 'Ruling']);
const SOLVES = new Set(['Answer', 'Proof', 'Conclusion', 'Ruling']);

export function useChartData(ref: string): ChartData | null {
  const [d, setD] = useState<ChartData | null>(chartKept.get(ref) ?? null);
  useEffect(() => {
    let gone = false;
    setD(chartKept.get(ref) ?? null);
    loadChart(ref).then((x) => { if (!gone) setD(x); }).catch(() => {});
    return () => { gone = true; };
  }, [ref]);
  return d;
}

export type Flow = { topic: ChartTopic; steps: ChartStep[]; here: ChartStep[]; on: ChartStep | null; answers: ChartStep | null; question: ChartStep | null; nextAnswer: ChartStep | null };
export function flowAt(d: ChartData | null, n: number): Flow | null {
  if (!d?.topics.length) return null;
  const topic = d.topics.reduce((k, t) => (topicStartOf(t) <= n ? t : k), d.topics[0]);
  const steps = [...topic.steps].sort((a, b) => a.line - b.line);
  const here = steps.filter((s) => s.line === n);
  const on = here[0] ?? steps.filter((s) => s.line <= n).pop() ?? null;
  const answers = on && ANSWERS.has(on.kind) ? [...steps.filter((s) => s.line < (on?.line ?? n))].reverse().find((s) => s.kind === 'Question') ?? null : null;
  const question = [...steps.filter((s) => s.line <= n)].reverse().find((s) => s.kind === 'Question') ?? null;
  const ask = here.find((s) => s.kind === 'Question') ?? null;
  const nextAnswer = ask ? steps.find((s) => s.line >= ask.line && steps.indexOf(s) > steps.indexOf(ask) && SOLVES.has(s.kind)) ?? null : null;
  return { topic, steps, here, on, answers, question: question ?? null, nextAnswer };
}

export function FlowTag({ refText, n }: { refText: string; n: number }) {
  const f = flowAt(useChartData(refText), n);
  const [open, setOpen] = useState(false);
  if (!f || !f.here.length) return null;
  const s = f.here[0];
  return (
    <div className="lt-flow">
      <span className={`lt-tag k-${s.kind}`}>{labelOf(s)}</span>
      {f.answers && f.answers.line !== n && (
        <button type="button" className="lt-to" onClick={() => setOpen((v) => !v)}>{s.kind === 'Rejection' ? 'pushes off' : 'answers'} line {f.answers.line} {open ? '▴' : '▾'}</button>
      )}
      {open && f.answers && <span className="lt-back"><b>{labelOf(f.answers)} (line {f.answers.line}):</b> {f.answers.summary}</span>}
    </div>
  );
}

export function LostBox({ refText, n, onClose }: { refText: string; n: number; onClose: () => void }) {
  const d = useChartData(refText);
  const f = flowAt(d, n);
  return (
    <div className="lt-lost" role="region" aria-label="I'm lost">
      <button type="button" className="lt-lost-x" onClick={onClose} aria-label="Close">✕</button>
      {!d ? <span className="muted"><span className="wait-dots"><span /><span /><span /></span> Finding where we are…</span> : !f ? <span className="muted">The map of this amud isn’t ready. Try again in a moment.</span> : (
        <>
          <p><b>What we’re discussing</b>{f.topic.title || 'This sugya'}{f.topic.intro ? `: ${f.topic.intro.replace(/\n+/g, ' ')}` : ''}</p>
          <p><b>The question on the table</b>{f.question ? `${labelOf(f.question)} (line ${f.question.line}): ${f.question.summary}` : 'No question yet: the Gemara is still laying it out.'}</p>
          <p><b>How this line fits</b>{f.on ? `${labelOf(f.on)}: ${f.on.summary}` : 'This line sets the stage.'}</p>
        </>
      )}
    </div>
  );
}

export function QuestionBack({ refText, n }: { refText: string; n: number }) {
  const f = flowAt(useChartData(refText), n);
  const [, setTick] = useState(0);
  if (!f || !f.here.some((s) => SOLVES.has(s.kind))) return null;
  const start = topicStartOf(f.topic);
  const q = openQs(refText).filter((x) => x.line < n && x.line >= start).pop();
  if (!q) return null;
  const done = (x: OpenQ) => { closeOpenQ(x); setTick((k) => k + 1); };
  return (
    <div className="lt-qback">
      <span className="lt-qback-label">{q.held ? `The kashya you held on line ${q.line}` : `Your question on line ${q.line}`}</span>
      <span className="lt-qback-q" dir="auto">“{q.q}”</span>
      <span className="lt-qback-ask">Is this where it’s answered?</span>
      <span className="lt-row">
        <button type="button" onClick={() => done(q)}>Yes, answered</button>
        <button type="button" className="ghost" onClick={() => setTick((k) => k + 1)}>Not yet</button>
        <button type="button" className="ghost" onClick={() => done(q)}>Let it go</button>
      </span>
    </div>
  );
}
export const keepQuestion = (ref: string, line: number, q: string, held = false) => addOpenQ({ ref, line, q, held });

const post = (body: object) => fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
function Reply({ text }: { text: string | null }) {
  if (text == null) return <span className="lt-reply"><span className="wait-dots"><span /><span /><span /></span></span>;
  const he = isHebText(text);
  return <span className={`lt-reply ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}><span className="ai-star">✦</span> {text}</span>;
}

function TryAnswer({ refText, n, f }: { refText: string; n: number; f: Flow }) {
  const ask = f.here.find((s) => s.kind === 'Question')!;
  const [mine, setMine] = useState('');
  const [reply, setReply] = useState<string | null | undefined>(undefined);
  const send = (dontKnow = false) => {
    const t = dontKnow ? "I don't know. Tell me." : mine.trim(); if (!t) return;
    setReply(null);
    post({ ref: `${refText}:${n}`, tryanswer: t, q: ask.summary, qline: ask.line, a: f.nextAnswer?.summary ?? '', aline: f.nextAnswer?.line ?? 0 })
      .then((d) => setReply(d.text || d.error || 'It couldn’t answer just now.')).catch(() => setReply('It couldn’t answer just now.'));
  };
  return (
    <div className="lt-box">
      <span className="lt-box-label">What would you answer?</span>
      <span className="lt-box-q">{labelOf(ask)}: {ask.summary}</span>
      {reply === undefined ? (
        <>
          <form className="lt-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Before you read on: how would you answer it?" rows={2} dir="auto" />
            <span className="lt-row"><button type="submit" disabled={!mine.trim()}>Answer</button><button type="button" className="ghost" onClick={() => send(true)}>Show me</button></span>
          </form>
        </>
      ) : <Reply text={reply} />}
    </div>
  );
}

function SayOver({ refText, n, card }: { refText: string; n: number; card: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState('');
  const [reply, setReply] = useState<string | null | undefined>(undefined);
  const send = () => {
    const t = mine.trim(); if (!t) return;
    setReply(null);
    post({ ref: `${refText}:${n}`, sayover: t, card }).then((d) => setReply(d.text || d.error || 'It couldn’t answer just now.')).catch(() => setReply('It couldn’t answer just now.'));
  };
  if (!open) return <button type="button" className="lt-pill" onClick={() => setOpen(true)}>🗣 Let me say it over</button>;
  return (
    <div className="lt-box">
      <span className="lt-box-label">Say it over</span>
      {reply === undefined ? (
        <form className="lt-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Say the line over in your own words (type, or tap the keyboard’s mic)…" rows={3} dir="auto" autoFocus />
          <span className="lt-row"><button type="submit" disabled={!mine.trim()}>Check me</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Not now</button></span>
        </form>
      ) : (
        <>
          <span className="lt-mine" dir="auto">{mine}</span>
          <Reply text={reply} />
          {reply && <button type="button" className="lt-pill" onClick={() => { setReply(undefined); }}>Try again</button>}
        </>
      )}
    </div>
  );
}

function Marks({ refText, n, text }: { refText: string; n: number; text: string }) {
  const [m, setM] = useState(() => lineMark(refText, n));
  useEffect(() => setM(lineMark(refText, n)), [refText, n]);
  const set = (v: 'got' | 'shaky') => { const nv = m === v ? null : v; markLine(refText, n, nv, text); setM(nv); };
  return (
    <span className="lt-marks" role="group" aria-label="How well do you have this line?">
      <button type="button" className={m === 'got' ? 'on got' : ''} onClick={() => set('got')}>✓ Got it</button>
      <button type="button" className={m === 'shaky' ? 'on shaky' : ''} onClick={() => set('shaky')}>〰 Shaky</button>
      {m === 'shaky' && <small>It will come back in Chazara</small>}
    </span>
  );
}

export function LineEnd({ refText, n, card, text }: { refText: string; n: number; card: string; text: string }) {
  const f = flowAt(useChartData(refText), n);
  const asks = !!f?.here.some((s) => s.kind === 'Question');
  return (
    <div className="lt-end" key={`${refText}:${n}`}>
      {asks && f && <TryAnswer refText={refText} n={n} f={f} />}
      <SayOver refText={refText} n={n} card={card} />
      <Marks refText={refText} n={n} text={text} />
    </div>
  );
}
