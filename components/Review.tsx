'use client';
// Review questions (Settings → Extras): questions on the amud or perek to test yourself. Each answer stays hidden until
// tapped; "line n" goes to the line it is about. Made once per amud / perek by the AI and kept for good (app/api/review).
import { useEffect, useState } from 'react';

type Question = { q: string; a: string; line: number };

export default function Review({ refText, onGo, onClose }: { refText: string; onGo: (line: number) => void; onClose: () => void }) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set());
  useEffect(() => {
    let gone = false;
    setQs(null); setErr(''); setShown(new Set());
    fetch(`/api/review?ref=${encodeURIComponent(refText)}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      if (d.questions?.length) setQs(d.questions); else setErr(d.error ? 'The questions couldn’t be made just now.' : 'No questions for this text.');
    }).catch(() => { if (!gone) setErr('The questions couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [refText, tick]);
  const flip = (i: number) => setShown((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div className="smap-back" onClick={onClose}>
      <div className="smap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Review questions">
        <div className="smap-head"><span>Review · {refText}</span><button className="smap-x" onClick={onClose} aria-label="Close">×</button></div>
        {!qs && !err && <div className="muted smap-wait">Writing the questions…</div>}
        {err && <div className="muted smap-wait">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>}
        {qs && (
          <>
            <div className="muted rv-hint">Written by AI, may contain mistakes. Think of the answer, then tap to check. {shown.size}/{qs.length} checked</div>
            <ol className="rv-list">
              {qs.map((x, i) => (
                <li key={i} className={`rv-q ${shown.has(i) ? 'open' : ''}`}>
                  <button className="rv-ask" onClick={() => flip(i)}><span className="rv-n">{i + 1}</span><span>{x.q}</span></button>
                  {shown.has(i)
                    ? <div className="rv-a">{x.a} <button className="linklike" onClick={() => { onGo(x.line); onClose(); }}>line {x.line}</button></div>
                    : <button className="rv-show" onClick={() => flip(i)}>Show the answer</button>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
