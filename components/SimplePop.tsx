'use client';
// Nov 27: ✦ Simple has its own way of showing: not a box under the line and not a sheet from the bottom. A small card
// pops out of the button itself and settles in the middle of the screen, the page dimmed and softly blurred behind it.
// A lit bulb on top (it flickers while the light is coming on), the plain explanation in large type, a sentence at a
// time, and one big "Got it". Tap anywhere around it, swipe it away, or go Back, and it folds back into the button.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isHebText } from './AiNote';

export default function SimplePop({ text, line, from, onClose, onRetry }: {
  text: string | null | 'wait' | 'err'; line?: string; from?: { x: number; y: number } | null; onClose: () => void; onRetry: () => void;
}) {
  const [going, setGoing] = useState(false);
  const close = () => { if (going) return; setGoing(true); window.setTimeout(onClose, 170); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const sw = useRef<{ y: number; x: number } | null>(null);
  const [drag, setDrag] = useState(0);
  if (typeof document === 'undefined') return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const dx = from ? from.x - vw / 2 : 0, dy = from ? from.y - vh / 2 : 0;
  const ready = !!text && text !== 'wait' && text !== 'err';
  const he = ready && isHebText(text as string);
  const parts = ready ? (text as string).split(/(?<=[.!?։׃])\s+(?=\S)/).filter(Boolean) : [];
  return createPortal(
    <div className={`smp-back${going ? ' going' : ''}`} onClick={close} role="presentation">
      <div
        className={`smp${going ? ' going' : ''}`} role="dialog" aria-label="In simple words"
        style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, ...(drag ? { transform: `translate(-50%, calc(-50% + ${drag}px))`, opacity: Math.max(0.3, 1 - Math.abs(drag) / 260), transition: 'none', animation: 'none' } : {}) }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { sw.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }; }}
        onTouchMove={(e) => { const s = sw.current; if (!s) return; const d = e.touches[0].clientY - s.y; if (Math.abs(d) > 8 && Math.abs(d) > Math.abs(e.touches[0].clientX - s.x)) setDrag(d); }}
        onTouchEnd={() => { const d = drag; sw.current = null; setDrag(0); if (Math.abs(d) > 90) close(); }}
      >
        <div className={`smp-bulb${ready ? ' lit' : text === 'err' ? '' : ' warming'}`} aria-hidden="true"><span>💡</span></div>
        <div className="smp-kicker">In simple words{line ? <small> · {line}</small> : null}</div>
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
