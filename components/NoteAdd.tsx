'use client';
// "✎ Note": write a note right where you are (on a meforesh, an explanation, a step of the sugya map, an idea…). It is
// kept on its line (ref + n), says what it was on, and lands in the Notebook. Saving tells the page (the
// "chavrusa-notes" event) so the line's notes show at once.
import { useState } from 'react';

export const notesChanged = () => { try { window.dispatchEvent(new Event('chavrusa-notes')); } catch { /* ignore */ } };

export default function NoteAdd({ refText, n, on, quote, label = '✎ Note' }: { refText: string; n: number; on?: string; quote?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refText, n, text, on, quote }) }).catch(() => null);
    if (r?.ok) { setOpen(false); setText(''); setSaved(true); notesChanged(); window.setTimeout(() => setSaved(false), 2500); }
  };
  if (!open) return <button className="note-add" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{saved ? '✓ Noted' : label}</button>;
  return (
    <div className="ln-edit note-add-edit" onClick={(e) => e.stopPropagation()}>
      <textarea autoFocus rows={3} dir="auto" placeholder={on ? `Your note on ${on}… (#topic to file it)` : 'Your note… (#topic to file it)'} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="ln-btns"><button className="btn" disabled={!text.trim()} onClick={() => void save()}>Save</button><button className="btn ghost" onClick={() => { setOpen(false); setText(''); }}>Cancel</button></div>
    </div>
  );
}
