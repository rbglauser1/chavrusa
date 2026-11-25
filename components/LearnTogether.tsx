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
import { watchVoice } from '@/lib/voiceClip';
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
      {s.kind === 'Rejection' && (() => { // What just fell: the answer that was just pushed off, and why, so he doesn't carry it forward
        const fell = [...f.steps.filter((x) => x.line < n || (x.line === n && x !== s))].reverse().find((x) => SOLVES.has(x.kind));
        return fell ? <span className="lt-fell"><b>✕ What just fell</b>{labelOf(fell)} (line {fell.line}): {fell.summary}<i>Why it falls: {s.summary}</i></span> : null;
      })()}
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

export function LineEnd({ refText, n, card, text, total }: { refText: string; n: number; card: string; text: string; total: number }) {
  const f = flowAt(useChartData(refText), n);
  const asks = !!f?.here.some((s) => s.kind === 'Question');
  // The end of a sugya (its last step), or of the amud: Choose a side and Put it to work.
  const end = !!f && ((f.steps.length > 0 && n >= Math.max(...f.steps.map((x) => x.line))) || n >= total);
  const from = f ? topicStartOf(f.topic) : 1;
  return (
    <div className="lt-end" key={`${refText}:${n}`}>
      {asks && f && <TryAnswer refText={refText} n={n} f={f} />}
      <SayOver refText={refText} n={n} card={card} />
      {end && <ChooseSide refText={refText} n={n} from={from} />}
      {end && <PutToWork refText={refText} n={n} from={from} />}
      <Marks refText={refText} n={n} text={text} />
    </div>
  );
}

// Choose a side: the two positions of the sugya; he argues one, the chavrusa the other; then how the Gemara settles it.
type Side = { who: string; holds: string };
function ChooseSide({ refText, n, from }: { refText: string; n: number; from: number }) {
  const [open, setOpen] = useState(false);
  const [sides, setSides] = useState<{ a: Side; b: Side; about?: string } | 'wait' | 'none' | null>(null);
  const [side, setSide] = useState<'a' | 'b' | null>(null);
  const [thread, setThread] = useState<{ me: string; you: string | null }[]>([]);
  const [msg, setMsg] = useState('');
  const [settle, setSettle] = useState<string | null | undefined>(undefined);
  const base = { ref: `${refText}:${n}`, from, to: n };
  const start = () => {
    setOpen(true); if (sides) return;
    setSides('wait');
    post({ ...base, work: 'sides' }).then((d) => setSides(d?.a?.holds && d?.b?.holds ? d : 'none')).catch(() => setSides('none'));
  };
  if (!open) return <button type="button" className="lt-pill" onClick={start}>⚖ Choose a side</button>;
  const sd = typeof sides === 'object' && sides ? sides : null;
  const said = (who: 'a' | 'b') => (sd ? { aWho: sd.a.who, aHolds: sd.a.holds, bWho: sd.b.who, bHolds: sd.b.holds, side: who } : {});
  const send = () => {
    const t = msg.trim(); if (!t || !side || !sd) return;
    const before = thread.filter((x) => x.you);
    setThread((x) => [...x, { me: t, you: null }]); setMsg('');
    post({ ...base, work: 'turn', msg: t, thread: before, ...said(side) })
      .then((d) => setThread((x) => x.map((y, i) => (i === x.length - 1 ? { ...y, you: d.text || d.error || 'It couldn’t answer just now.' } : y))))
      .catch(() => setThread((x) => x.map((y, i) => (i === x.length - 1 ? { ...y, you: 'It couldn’t answer just now.' } : y))));
  };
  const settleNow = () => {
    if (!sd || !side) return; setSettle(null);
    post({ ...base, work: 'settle', thread: thread.filter((x) => x.you), ...said(side) }).then((d) => setSettle(d.text || d.error || 'It couldn’t answer just now.')).catch(() => setSettle('It couldn’t answer just now.'));
  };
  return (
    <div className="lt-box">
      <span className="lt-box-label">⚖ Choose a side{sd?.about ? ` · ${sd.about}` : ''}</span>
      {sides === 'wait' && <span className="wait-dots"><span /><span /><span /></span>}
      {sides === 'none' && <span className="muted">This sugya doesn’t have two sides to argue. Try it at the end of a machlokes.</span>}
      {sd && !side && (
        <span className="lt-sides">
          {(['a', 'b'] as const).map((k) => <button key={k} type="button" onClick={() => setSide(k)}><b>{sd[k].who}</b>{sd[k].holds}</button>)}
        </span>
      )}
      {sd && side && (
        <>
          <span className="lt-mine">You argue {sd[side].who}: {sd[side].holds}. The chavrusa argues {sd[side === 'a' ? 'b' : 'a'].who}.</span>
          {thread.map((x, i) => <span key={i} className="lt-turn"><span className="lt-me" dir="auto">{x.me}</span><Reply text={x.you} /></span>)}
          {settle === undefined && (
            <form className="lt-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={thread.length ? 'Answer him…' : `Make your case for ${sd[side].who}…`} rows={2} dir="auto" />
              <span className="lt-row"><button type="submit" disabled={!msg.trim()}>Argue</button>{thread.some((x) => x.you) && <button type="button" className="ghost" onClick={settleNow}>How does the Gemara settle it?</button>}</span>
            </form>
          )}
          {settle !== undefined && <><span className="lt-box-label">How the Gemara settles it</span><Reply text={settle} /></>}
        </>
      )}
    </div>
  );
}

