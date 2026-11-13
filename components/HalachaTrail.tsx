'use client';
// "From the sugya to the halacha" (the ⚖ Halacha button on a line; Settings → Extras): the road from this line of
// Gemara or Mishnah to the halacha, in order: the Rambam, the Tur, the Shulchan Aruch, then the Mishnah Berurah and
// the commentaries on that se'if. All from Sefaria's links (the Ein Mishpat of the page), free, no AI. Tap any stop:
// its words open right here.
import { useEffect, useState } from 'react';
import { LinkRow } from './RefText';

type Item = { title: string; ref: string };

function OnIt({ x, onOpen }: { x: Item; onOpen?: (ref: string) => void }) {
  const [on, setOn] = useState<Item[] | null>(null);
  useEffect(() => {
    let gone = false;
    fetch(`/api/halacha?ref=${encodeURIComponent(x.ref)}`).then((r) => r.json()).then((d) => { if (!gone) setOn(Array.isArray(d.on) ? d.on : []); }).catch(() => { if (!gone) setOn([]); });
    return () => { gone = true; };
  }, [x.ref]);
  if (!on) return <li className="muted htr-wait"><span className="wait-dots"><span /><span /><span /></span>Looking on {x.title}…</li>;
  if (!on.length) return null;
  return <>{on.map((y) => <LinkRow key={y.ref} x={y} onOpen={onOpen} />)}</>;
}

export default function HalachaTrail({ halacha, lineLabel, onOpen, onClose }: { halacha: Item[]; lineLabel: string; onOpen?: (ref: string) => void; onClose: () => void }) {
  const rambam = halacha.filter((x) => /^Mishneh Torah/.test(x.ref));
  const tur = halacha.filter((x) => /^Tur\b/.test(x.ref));
  const sa = halacha.filter((x) => /^Shulchan Arukh/.test(x.ref));
  const other = halacha.filter((x) => !/^(Mishneh Torah|Tur\b|Shulchan Arukh)/.test(x.ref));
  const stages: { name: string; note: string; items: Item[]; on?: Item[] }[] = [
    { name: 'Rambam', note: 'How the Rambam rules it in the Mishneh Torah', items: rambam },
    { name: 'Tur', note: 'The Tur gathers the opinions of the Rishonim', items: tur },
    { name: 'Shulchan Aruch', note: 'The ruling, with the Rema', items: sa },
    { name: 'Mishnah Berurah and the commentaries', note: 'What stands on that se’if', items: [], on: sa.slice(0, 3) },
    { name: 'Also', note: 'Other seforim of halacha that bring this line', items: other },
  ].filter((s) => s.items.length || s.on?.length);
  return (
    <div className="comm line-x htr" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">⚖ From the sugya to the halacha<button className="comm-x" aria-label="Close" onClick={onClose}>✕</button></div>
      <ol className="htr-list">
        <li className="htr-stage"><div className="htr-name">The sugya</div><div className="htr-note">{lineLabel}</div></li>
        {stages.map((s) => (
          <li key={s.name} className="htr-stage">
            <div className="htr-name">{s.name}</div>
            <div className="htr-note">{s.note}</div>
            <ul className="htr-items">
              {s.items.map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}
              {s.on?.map((x) => <OnIt key={x.ref} x={x} onOpen={onOpen} />)}
            </ul>
          </li>
        ))}
      </ol>
      <div className="ai-note left">From Sefaria’s links for this line · for halacha in practice, ask your rav</div>
    </div>
  );
}
