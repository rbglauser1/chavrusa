'use client';
// Nov 17: what the AI adds to the page (Steps before a move, Pshat after it). "Always": the note shows. "Tap to show":
// a small, quiet ✦ marker in its place; a tap opens the note, a tap on the note folds it back.
// When the AI writes in Hebrew the note reads right to left.
import { useEffect, useState } from 'react';

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
