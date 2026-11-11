'use client';
// A meforesh broken into its steps (app/api/commsteps): a "Steps" button above a long piece. Tapped, the same words
// are shown cut into steps, each with a label, punctuation, and one line of English; tapped again, the piece as it is.
// Shown on Tosafos always (Settings → Extras → Tosafos steps), and on any other long meforesh when Steps is on.
import { useState, type MouseEvent, type ReactNode } from 'react';

type Step = { label: string; he: string; en: string };
const cache = new Map<string, Step[]>();
/** Long enough to be worth breaking up (about 30 words). */
export const longPiece = (he: string[]) => he.join(' ').replace(/[^א-ת ]/g, '').length >= 170;

export default function Stepped({ refText, children, heClass = 'he rashi' }: { refText: string; children: ReactNode; heClass?: string }) {
  const [on, setOn] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(cache.get(refText) ?? null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [why, setWhy] = useState('');
  const load = () => {
    setState('loading');
    fetch(`/api/commsteps?ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.steps) && d.steps.length) { cache.set(refText, d.steps); setSteps(d.steps); setState('idle'); }
        else { setWhy(d.error || ''); setState('failed'); }
      })
      .catch(() => setState('failed'));
  };
  const flip = (e: MouseEvent) => { e.stopPropagation(); const next = !on; setOn(next); if (next && !steps && state !== 'loading') load(); };
  return (
    <>
      <button className={`steps-btn ${on ? 'on' : ''}`} onClick={flip}>{on ? '☰ Steps ▴' : '☰ Steps'}</button>
      {!on ? children
        : steps ? (
          <div className="stepped">
            {steps.map((s, k) => (
              <div key={k} className="stepped-row">
                <div className="stepped-label">{s.label}</div>
                <div className={heClass} dir="rtl">{s.he}</div>
                {s.en && <div className="stepped-en">{s.en}</div>}
              </div>
            ))}
            <div className="ai-note left">Divided and punctuated by AI · the words are the meforesh’s own, checked letter by letter</div>
          </div>
        ) : (
          <>
            {state === 'loading' ? <div className="gist muted">Breaking it into steps…</div>
              : <div className="gist muted">{/one step/.test(why) ? 'This piece is a single step.' : 'Couldn’t break this one into steps.'} {!/one step/.test(why) && <button className="linklike" onClick={(e) => { e.stopPropagation(); load(); }}>Try again</button>}</div>}
            {children}
          </>
        )}
    </>
  );
}