// Put it to work: a few everyday cases at the end of a sugya; he decides which side of the line each falls on.
type Case = { case: string; options: string[]; answer: number; why: string };
function PutToWork({ refText, n, from }: { refText: string; n: number; from: number }) {
  const [d, setD] = useState<{ rule?: string; cases: Case[] } | 'wait' | 'none' | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const start = () => {
    setD('wait');
    post({ ref: `${refText}:${n}`, work: 'cases', from, to: n })
      .then((x) => setD(Array.isArray(x?.cases) && x.cases.length ? { rule: x.rule, cases: x.cases.filter((c: Case) => c?.case && c.options?.length === 2) } : 'none')).catch(() => setD('none'));
  };
  if (!d) return <button type="button" className="lt-pill" onClick={start}>🧩 Put it to work</button>;
  return (
    <div className="lt-box">
      <span className="lt-box-label">🧩 Put it to work</span>
      {d === 'wait' && <span className="wait-dots"><span /><span /><span /></span>}
      {d === 'none' && <span className="muted">Couldn’t make cases for this sugya just now.</span>}
      {typeof d === 'object' && d.cases.map((c, i) => (
        <span key={i} className="lt-case">
          <span className="lt-case-q">{i + 1}. {c.case}</span>
          <span className="lt-row">{c.options.map((o, j) => (
            <button key={j} type="button" className={picked[i] === undefined ? 'ghost' : j === c.answer ? 'right' : picked[i] === j ? 'wrong' : 'ghost'} disabled={picked[i] !== undefined} onClick={() => setPicked((p) => ({ ...p, [i]: j }))}>{o}</button>
          ))}</span>
          {picked[i] !== undefined && <span className="lt-why">{picked[i] === c.answer ? 'Right. ' : 'Not quite. '}{c.why}</span>}
        </span>
      ))}
      {typeof d === 'object' && d.rule && Object.keys(picked).length === d.cases.length && <span className="lt-mine">The line the sugya drew: {d.rule}</span>}
      {typeof d === 'object' && <span className="ai-note left">Cases made by AI · for practice, ask your rav</span>}
    </div>
  );
}

// A two-minute preview of the amud before the first line: where it's going, from the sugya map (no new AI writing).
export function Preview({ refText }: { refText: string }) {
  const d = useChartData(refText);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  if (!d || !d.topics.length) return null;
  const words = [d.overview?.replace(/^[-•*]\s*/gm, '').replace(/\n+/g, ' '), ...d.topics.map((t, i) => `${d.topics.length > 1 ? `Part ${i + 1}: ` : ''}${t.title}${t.intro ? `. ${t.intro.replace(/\n+/g, ' ')}` : ''}`)].filter(Boolean) as string[];
  const hear = async () => {
    setPlaying(true);
    try {
      const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `A preview of ${refText}. ${words.join(' ')}` }) });
      if (!r.ok) { setPlaying(false); return; }
      const a = new Audio(URL.createObjectURL(await r.blob())); watchVoice(a); a.onended = () => setPlaying(false); await a.play();
    } catch { setPlaying(false); }
  };
  if (!open) return <button type="button" className="lw-topic-chip" onClick={() => setOpen(true)}><span>Before we start: where this amud is going</span><b>▶ Preview</b></button>;
  return (
    <div className="lt-box lt-preview">
      <span className="lt-box-label">Where this amud is going</span>
      {words.map((w, i) => <span key={i} className="lt-prev-line">{w}</span>)}
      <span className="lt-row"><button type="button" disabled={playing} onClick={() => void hear()}>{playing ? 'Playing…' : '🔊 Hear it'}</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button></span>
    </div>
  );
}

// One sentence per amud: at the end, he writes the whole sugya in one sentence; the chavrusa helps sharpen it; saved to
// the Notebook on the amud, so over time he has a line for every amud he learned.
export function OneSentence({ refText, total }: { refText: string; total: number }) {
  const [mine, setMine] = useState('');
  const [reply, setReply] = useState<string | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const sharper = reply ? (reply.match(/Sharper:\s*(.+)/i)?.[1]?.trim() ?? '') : '';
  const send = () => {
    const t = mine.trim(); if (!t) return;
    setReply(null);
    post({ ref: `${refText}:${total}`, work: 'sentence', from: 1, to: total, msg: t }).then((d) => setReply(d.text || d.error || 'It couldn’t answer just now.')).catch(() => setReply('It couldn’t answer just now.'));
  };
  const save = (text: string) => {
    fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refText, n: 1, text: `In one sentence: ${text}` }) })
      .then((r) => { if (r.ok) setSaved(true); }).catch(() => {});
  };
  return (
    <div className="lt-box">
      <span className="lt-box-label">The whole amud in one sentence</span>
      {reply === undefined ? (
        <form className="lt-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Say what this amud was about, in one sentence…" rows={2} dir="auto" />
          <span className="lt-row"><button type="submit" disabled={!mine.trim()}>Sharpen it</button><button type="button" className="ghost" disabled={!mine.trim() || saved} onClick={() => save(mine.trim())}>{saved ? 'Saved ✓' : 'Just save it'}</button></span>
        </form>
      ) : (
        <>
          <span className="lt-mine" dir="auto">{mine}</span>
          <Reply text={reply} />
          {reply && <span className="lt-row">
            {sharper && <button type="button" disabled={saved} onClick={() => save(sharper)}>{saved ? 'Saved to the Notebook ✓' : 'Save the sharper one'}</button>}
            <button type="button" className="ghost" disabled={saved} onClick={() => save(mine.trim())}>{saved ? 'Saved' : 'Save mine'}</button>
          </span>}
        </>
      )}
    </div>
  );
}
