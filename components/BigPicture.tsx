'use client';
// Nov 17: "Big picture" under a line: one tap and the voice tells you where this line stands in the sugya, in about
// half a minute, then stops. A second tap while it speaks stops it. Written and recorded once per line, then free.
import { useState } from 'react';

// One player for the whole page, unlocked by the tap itself (the iPhone only lets sound start from a tap; the
// recording may take a few seconds to be made the first time).
let player: HTMLAudioElement | null = null;
let owner: ((on: boolean) => void) | null = null;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function BigPictureBtn({ lineRef }: { lineRef: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'failed'>('idle');
  const stop = () => { if (player) { player.pause(); player.currentTime = 0; } owner?.(false); owner = null; };
  const go = async () => {
    if (state === 'playing' || state === 'loading') { stop(); setState('idle'); return; }
    stop();
    if (!player) player = new Audio();
    const a = player;
    a.src = SILENT; void a.play().catch(() => {}); // unlock now, during the tap
    const mine = (on: boolean) => setState(on ? 'playing' : 'idle');
    owner = mine;
    setState('loading');
    try {
      const d = await fetch('/api/bigpicture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: lineRef }) }).then((r) => r.json());
      if (!d.url) throw new Error(d.error || 'none');
      if (owner !== mine) return; // another line was asked for meanwhile
      a.src = d.url;
      a.onended = () => { if (owner === mine) { owner = null; setState('idle'); } };
      await a.play();
      setState('playing');
    } catch { if (owner === mine) { owner = null; setState('failed'); window.setTimeout(() => setState('idle'), 2500); } }
  };
  return (
    <button className={`comm-btn ai bp-btn ${state === 'playing' ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); void go(); }} aria-label={state === 'playing' ? 'Stop the big picture' : 'Hear the big picture of this line'}>
      <span className="ai-star">{state === 'loading' ? '…' : state === 'playing' ? '■' : '🔊'}</span> {state === 'failed' ? 'Couldn’t play' : state === 'playing' ? 'Stop' : 'Big picture'}
    </button>
  );
}
