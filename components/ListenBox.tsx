'use client';
// "Listen" at the top of the Sefer (Settings → Extras → Listen to the daf): a spoken overview of the amud / perek,
// eight to ten minutes, for the car. The first time, it is written and recorded (about a minute; about 20¢); after
// that it is kept, and plays at once, free (app/api/listen).
import { useEffect, useRef, useState } from 'react';

const SPEEDS = [1, 1.25, 1.5];

export default function ListenBox({ refText, heRef, onClose }: { refText: string; heRef?: string; onClose: () => void }) {
  const [state, setState] = useState<'checking' | 'none' | 'making' | 'ready' | 'failed'>('checking');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [speed, setSpeed] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let gone = false;
    setState('checking'); setUrl('');
    fetch(`/api/listen?ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => { if (gone) return; if (d.ready && d.url) { setUrl(d.url); setState('ready'); } else setState('none'); })
      .catch(() => { if (!gone) setState('none'); });
    return () => { gone = true; };
  }, [refText]);
  const make = async () => {
    setState('making'); setErr('');
    try {
      const r = await fetch('/api/listen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refText }) });
      const d = await r.json();
      if (!d.url) throw new Error(d.error || 'The recording couldn’t be made.');
      setUrl(d.url); setState('ready');
    } catch (e) { setErr((e as Error).message); setState('failed'); }
  };
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed, url]);
  // The lock screen and the car show what is playing.
  useEffect(() => {
    if (state !== 'ready' || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: `${refText}: the daf in ten minutes`, artist: 'Chavrusa', album: heRef ?? refText }); } catch { /* optional */ }
  }, [state, refText, heRef]);
  return (
    <div className="comm listenbox" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">🎧 Listen · {refText}<button className="comm-x" aria-label="Close" onClick={onClose}>✕</button></div>
      {state === 'checking' && <div className="muted">Looking for the recording…</div>}
      {state === 'none' && (
        <>
          <div className="ai-note left">Written and read by AI · AI makes mistakes</div>
          <p className="listen-what">A spoken overview of this {/\d[ab]$/.test(refText) ? 'amud' : 'perek'}, about eight to ten minutes, to hear in the car or on a walk. It is made once (about a minute, about 20¢) and then kept: after that it plays at once, free.</p>
          <button className="btn primary" onClick={() => void make()}>Make the recording</button>
        </>
      )}
      {state === 'making' && <div className="muted">Writing the talk and recording it… about a minute. You can keep learning; it will be here when it’s ready.</div>}
      {state === 'failed' && <div className="muted">{err} <button className="linklike" onClick={() => void make()}>Try again</button></div>}
      {state === 'ready' && (
        <>
          <div className="ai-note left">Written and read by AI · AI makes mistakes · an overview, not a replacement for learning inside</div>
          <audio ref={audio} className="listen-audio" src={url} controls preload="metadata" />
          <div className="listen-speeds">Speed{SPEEDS.map((x) => <button key={x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)}>{x}×</button>)}</div>
        </>
      )}
    </div>
  );
}
