'use client';
// The sugya map (Settings → Extras), all in English: the big picture of the amud or perek, then each topic with its
// intro, the background it needs, its steps as a timeline, and where it ends up. Tap a step (or a topic) to go to its line.
import { useEffect, useState } from 'react';

type Step = { line: number; kind: string; who: string; summary: string };
type Topic = { title: string; line: number; intro: string; background: string[]; steps: Step[]; takeaway: string };

export default function SugyaMap({ refText, title = 'Sugya map', here, onGo, onClose }: { refText: string; title?: string; here?: number; onGo: (line: number) => void; onClose: () => void }) {
  const [data, setData] = useState<{ overview: string; topics: Topic[] } | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setData(null); setErr('');
    fetch(`/api/map?ref=${encodeURIComponent(refText)}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      const topics: Topic[] = d.topics?.length ? d.topics : d.steps?.length ? [{ title: '', line: d.steps[0].line, intro: '', background: [], steps: d.steps, takeaway: '' }] : [];
      if (topics.length) setData({ overview: d.overview ?? '', topics }); else setErr(d.error ? 'The map couldn’t be made just now.' : 'No map for this text.');
    }).catch(() => { if (!gone) setErr('The map couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [refText, tick]);
  // The step we're in: the last one starting at or before the line we're on.
  const all = data ? data.topics.flatMap((t) => t.steps) : [];
  const atStep = here ? all.reduce<Step | null>((k, s) => (s.line <= here ? s : k), null) : null;
  const go = (line: number) => { onGo(line); onClose(); };
  return (
    <div className="smap-back" onClick={onClose}>
      <div className="smap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="smap-head"><span>{title} · {refText}</span><button className="smap-x" onClick={onClose} aria-label="Close">×</button></div>
        {!data && !err && <div className="muted smap-wait">Laying it out…</div>}
        {err && <div className="muted smap-wait">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>}
        {data && (
          <>
            {data.overview && <div className="smap-overview"><span className="smap-label">The big picture</span><p>{data.overview}</p></div>}
            {data.topics.map((t, ti) => (
              <section key={ti} className="smap-topic">
                {t.title && (
                  <button className="smap-topic-head" onClick={() => go(t.line)}>
                    <span className="smap-topic-n">{data.topics.length > 1 ? `${ti + 1}` : ''}</span>
                    <span className="smap-topic-title">{t.title}</span>
                    <span className="smap-line">line {t.line}</span>
                  </button>
                )}
                {t.intro && <p className="smap-intro">{t.intro}</p>}
                {t.background.length > 0 && (
                  <div className="smap-bg">
                    <span className="smap-label">Good to know</span>
                    <ul>{t.background.map((b, i) => { const m = b.match(/^([^:]{1,40}):\s*(.*)$/); return <li key={i}>{m ? <><b>{m[1]}</b>: {m[2]}</> : b}</li>; })}</ul>
                  </div>
                )}
                <ol className="smap-list">
                  {t.steps.map((s, i) => (
                    <li key={i} className={`smap-step k-${s.kind.toLowerCase()} ${s === atStep ? 'here' : ''}`}>
                      <button onClick={() => go(s.line)}>
                        <span className="smap-kind">{s.kind}{s.who ? ` · ${s.who}` : ''}</span>
                        <span className="smap-sum">{s.summary}</span>
                        <span className="smap-line">line {s.line}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {t.takeaway && <p className="smap-take"><span className="smap-label">Where it ends up</span>{t.takeaway}</p>}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
