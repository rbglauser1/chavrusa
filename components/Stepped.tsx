'use client';
// A meforesh broken into its steps (app/api/commsteps): a "Steps" button above a long piece. Tapped, the same words
// are shown cut into steps, each with a label, punctuation, and one line of English; tapped again, the piece as it is.
// Shown on Tosafos always (Settings → Extras → Tosafos steps), and on any other long meforesh when Steps is on.
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Bullets } from './Bullets';

type Step = { label: string; he: string; en: string };
const cache = new Map<string, Step[]>();
const outlines = new Map<string, string>();
/** Long enough to be worth breaking up (about 30 words). */
export const longPiece = (he: string[]) => he.join(' ').replace(/[^א-ת ]/g, '').length >= 170;

export default function Stepped({ refText, children, heClass = 'he rashi' }: { refText: string; children: ReactNode; heClass?: string }) {
  const [on, setOn] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(cache.get(refText) ?? null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [why, setWhy] = useState('');
  // Outline (Nov 13): a short bulleted outline by the AI, to read before Steps.
  const [ol, setOl] = useState(false);
  const [outline, setOutline] = useState<string | null>(outlines.get(refText) ?? null);
  const [olState, setOlState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const load = () => {
    setState('loading');
    fetch(`/api/commsteps?ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.steps) && d.steps.length) { cache.set(refText, d.steps); setSteps(d.steps); setState('idle'); }
        else { setWhy(d.error || ''); setState('failed'); }
      })
      .catch(() => setState('failed'));
  };
  // Keep the Steps button where it was on the screen when the piece changes height (Nov 11: on iPhone the page jumped
  // and part of the screen was left blank while scrolling back up).
  const btn = useRef<HTMLButtonElement>(null);
  const before = useRef<number | null>(null);
  const flip = (e: MouseEvent) => {
    e.stopPropagation();
    before.current = btn.current?.getBoundingClientRect().top ?? null;
    const next = !on; setOn(next); if (next && !steps && state !== 'loading') load();
  };
  useLayoutEffect(() => {
    const top = before.current, el = btn.current;
    if (top === null || !el) return;
    let box: HTMLElement | null = el.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    const d = el.getBoundingClientRect().top - top;
    if (Math.abs(d) > 1) { if (box) box.scrollTop += d; else window.scrollBy(0, d); }
    if (!steps && state === 'loading') return; // again when the steps arrive
    before.current = null;
  }, [on, steps, state, ol, outline]);
  // Outline (Nov 13): a short bulleted outline of the piece by the AI, to read before Steps. Opens above the piece.
  const loadOutline = () => {
    setOlState('loading');
    fetch(`/api/commoutline?ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => { if (d.outline) { outlines.set(refText, d.outline); setOutline(d.outline); setOlState('idle'); } else setOlState('failed'); })
      .catch(() => setOlState('failed'));
  };
  const flipOutline = (e: MouseEvent) => {
    e.stopPropagation();
    before.current = btn.current?.getBoundingClientRect().top ?? null;
    const next = !ol; setOl(next); if (next && !outline && olState !== 'loading') loadOutline();
  };
  return (
    <>
      <div className="steps-btns">
        <button className={`steps-btn ${ol ? 'on' : ''}`} onClick={flipOutline}>{ol ? '• Outline ▴' : '• Outline'}</button>
        <button ref={btn} className={`steps-btn ${on ? 'on' : ''}`} onClick={flip}>{on ? '☰ Steps ▴' : '☰ Steps'}</button>
      </div>
      {ol && (
        <div className="comm-outline" onClick={(e) => e.stopPropagation()}>
          <div className="ai-note left">Outline by AI · AI makes mistakes · check it inside</div>
          {outline ? <Bullets text={outline} className="comm-outline-pts" />
            : olState === 'loading' ? <div className="gist muted"><span className="wait-dots"><span /><span /><span /></span>Making the outline…</div>
            : <div className="gist muted">Couldn’t make the outline just now. <button className="linklike" onClick={(e) => { e.stopPropagation(); loadOutline(); }}>Try again</button></div>}
        </div>
      )}
      {!on ? children
        : steps ? (
          <div className="stepped">
            <div className="ai-note left">Divided, punctuated and explained by AI · AI makes mistakes · the Hebrew words are the meforesh’s own, checked letter by letter</div>
            {steps.map((s, k) => (
              <div key={k} className="stepped-row">
                <div className="stepped-label">{s.label}</div>
                <div className={heClass} dir="rtl">{s.he}</div>
                {s.en && <div className="stepped-en">{s.en}</div>}
              </div>
            ))}
          </div>
        ) : (
          <>
            {state === 'loading' ? <div className="gist muted"><span className="wait-dots"><span /><span /><span /></span>Breaking it into steps…</div>
              : <div className="gist muted">{/one step/.test(why) ? 'This piece is short: a single step.' : 'Couldn’t break this one into steps just now. The original is below, unchanged.'} {!/one step/.test(why) && <button className="linklike" onClick={(e) => { e.stopPropagation(); load(); }}>Try again</button>}</div>}
            {children}
          </>
        )}
    </>
  );
}
