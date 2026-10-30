'use client';
// Gemini Live, a test (Settings → Voice): pick one of its male voices and hear a short sample, before anything else
// is built. It doesn't change the voice the app uses for calls.
// iPhone Safari only lets sound start on a tap, and the sample takes a few seconds to arrive, so the tap first
// "unlocks" the player with a moment of silence; if Safari still says no, the button becomes "▶ Play" (one more tap).
import { useRef, useState } from 'react';
import { GEMINI_VOICES } from '@/lib/config';

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=';

export default function GeminiSample({ value, onPick }: { value?: string; onPick?: (id: string) => void }) {
  const [voiceLocal, setVoiceLocal] = useState(GEMINI_VOICES[0].id);
  const voice = value && GEMINI_VOICES.some((v) => v.id === value) ? value : voiceLocal;
  const setVoice = (id: string) => { setVoiceLocal(id); onPick?.(id); };
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'playing'>('idle');
  const [msg, setMsg] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<Record<string, string>>({}); // samples already fetched on this visit

  const player = () => (audio.current ??= new Audio());
  function playNow(url: string) {
    const a = player();
    a.onended = () => setState('idle');
    a.onerror = () => { setState('idle'); setMsg('Could not play the sample.'); };
    a.src = url;
    return a.play().then(() => setState('playing'));
  }

  async function tap() {
    setMsg('');
    if (state === 'playing') { audio.current?.pause(); setState('idle'); return; }
    if (state === 'ready' && urls.current[voice]) { void playNow(urls.current[voice]).catch(() => setMsg('Safari blocked the sound. Check that silent mode is off, then tap ▶ Play again.')); return; }
    // Unlock the player inside the tap (a moment of silence), so the real sample may play when it arrives.
    const a = player();
    a.src = SILENCE;
    a.play().catch(() => {});
    if (urls.current[voice]) { void playNow(urls.current[voice]).catch(() => setState('ready')); return; }
    setState('loading');
    try {
      const r = await fetch(`/api/gemini/sample?voice=${encodeURIComponent(voice)}`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error ?? 'Could not get a sample.'); setState('idle'); return; }
      const url = URL.createObjectURL(await r.blob());
      urls.current[voice] = url;
      await playNow(url).catch(() => setState('ready')); // blocked: one more tap plays it
    } catch (e) { setMsg((e as Error).message); setState('idle'); }
  }

  return (
    <div className="field">
      <label>Gemini voice (tap ▶ to hear it)</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={voice} onChange={(e) => { setVoice(e.target.value); setMsg(''); setState('idle'); audio.current?.pause(); }} style={{ flex: 1 }}>
          {GEMINI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className={`btn ${state === 'ready' ? 'primary' : ''}`} onClick={tap} disabled={state === 'loading'}>
          {state === 'loading' ? 'Preparing…' : state === 'playing' ? '■ Stop' : state === 'ready' ? '▶ Play' : '▶ Hear'}
        </button>
      </div>
      {state === 'ready' && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The sample is ready. Tap ▶ Play.</div>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Google&apos;s Gemini 3.8 Live Extended Thinking, in its natural voice (no accent or style added), reading a short line with a few yeshivish words. Each voice&apos;s sample costs about a cent the first time, then it&apos;s kept. The voice chosen here is the one Gemini calls use.</div>
    </div>
  );
}
