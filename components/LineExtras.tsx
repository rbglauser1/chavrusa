'use client';
// Under a line in the Sefer, next to its meforshim (Settings → Extras):
//   Explain: what this line says and where it stands in the sugya, by the AI (Opus, made once per line and kept).
//   Sources: what Sefaria links to this line (halacha, parallels, Midrash, verses, machshava), each opening right here
//            in Hebrew and English. No AI.
import { useEffect, useState } from 'react';
import { LinkRow, type Linked } from './RefText';

export function ExplainBox({ lineRef, onClose }: { lineRef: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setText(null); setErr('');
    fetch(`/api/explain?ref=${encodeURIComponent(lineRef)}`).then((r) => r.json())
      .then((d) => { if (!gone) { if (d.text) setText(d.text); else setErr('The explanation couldn’t be made just now.'); } })
      .catch(() => { if (!gone) setErr('The explanation couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [lineRef, tick]);
  return (
    <div className="comm line-x" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">✦ Explanation<button className="comm-x" aria-label="Close the explanation" onClick={onClose}>✕</button></div>
      {text ? text.split(/\n\s*\n/).map((p, i) => <p key={i} className="lx-p">{p}</p>)
        : err ? <div className="muted">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>
        : <div className="muted">Explaining…</div>}
    </div>
  );
}

export type Groups = { halacha: Linked[]; parallels: Linked[]; midrash: Linked[]; verses: Linked[]; thought: Linked[] };
export const sourcesCount = (g?: Groups) => (g ? g.halacha.length + g.parallels.length + g.midrash.length + g.verses.length + g.thought.length : 0);

export function SourcesBox({ groups, tanakh, onOpen, onClose }: { groups: Groups; tanakh: boolean; onOpen?: (ref: string) => void; onClose: () => void }) {
  const parts: [keyof Groups, string][] = [
    ['halacha', 'Halacha'],
    ['parallels', tanakh ? 'Gemara and Mishnah on this pasuk' : 'The same in Shas'],
    ['midrash', 'Midrash'],
    ['verses', tanakh ? 'Related pesukim' : 'Verses quoted'],
    ['thought', 'Machshava, Mussar, Chassidus'],
  ];
  return (
    <div className="comm line-x" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">Sources<button className="comm-x" aria-label="Close the sources" onClick={onClose}>✕</button></div>
      {parts.filter(([k]) => groups[k].length).map(([k, label]) => (
        <div key={k} className="smap-links">
          <span className="smap-label">{label}</span>
          <ul>{groups[k].map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}</ul>
        </div>
      ))}
    </div>
  );
}
