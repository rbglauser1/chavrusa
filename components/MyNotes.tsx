'use client';
// My Notes (Library): every note on a line, newest first, with a search. Tap one to open its text.
import { useEffect, useState } from 'react';

type Note = { id: string; ref: string; n: number; text: string; created: string };

export default function MyNotes({ onOpen }: { onOpen: (ref: string) => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch('/api/notes').then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => setNotes([])); }, []);
  if (!notes?.length) return null;
  const hits = q.trim() ? notes.filter((x) => (x.text + ' ' + x.ref).toLowerCase().includes(q.trim().toLowerCase())) : notes;
  return (
    <div className="mine">
      <div className="lib-recent-head">
        <span className="muted lib-hint">My Notes ({notes.length})</span>
        <button className="clear-all" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <>
          <input className="notes-search" placeholder="Search your notes" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((x) => (
            <button key={x.id} className="lib-item note-item" onClick={() => onOpen(x.ref)}>
              <span className="muted" style={{ fontSize: 12 }}>{x.ref}, line {x.n}</span>
              <span dir="auto">{x.text.length > 160 ? `${x.text.slice(0, 160)}…` : x.text}</span>
            </button>
          ))}
          {!hits.length && <div className="muted mine-empty">No notes match.</div>}
        </>
      )}
    </div>
  );
}
