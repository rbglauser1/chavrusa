'use client';
// "Just 5 minutes" (Nov 16, Focus help): started from Home. A small timer at the top while he learns; when the five
// minutes are up, a gentle card: Keep going, 5 more minutes, or Done for now. Starting is the hardest part, and a
// small promise is easier to keep.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fiveEnd, fiveLen, markLearned, startFive, stopFive, streak } from '@/lib/focus';

export default function FiveMinutes({ onDone }: { onDone: () => void }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const read = () => setEnd(fiveEnd());
    read();
    window.addEventListener('chavrusa-five', read);
    return () => window.removeEventListener('chavrusa-five', read);
  }, []);
  useEffect(() => {
    if (!end) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  if (!end || typeof document === 'undefined') return null;
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  if (left > 0) {
    return createPortal(
      <button className="five-pill" onClick={stopFive} aria-label={`${Math.ceil(left / 60)} minutes left. Tap to hide the timer.`}>
        ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </button>,
      document.body,
    );
  }
  markLearned();
  const days = streak();
  const mins = fiveLen();
  return createPortal(
    <div className="five-done" role="dialog" aria-label={`${mins} minutes done`}>
      <div className="five-card">
        <div className="five-check">✓</div>
        <h2>{mins} minute{mins === 1 ? '' : 's'} of learning</h2>
        <p>Nice start.{days >= 2 ? ` 🔥 ${days} days in a row.` : ''} Want to keep going?</p>
        <button className="five-main" onClick={stopFive}>Keep going</button>
        <button className="five-more" onClick={() => startFive(mins)}>{mins} more minutes</button>
        <button className="five-more" onClick={() => { stopFive(); window.dispatchEvent(new Event('chavrusa-leave-q')); }}>Leave myself a question</button>
        <button className="five-stop" onClick={() => { stopFive(); onDone(); }}>Done for now</button>
      </div>
    </div>,
    document.body,
  );
}
