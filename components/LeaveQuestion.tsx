'use client';
// "Leave myself a question" (Nov 17, Focus help; from the ChatGPT ideas the learner liked): at the end of a session,
// a few words of his own. Next time the Home card shows them in quotes, and the reading screen shows them beside his
// line. Opened by the event 'chavrusa-leave-q' (from the ⋯ menu, the end-of-timer card and the goal card); the place
// is the line he is on (window.__chavrusaPlace, set by FocusHelp).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type LeftQ = { ref: string; line: number; text: string; at: string };
type Place = { ref: string; line: number } | undefined;

export default function LeaveQuestion({ onSave }: { onSave: (q: LeftQ) => void }) {
  const [place, setPlace] = useState<{ ref: string; line: number } | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    const open = () => {
      const p = (window as unknown as { __chavrusaPlace?: Place }).__chavrusaPlace;
      if (!p) return;
      setText('');
      setPlace(p);
    };
    window.addEventListener('chavrusa-leave-q', open);
    return () => window.removeEventListener('chavrusa-leave-q', open);
  }, []);
  if (!place || typeof document === 'undefined') return null;
  const save = () => {
    const t = text.trim();
    if (!t) return;
    onSave({ ref: place.ref, line: place.line, text: t.slice(0, 200), at: new Date().toISOString() });
    setPlace(null);
  };
  return createPortal(
    <div className="five-done" role="dialog" aria-label="Leave yourself a question">
      <div className="five-card lq-card">
        <h2>A question for next time</h2>
        <p>{place.ref.replace('Berakhot', 'Berachos')} · line {place.line}. A few words to pick up from when you come back.</p>
        <label className="lq-label" htmlFor="lq-text">Your question</label>
        <textarea id="lq-text" className="lq-text" rows={3} maxLength={200} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Why does the Gemara need a second proof?" />
        <button className="five-main" onClick={save} disabled={!text.trim()}>Save it</button>
        <button className="five-stop" onClick={() => setPlace(null)}>Not now</button>
      </div>
    </div>,
    document.body,
  );
}
