'use client';
// "Where else in Shas" (the ⇄ Elsewhere button on a line; Settings → Extras): the other places in the Gemara,
// Mishnah and Tosefta where the same sugya or statement comes up, from Sefaria's links. Free, no AI. Tap one: its
// words open right here.
import { LinkRow } from './RefText';

type Item = { title: string; ref: string };
const masechta = (r: string) => r.replace(/\s+\d+[ab]?(?::[\d-]+)*$/, '');

export default function Elsewhere({ items, lineRef, onOpen, onClose }: { items: Item[]; lineRef: string; onOpen?: (ref: string) => void; onClose: () => void }) {
  const here = masechta(lineRef);
  const same = items.filter((x) => masechta(x.ref) === here);
  const other = items.filter((x) => masechta(x.ref) !== here);
  return (
    <div className="comm line-x" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">⇄ Where else in Shas<button className="comm-x" aria-label="Close" onClick={onClose}>✕</button></div>
      {other.length > 0 && <><div className="lx-h">In other masechtos</div><ul className="htr-items">{other.map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}</ul></>}
      {same.length > 0 && <><div className="lx-h">Elsewhere in {here}</div><ul className="htr-items">{same.map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}</ul></>}
      <div className="ai-note left">From Sefaria’s links for this line</div>
    </div>
  );
}
