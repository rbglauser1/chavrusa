'use client';
// Tap a word for its meaning (Settings → Extras → Word meanings): in a line that is already open, tapping a Hebrew or
// Aramaic word shows what it means, from Jastrow (Gemara, Targum, Midrash) or Brown-Driver-Briggs (Tanach), through
// Sefaria (app/api/word). No AI.
import { useEffect, useState } from 'react';

type Entry = { headword: string; dictionary: string; morphology: string; senses: string[] };

/** The word under a tap, from the screen point (works without wrapping each word). */
export function wordAt(x: number, y: number): string | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  let node: Node | null = null, off = 0;
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) { node = p.offsetNode; off = p.offset; }
  else { const r = d.caretRangeFromPoint?.(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const t = node.textContent ?? '';
  const isW = (c: string) => /[ְ-ׇא-ת֑-֯"'״׳]/.test(c);
  let a = Math.min(off, t.length), b = a;
  if (a > 0 && !isW(t[a] ?? '') && isW(t[a - 1])) a--, b = a;
  while (a > 0 && isW(t[a - 1])) a--;
  while (b < t.length && isW(t[b])) b++;
  const w = t.slice(a, b).replace(/^["'״׳]+|["'״׳]+$/g, '');
  return /[א-ת]/.test(w) ? w : null;
}

export default function WordBox({ word, lineRef, onClose }: { word: string; lineRef: string; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState(false);
  const [more, setMore] = useState<number | null>(null);
  useEffect(() => {
    let gone = false;
    setEntries(null); setErr(false); setMore(null);
    fetch(`/api/word?w=${encodeURIComponent(word)}&ref=${encodeURIComponent(lineRef)}`).then((r) => r.json())
      .then((d) => { if (!gone) setEntries(Array.isArray(d.entries) ? d.entries : []); })
      .catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [word, lineRef]);
  return (
    <div className="comm wordbox" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title"><span className="he wb-word">{word}</span><button className="comm-x" aria-label="Close" onClick={onClose}>✕</button></div>
      {err ? <div className="muted">Couldn’t look it up just now.</div>
        : !entries ? <div className="muted">Looking it up…</div>
        : !entries.length ? <div className="muted">Not found in the dictionary. Try tapping the word without its prefix, or ask in ✦ Chat.</div>
        : entries.map((e, k) => (
          <div key={k} className="wb-entry">
            <div className="wb-head"><span className="he">{e.headword}</span>{e.morphology && <i>{e.morphology}</i>}<small>{e.dictionary}</small></div>
            <ol className="wb-senses">{(more === k ? e.senses : e.senses.slice(0, 3)).map((s, j) => <li key={j} dir="auto">{s}</li>)}</ol>
            {e.senses.length > 3 && <button className="linklike" onClick={() => setMore(more === k ? null : k)}>{more === k ? 'Less' : `More (${e.senses.length - 3})`}</button>}
          </div>
        ))}
      <div className="muted wb-credit">From Jastrow’s dictionary (1903) and Brown-Driver-Briggs (1906), through Sefaria</div>
    </div>
  );
}
