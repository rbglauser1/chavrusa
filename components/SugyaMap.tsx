'use client';
// The sugya map (Settings → Extras): the amud's steps as a timeline. Tap a step to go to its line.
import { useEffect, useState } from 'react';

type Step = { line: number; kind: string; who: string; summary: string };

export default function SugyaMap({ refText, title = 'Sugya map', here, onGo, onClose }: { refText: string; title?: string; here?: number; onGo: (line: number) => void; onClose: () => void }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setSteps(null); setErr('');
    fetch(`/api/map?ref=${encodeURIComponent(refText)}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      if (d.steps?.length) setSteps(d.steps); else setErr(d.error ? 'The map couldn’t be made just now.' : 'No map for this text.');
    }).catch(() => { if (!gone) setErr('The map couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [refText, tick]);
  // The step we're in: the last one starting at or before the line we're on.
  const at = steps && here ? steps.reduce((k, s, i) => (s.line <= here ? i : k), -1) : -1;
  return (
    <div className="smap-back" onClick={onClose}>
      <div className="smap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="smap-head"><span>{title} · {refText}</span><button className="smap-x" onClick={onClose} aria-label="Close">×</button></div>
        {!steps && !err && <div className="muted smap-wait">Laying it out…</div>}
        {err && <div className="muted smap-wait">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>}
        {steps && (
          <ol className="smap-list">
            {steps.map((s, i) => (
              <li key={i} className={`smap-step k-${s.kind.toLowerCase()} ${i === at ? 'here' : ''}`}>
                <button onClick={() => { onGo(s.line); onClose(); }}>
                  <span className="smap-kind">{s.kind}{s.who ? ` · ${s.who}` : ''}</span>
                  <span className="smap-sum">{s.summary}</span>
                  <span className="smap-line">line {s.line}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
