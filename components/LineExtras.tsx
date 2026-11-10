'use client';
// Under a line in the Sefer, next to its meforshim (Settings → Extras):
//   Explain: what this line says and where it stands in the sugya, by the AI (Opus, made once per line and kept).
//   Sources: what Sefaria links to this line (halacha, parallels, Midrash, verses, machshava), each opening right here
//            in Hebrew and English. No AI.
import { useEffect, useState } from 'react';
import { LinkRow, RefText, type Linked } from './RefText';

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

// "Ideas from these sources": 2 to 4 points the AI draws only from the seforim linked to the line, each naming them;
// tap a source to read it right there (Opus, once per line, kept: app/api/ideas).
function Ideas({ lineRef, titles }: { lineRef: string; titles: Record<string, string> }) {
  const [points, setPoints] = useState<{ text: string; refs: string[] }[] | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [openRef, setOpenRef] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    setPoints(null); setErr('');
    fetch(`/api/ideas?ref=${encodeURIComponent(lineRef)}`).then((r) => r.json())
      .then((d) => { if (!gone) { if (d.points?.length) setPoints(d.points); else setErr(d.error ? 'The ideas couldn’t be made just now.' : 'Nothing to add from these sources.'); } })
      .catch(() => { if (!gone) setErr('The ideas couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [lineRef, tick]);
  if (err) return <div className="muted lx-ideas">{err} {err.includes('just now') && <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button>}</div>;
  if (!points) return <div className="muted lx-ideas">Reading the sources…</div>;
  return (
    <div className="lx-ideas">
      {points.map((p, i) => (
        <div key={i} className="lx-idea">
          <p className="lx-p">{p.text}</p>
          <div className="smap-tags lx-refs">
            {p.refs.map((r) => <button key={r} className={openRef === `${i}|${r}` ? 'on' : ''} onClick={() => setOpenRef(openRef === `${i}|${r}` ? null : `${i}|${r}`)}>{titles[r] ?? r}</button>)}
          </div>
          {openRef?.startsWith(`${i}|`) && <RefText refs={[openRef.slice(openRef.indexOf('|') + 1)]} />}
        </div>
      ))}
      <div className="muted smap-ai-note">Drawn by the AI only from the sources linked to this line.</div>
    </div>
  );
}

/** Whether a line has seforim the AI can draw ideas from (halacha, Midrash, machshava, the same in Shas). */
export const hasIdeas = (g?: Groups) => !!g && g.halacha.length + g.thought.length + g.midrash.length + g.parallels.length > 0;

// The Ideas box under a line (its own button, next to Explain and Sources).
export function IdeasBox({ groups, lineRef, onClose }: { groups: Groups; lineRef: string; onClose: () => void }) {
  const titles = Object.fromEntries(Object.values(groups).flat().map((x) => [x.ref, x.title]));
  return (
    <div className="comm line-x" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">✦ Ideas from the sources<button className="comm-x" aria-label="Close the ideas" onClick={onClose}>✕</button></div>
      <Ideas lineRef={lineRef} titles={titles} />
    </div>
  );
}

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
