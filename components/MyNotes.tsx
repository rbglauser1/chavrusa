'use client';
// In the Library: a way into the Notebook (components/Notebook.tsx), with how many notes there are.
import { useEffect, useState } from 'react';

export default function MyNotes() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { fetch('/api/notes').then((r) => r.json()).then((d) => setCount((d.notes ?? []).length)).catch(() => setCount(0)); }, []);
  if (count === null) return null;
  return (
    <div className="mine">
      <button className="lib-item note-item" onClick={() => window.dispatchEvent(new Event('chavrusa-notebook'))}>
        <b>Notebook{count ? ` (${count})` : ''}</b>
        <span className="muted" style={{ fontSize: 13 }}>{count ? 'All your notes, by sefer and topic' : 'Your notes will gather here: tap a line, then ✎'}</span>
      </button>
    </div>
  );
}
