'use client';
// The answer of one of the learner's own buttons (components/MyButtons.tsx), under the line or at the top of the amud,
// with its sources tappable, like Explain.
import { useEffect, useState } from 'react';
import { WithSources } from './LineExtras';
import NoteAdd from './NoteAdd';

export default function MyButtonBox({ id, name, refText, onClose }: { id: string; name: string; refText: string; onClose: () => void }) {
  const [data, setData] = useState<{ text: string; sources: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setData(null); setErr('');
    fetch(`/api/mybutton?id=${encodeURIComponent(id)}&ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => { if (!gone) { if (d.text) setData({ text: d.text, sources: Array.isArray(d.sources) ? d.sources : [] }); else setErr(d.error && !/^The /.test(d.error) ? d.error : 'It couldn’t be made just now.'); } })
      .catch(() => { if (!gone) setErr('It couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [id, refText, tick]);
  const m = refText.match(/^(.*?):(\d+)$/);
  return (
    <div className="comm line-x" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">✦ {name}{data && <NoteAdd refText={m ? m[1] : refText} n={m ? Number(m[2]) : 1} on={name} quote={data.text.replace(/⟦[^⟧]+⟧/g, '').slice(0, 140)} label="✎" />}<button className="comm-x" aria-label={`Close ${name}`} onClick={onClose}>✕</button></div>
      {data && <div className="ai-note left">Written by AI · AI makes mistakes</div>}
      {data ? <WithSources text={data.text} sources={data.sources} />
        : err ? <div className="muted">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>
        : <div className="muted">Working on it…</div>}
    </div>
  );
}
