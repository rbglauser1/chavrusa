'use client';
// Nov 17: "Big picture" under a line: one tap and the voice tells you where this line stands in the sugya, in about
// half a minute, then stops. A second tap while it speaks stops it. Written and recorded once per line, then free.
import { useEffect, useState } from 'react';
import { isHebText } from './AiNote';
import { watchVoice } from '@/lib/voiceClip';

// One player for the whole page, unlocked by the tap itself (the iPhone only lets sound start from a tap; the
// recording may take a few seconds to be made the first time).
let player: HTMLAudioElement | null = null;
let owner: ((on: boolean) => void) | null = null;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

// Nov 22: "🎙 Talk about it": after (or while) hearing or reading the big picture, one tap and the live voice picks up the
// conversation from there (it is told what the big picture said, and put on this line). In a call, Big picture is
// given by the live voice itself, not played over it.
const bigText = (lineRef: string): Promise<string> => fetch(`/api/bigpicture?ref=${encodeURIComponent(lineRef)}`).then((r) => r.json()).then((d) => String(d.text ?? '')).catch(() => '');

export function BigPictureBtn({ lineRef, onTalk, liveOn, label = 'Big picture' }: { lineRef: string; onTalk?: (text: string) => void; liveOn?: boolean; label?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'done' | 'failed'>('idle');
  const talk = async () => {
    if (!onTalk) return;
    stop(); setState('loading');
    const t = await bigText(lineRef);
    setState('idle');
    onTalk(t);
  };
  const stop = () => { if (player) { player.pause(); player.currentTime = 0; } owner?.(false); owner = null; };
  const go = async () => {
    if (state === 'playing' || state === 'loading') { stop(); setState('idle'); return; }
    if (liveOn && onTalk) { void talk(); return; } // in a call: the live voice gives it
    stop();
    if (!player) player = new Audio();
    watchVoice(player); // the chavrusa's face talks while it plays (Nov 22)
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
      a.onended = () => { if (owner === mine) { owner = null; setState(onTalk ? 'done' : 'idle'); } };
      await a.play();
      setState('playing');
    } catch { if (owner === mine) { owner = null; setState('failed'); window.setTimeout(() => setState('idle'), 2500); } }
  };
  return (
    <>
      <button className={`comm-btn ai bp-btn ${state === 'playing' ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); void go(); }} aria-label={state === 'playing' ? 'Stop the big picture' : liveOn && onTalk ? 'Your chavrusa gives the big picture of this line' : 'Hear the big picture of this line'}>
        <span className="ai-star">{state === 'loading' ? '…' : state === 'playing' ? '■' : liveOn && onTalk ? '🎙' : '🔊'}</span> {state === 'failed' ? 'Couldn’t play' : state === 'playing' ? 'Stop' : label}
      </button>
      {onTalk && !liveOn && (state === 'playing' || state === 'done') && (
        <button className="comm-btn ai bp-talk" onClick={(e) => { e.stopPropagation(); void talk(); }}><span className="ai-star">🎙</span> Talk about it</button>
      )}
    </>
  );
}

// Nov 17: the same big picture to read: a button that opens a short note under the line (and folds it again).
export function BigPictureTextBtn({ lineRef, onTalk }: { lineRef: string; onTalk?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const go = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (text) return;
    setState('loading');
    fetch(`/api/bigpicture?ref=${encodeURIComponent(lineRef)}`).then((r) => r.json())
      .then((d) => { if (d.text) { setText(d.text); setState('idle'); } else setState('failed'); })
      .catch(() => setState('failed'));
  };
  const he = isHebText(text);
  return (
    <>
      <button className={`comm-btn ai ${open ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); go(); }}><span className="ai-star">✦</span> Big picture</button>
      {open && (
        <div className={`bp-text ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
          <span className="bp-label">✦ Big picture · written by AI</span>
          {state === 'loading' ? <span className="wait-dots"><span /><span /><span /></span> : state === 'failed' ? 'It couldn’t be written just now. Tap again to try.' : text}
          {onTalk && text && state === 'idle' && <button className="bp-talk-in" onClick={(e) => { e.stopPropagation(); onTalk(text); }}>🎙 Talk about it</button>}
        </div>
      )}
    </>
  );
}

// Nov 27: one Big picture, in the line's ✦: the note to read, with 🔊 Hear it and 🎙 Talk about it inside (the two
// separate Big picture buttons under the line are gone).
export function BigPictureBox({ lineRef, onTalk, liveOn }: { lineRef: string; onTalk?: (text: string) => void; liveOn?: boolean }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'loading' | 'idle' | 'failed'>('loading');
  useEffect(() => {
    let gone = false; setState('loading');
    bigText(lineRef).then((t) => { if (gone) return; if (t) { setText(t); setState('idle'); } else setState('failed'); });
    return () => { gone = true; };
  }, [lineRef]);
  const he = isHebText(text);
  return (
    <span className="bp-box">
      <span className="sayit-ex-label">Big picture</span>
      <span className={`sayit-text ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>{state === 'loading' ? <span className="wait-dots"><span /><span /><span /></span> : state === 'failed' ? 'It couldn’t be written just now.' : text}</span>
      <span className="bp-box-row">
        <BigPictureBtn lineRef={lineRef} onTalk={onTalk} liveOn={liveOn} label="Hear it" />
        {onTalk && !liveOn && text && <button className="comm-btn ai bp-talk" onClick={(e) => { e.stopPropagation(); onTalk(text); }}><span className="ai-star">🎙</span> Talk about it</button>}
      </span>
    </span>
  );
}
