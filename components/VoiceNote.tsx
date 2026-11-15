'use client';
// Voice notes (Nov 14): 🎤 Record in a note box. Speak; ■ Stop; the recording is kept and written out in words, which
// appear in the box to read or fix; Save keeps both. In the Notebook and on the line, ▶ plays it.
import { useEffect, useRef, useState } from 'react';

export function VoiceRecord({ onDone }: { onDone: (audio: string, text: string) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'sending' | 'error'>('idle');
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);
  async function start() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); void send(new Blob(chunks.current, { type: r.mimeType || type || 'audio/mp4' })); };
      r.start(1000);
      rec.current = r; started.current = Date.now(); setSecs(0); setState('rec');
      timer.current = window.setInterval(() => { const s = Math.round((Date.now() - started.current) / 1000); setSecs(s); if (s >= 900) stop(); }, 500);
    } catch { setErr('The microphone is not available. Allow it for this app in your phone’s settings.'); setState('error'); }
  }
  function stop() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (rec.current && rec.current.state !== 'inactive') { setState('sending'); rec.current.stop(); }
  }
  async function send(blob: Blob) {
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'note');
      fd.append('seconds', String(Math.round((Date.now() - started.current) / 1000)));
      const d = await fetch('/api/notes/voice', { method: 'POST', body: fd }).then((r) => r.json());
      if (!d.audio) throw new Error(d.error || 'The recording could not be saved.');
      onDone(d.audio, d.text ?? ''); setState('idle');
    } catch (e) { setErr((e as Error).message); setState('error'); }
  }
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <span className="vn-rec">
      {state === 'rec' ? <button type="button" className="btn vn-stop" onClick={stop}>■ Stop · {mm}</button>
        : state === 'sending' ? <span className="muted"><span className="wait-dots"><span /><span /><span /></span>Saving the recording…</span>
        : <button type="button" className="btn ghost vn-start" onClick={() => void start()}>🎤 Record</button>}
      {err && <span className="muted vn-err">{err}</span>}
    </span>
  );
}

export function VoicePlay({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = async () => {
    try { const d = await fetch(`/api/notes/voice?path=${encodeURIComponent(path)}`).then((r) => r.json()); if (d.url) setUrl(d.url); else setErr(d.error || 'Can’t play it just now.'); }
    catch { setErr('Can’t play it just now.'); }
  };
  if (url) return <audio className="vn-audio" src={url} controls autoPlay onClick={(e) => e.stopPropagation()} />;
  return <span className="vn-play"><button type="button" className="linklike" onClick={(e) => { e.stopPropagation(); void load(); }}>▶ Play the voice note</button>{err && <span className="muted"> {err}</span>}</span>;
}
