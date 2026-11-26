'use client';
// Nov 17: what the AI adds to the page (Steps before a move, Pshat after it). "Always": the note shows. "Tap to show":
// a small, quiet ✦ marker in its place; a tap opens the note, a tap on the note folds it back.
// When the AI writes in Hebrew the note reads right to left.
import { useEffect, useRef, useState } from 'react';
import { useKept } from '@/lib/uiKeep';

export const isHebText = (t: string) => (t.match(/[א-ת]/g)?.length ?? 0) > (t.match(/[A-Za-z]/g)?.length ?? 0);

export function AiNote({ kind, text, tap }: { kind: 'move' | 'pshat'; text: string; tap: boolean }) {
  const [open, setOpen] = useState(!tap);
  useEffect(() => { setOpen(!tap); }, [tap]);
  const he = isHebText(text);
  if (!open) {
    return (
      <button type="button" className={`ai-dot ai-dot-${kind}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={kind === 'move' ? 'Show the step' : 'Show the pshat'}>
        ✦ <span>{kind === 'move' ? 'Step' : 'Pshat'}</span>
      </button>
    );
  }
  return (
    <div className={`${kind} ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'} onClick={tap ? (e) => { e.stopPropagation(); setOpen(false); } : undefined}>{text}</div>
  );
}

// Nov 23: several notes of one kind on a line (two Steps beginning on the same line) were a row of chips, "Step Step":
// now one chip, "2 Steps", and one tap opens them all (a tap on any folds them back).
export function AiNotes({ kind, texts, tap, keepKey }: { kind: 'move' | 'pshat'; texts: string[]; tap: boolean; keepKey?: string }) {
  // Nov 26: a Step or Pshat he tapped open stays open when he goes to Settings and back (keepKey: the line).
  const [open, setOpen] = useKept(keepKey ? `note:${kind}:${keepKey}:${tap ? 't' : 'a'}` : null, !tap);
  const tapBefore = useRef(tap);
  useEffect(() => { if (tapBefore.current !== tap) { tapBefore.current = tap; setOpen(!tap); } }, [tap]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!texts.length) return null;
  const name = kind === 'move' ? 'Step' : 'Pshat';
  if (!open) {
    return (
      <button type="button" className={`ai-dot ai-dot-${kind}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={texts.length > 1 ? `Show the ${texts.length} ${name.toLowerCase()}s` : `Show the ${name.toLowerCase()}`}>
        ✦ <span>{texts.length > 1 ? `${texts.length} ${name}s` : name}</span>
      </button>
    );
  }
  return (
    <>
      {texts.map((t, k) => {
        const he = isHebText(t);
        return <div key={k} className={`${kind} ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'} onClick={tap ? (e) => { e.stopPropagation(); setOpen(false); } : undefined}>{t}</div>;
      })}
    </>
  );
}

// Nov 23: with Color the give and take on, the colored label right beside the step already says what it is and who says
// it ("? Question · the Gemara"); the step's heading then gives only the substance ("Why does the Mishnah…"), not
// "The Gemara asks: why does the Mishnah…" again.
const LEAD = /^(?:the gemara|the mishnah|the baraita|a baraita|[A-Z][A-Za-z'’\- ]{1,40}?)\s+(?:then\s+)?(?:asks|answers|says|rejects|proves|brings(?: a)?(?: proof)?|concludes|explains|responds|replies|challenges|objects|suggests|counters|qualifies|quotes|cites|teaches|rules|disagrees|adds|notes|derives|clarifies|resolves|retorts)(?:\s+(?:that|whether|why|how|from))?\s*[:—–-]\s*/i;
export function stepSubstance(t: string): string {
  const m = t.match(LEAD);
  if (!m) return t;
  const rest = t.slice(m[0].length).trim();
  return rest.length > 8 ? rest.charAt(0).toUpperCase() + rest.slice(1) : t;
}

// Nov 23: Pshat at the end of the move's last line, right beside "✦ In my words?" (it used to sit after the line,
// where it looked like it belonged to the next one). A tap opens the say-over of the whole move right there.
export function PshatInline({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  if (!texts.length) return null;
  return (
    <span className="pshat-inline" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`sayit-btn pshat-btn ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>✦ Pshat</button>
      {open && (
        <span className="pshat-inline-box">
          {texts.map((t, k) => { const he = isHebText(t); return <span key={k} className={`pshat ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>{t}</span>; })}
        </span>
      )}
    </span>
  );
}
