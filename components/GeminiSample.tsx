'use client';
// Gemini Live, a test (Settings → Voice): pick one of its male voices and hear a short sample, before anything else
// is built. It doesn't change the voice the app uses for calls.
import { useRef, useState } from 'react';
import { GEMINI_VOICES } from '@/lib/config';

export default function GeminiSample() {
  const [voice, setVoice] = useState(GEMINI_VOICES[0].id);
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [msg, setMsg] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  async function play() {
    if (state === 'playing') { audio.current?.pause(); setState('idle'); return; }
    setMsg(''); setState('loading');
    try {
      const r = await fetch(`/api/gemini/sample?voice=${encodeURIComponent(voice)}`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error ?? 'Could not get a sample.'); setState('idle'); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => { setState('idle'); URL.revokeObjectURL(url); };
      a.onerror = () => { setState('idle'); setMsg('Could not play the sample.'); };
      await a.play();
      setState('playing');
    } catch (e) { setMsg((e as Error).message); setState('idle'); }
  }
  return (
    <div className="field">
      <label>Gemini Live (test: hear it next to your current voice)</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={voice} onChange={(e) => { setVoice(e.target.value); setMsg(''); }} style={{ flex: 1 }}>
          {GEMINI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className="btn" onClick={play} disabled={state === 'loading'}>{state === 'loading' ? 'Preparing…' : state === 'playing' ? '■ Stop' : '▶ Hear'}</button>
      </div>
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Google&apos;s Gemini 3.8 Live Extended Thinking, saying a short line with a few yeshivish words. Each voice&apos;s sample costs about a cent the first time, then it&apos;s kept. This is only a sample: your calls still use your current voice.</div>
    </div>
  );
}
