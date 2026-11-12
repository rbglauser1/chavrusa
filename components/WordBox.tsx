'use client';
// Tap a word for its meaning (Settings → Extras → Word meanings): in a line that is already open, tapping a Hebrew or
// Aramaic word shows a bubble right at the word with its meaning in a few words; "More" shows the full entry. From
// Jastrow's dictionary, through Sefaria (app/api/word). No AI.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { looksAbbreviated, openAbbreviation } from '@/lib/abbrev';

type Entry = { headword: string; dictionary: string; morphology: string; senses: string[]; short: string };

/** The word under a tap, from the screen point (works without wrapping each word), and where it sits on screen. */
export function wordAt(x: number, y: number): { w: string; raw: string; rect: DOMRect } | null {
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
  const raw = t.slice(a, b);
  const w = raw.replace(/^["'״׳]+|["'״׳]+$/g, '');
  if (!/[א-ת]/.test(w)) return null;
  const range = document.createRange();
  range.setStart(node, a); range.setEnd(node, b);
  return { w, raw, rect: range.getBoundingClientRect() };
}

const cache = new Map<string, Entry[]>();

export default function WordBox({ word, raw, lineRef, at, onClose }: { word: string; raw?: string; lineRef: string; at: DOMRect; onClose: () => void }) {
  // An abbreviation (כה"ג, וי"ל, ר'): opened up from the fixed list (lib/abbrev), no lookup. One that isn't in the
  // list and ends in a geresh (a cut-off word) goes to the dictionary like any word.
  const abbr = raw && looksAbbreviated(raw) ? openAbbreviation(raw) : null;
  const isAbbr = !!abbr && (abbr.readings.length > 0 || /[א-ת]["״][א-ת]/.test(raw ?? ''));
  const key = `${word}|${lineRef}`;
  const [entries, setEntries] = useState<Entry[] | null>(cache.get(key) ?? null);
  const [err, setErr] = useState(false);
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean }>({ left: 12, top: at.bottom + 8, below: true });

  useEffect(() => {
    if (isAbbr || cache.has(key)) return;
    let gone = false;
    fetch(`/api/word?w=${encodeURIComponent(word)}&ref=${encodeURIComponent(lineRef)}`).then((r) => r.json())
      .then((d) => { const e = Array.isArray(d.entries) ? d.entries : []; cache.set(key, e); if (!gone) setEntries(e); })
      .catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [key, word, lineRef, isAbbr]);

  // Close when the page scrolls (the bubble would no longer sit on the word), or on Escape.
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);

  // Sit just above the word, or below it when there's no room above; never off the screen's sides.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(10, Math.min(vw - w - 10, at.left + at.width / 2 - w / 2));
    const below = at.top - h - 10 < 60 && at.bottom + h + 10 < vh;
    const top = below ? at.bottom + 8 : Math.max(10, at.top - h - 8);
    setPos({ left, top, below });
  }, [at, entries, full, err]);

  const first = entries?.[0];
  const arrowX = Math.max(14, Math.min((box.current?.offsetWidth ?? 280) - 14, at.left + at.width / 2 - pos.left));
  return createPortal(
    <>
      <div className="wp-scrim" onClick={onClose} />
      <div ref={box} className={`wp ${pos.below ? 'below' : 'above'} ${full ? 'full' : ''}`} style={{ left: pos.left, top: pos.top, '--ax': `${arrowX}px` } as CSSProperties} role="dialog" aria-label={`The meaning of ${word}`} onClick={(e) => e.stopPropagation()}>
        {isAbbr ? (
          <>
            <div className="wp-head"><span className="he">{raw}</span><i>abbreviation</i></div>
            {abbr!.readings.length ? abbr!.readings.map(([he, en], k) => (
              <div key={k} className="wp-abbr"><span className="he">{abbr!.prefix}{he}</span><span>{en}</span></div>
            )) : <div className="wp-short muted">Not in the list. Ask in ✦ Chat.</div>}
            {abbr!.readings.length > 1 && <div className="wp-note">Which one depends on the place.</div>}
          </>
        ) : err ? <div className="wp-short muted">Couldn’t look it up just now.</div>
          : !entries ? <div className="wp-short muted">…</div>
          : !first ? <div className="wp-short muted">Not in the dictionary. Ask in ✦ Chat.</div>
          : !full ? (
            <>
              <div className="wp-head"><span className="he">{first.headword}</span>{first.morphology && <i>{first.morphology}</i>}</div>
              <div className="wp-short">{first.short || first.senses[0]}</div>
              <button className="wp-more" onClick={() => setFull(true)}>More ›</button>
            </>
          ) : (
            <div className="wp-full">
              {entries.map((e, k) => (
                <div key={k} className="wb-entry">
                  <div className="wp-head"><span className="he">{e.headword}</span>{e.morphology && <i>{e.morphology}</i>}<small>{e.dictionary}</small></div>
                  <ol className="wb-senses">{e.senses.map((s, j) => <li key={j} dir="auto">{s}</li>)}</ol>
                </div>
              ))}
              <div className="muted wb-credit">From Jastrow’s dictionary (1903), through Sefaria</div>
            </div>
          )}
      </div>
    </>,
    document.body,
  );
}
