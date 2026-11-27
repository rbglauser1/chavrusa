'use client';
// Nov 27: ✦ Simple has its own way of showing: a bubble that grows out of the Simple button, right where it is (its top
// at the button, its point on the button; above it instead only when there's no room below). A lit bulb (it flickers
// while the light is coming on), the plain explanation a sentence at a time, and Got it. Tap anywhere around it or go
// Back, and it shrinks back into the button. (First made as a card in the middle of the screen; he wanted
// it at the button.)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isHebText } from './AiNote';

export default function SimplePop({ text, line, from, onClose, onRetry }: {
  text: string | null | 'wait' | 'err'; line?: string; from?: { left: number; top: number; right: number; bottom: number } | null; onClose: () => void; onRetry: () => void;
}) {
  const [going, setGoing] = useState(false);
  const close = () => { if (going) return; setGoing(true); window.setTimeout(onClose, 170); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  // Nov 27: steady under the finger: the place is worked out once, when it opens (the iPhone's bars coming and going no
  // longer move it), there's no swipe-to-close (it fought with scrolling the words), and the page behind doesn't scroll.
  const [box] = useState(() => (typeof window === 'undefined' ? { vw: 390, vh: 800 } : { vw: window.innerWidth, vh: window.innerHeight }));
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (!(e.target as HTMLElement | null)?.closest?.('.smp-text')) e.preventDefault(); };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);
  if (typeof document === 'undefined') return null;
  const { vw, vh } = box;
  const w = Math.min(vw - 20, 380);
  const bx = from ? (from.left + from.right) / 2 : vw / 2;
  const left = Math.min(Math.max(10, bx - 44), vw - w - 10);
  const up = !!from && vh - from.top < 240 && from.bottom > vh - from.top; // no room below: open above, its bottom at the button
  const pos: Record<string, string> = from
    ? up ? { left: `${left}px`, top: 'auto', bottom: `${vh - from.bottom}px`, maxHeight: `${from.bottom - 16}px` } : { left: `${left}px`, top: `${from.top}px`, maxHeight: `${vh - from.top - 16}px` }
    : { left: `${(vw - w) / 2}px`, top: '18vh', maxHeight: '70vh' };
  const tipX = Math.min(Math.max(18, bx - left), w - 18);
  const ready = !!text && text !== 'wait' && text !== 'err';
  const he = ready && isHebText(text as string);
  const parts = ready ? (text as string).split(/(?<=[.!?։׃])\s+(?=\S)/).filter(Boolean) : [];
  return createPortal(
    <div className={`smp-back${going ? ' going' : ''}`} onClick={close} role="presentation">
      <div
        className={`smp${up ? ' up' : ''}${going ? ' going' : ''}`} role="dialog" aria-label="In simple words"
        style={{ ...pos, width: `${w}px`, transformOrigin: `${tipX}px ${up ? '100%' : '0'}`, ['--tip' as string]: `${tipX}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="smp-head">
          <div className={`smp-bulb${ready ? ' lit' : text === 'err' ? '' : ' warming'}`} aria-hidden="true"><span>💡</span></div>
          <div className="smp-kicker">In simple words{line ? <small> · {line}</small> : null}</div>
        </div>
        {text === 'err' ? (
          <p className="smp-msg">It couldn’t explain just now. <button type="button" className="linklike" onClick={onRetry}>Try again</button></p>
        ) : !ready ? (
          <p className="smp-msg muted">Turning on the light…</p>
        ) : (
          <div className={`smp-text${he ? ' he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>
            {parts.map((p, i) => <span key={i} style={{ animationDelay: `${120 + i * 260}ms` }}>{p} </span>)}
          </div>
        )}
        <button type="button" className="smp-got" onClick={close}>Got it ✓</button>
        <div className="ai-note smp-ai">Written by AI · AI makes mistakes · ask your rav</div>
      </div>
    </div>,
    document.body,
  );
}
