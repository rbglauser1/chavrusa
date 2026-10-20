'use client';
import { useRef, useState } from 'react';
import { VOICE_SAMPLE } from '@/lib/config';
import { silentWav } from './useVoice';

// A list of voices, each with a play button to hear a short sample before choosing.
// kind "basic": a sample from the text-to-speech voice (costs a fraction of a cent).
// kind "live": a 10-second Live connection that greets you (billed as about 15 seconds, roughly 1 cent).
export function VoicePicker({ kind, voices, value, onPick, disabled }: {
  kind: 'basic' | 'live';
  voices: { id: string; name: string }[];
  value: string;
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const cache = useRef<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(null);
  }

  async function playBasic(id: string) {
    let url = cache.current[id];
    if (!url) {
      const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: VOICE_SAMPLE, voice: id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Sample failed');
      url = URL.createObjectURL(await res.blob());
      cache.current[id] = url;
    }
    const a = audio.current ?? blessPlayer();
    a.srcObject = null;
    a.src = url;
    stopRef.current = () => a.pause();
    a.onended = () => setPlaying(null);
    await a.play();
  }

  async function playLive(id: string) {
    const pc = new RTCPeerConnection();
    // GPT-Live only speaks while it is receiving input audio, so send it a silent track (no microphone needed).
    const ctx = ctxRef.current;
    let silent: MediaStream | null = null;
    if (ctx) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(g).connect(dest);
      osc.start();
      const stream = dest.stream;
      silent = stream;
      stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }
    const dc = pc.createDataChannel('oai-events');
    const el = audio.current ?? blessPlayer(); // the player already unlocked during the tap
    el.autoplay = true;
    pc.ontrack = (ev) => { el.removeAttribute('src'); el.srcObject = ev.streams[0]; el.play().catch(() => setMsg('Your phone blocked the sound. Tap ▶ Hear again.')); };
    const started = Date.now();
    let ended = false;
    let said = '';
    const end = () => {
      if (ended) return;
      ended = true;
      try { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'session.close', event_id: `evt_${Date.now()}` })); } catch { /* ignore */ }
      setTimeout(() => { try { pc.close(); } catch { /* ignore */ } el.pause(); el.srcObject = null; silent?.getTracks().forEach((t) => t.stop()); }, 300);
      const secs = Math.max(15, (Date.now() - started) / 1000); // a Live session bills at least 15 seconds
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: secs }) }).catch(() => {});
      if (!said) setMsg('The Live voice connected but didn\'t speak. Try it in a real call: pick it and tap Talk.');
      setPlaying((p) => (p === id ? null : p));
    };
    stopRef.current = end;
    dc.onopen = () => {
      // Ask it to speak now, without waiting for the user.
      dc.send(JSON.stringify({ type: 'session.commentary.append', event_id: `greet_${Date.now()}`, delegation_id: null, content: `Say exactly this now: "${VOICE_SAMPLE}"` }));
    };
    dc.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'session.output_transcript.delta' && e.delta) { said += e.delta; setMsg(`♪ ${said}`); }
        if (e.type === 'error' || e.type === 'session.error') setMsg(`Live voice: ${e.error?.message ?? e.message ?? 'error'}`);
      } catch { /* ignore */ }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(`/api/live/session?voice=${encodeURIComponent(id)}&preview=1`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.sdp) { said = 'x'; end(); throw new Error(d.error ?? 'Sample failed'); }
    await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    setTimeout(end, 12_000);
  }

  // iPhones only allow sound that starts during a tap. Play a moment of silence right now, inside the tap,
  // on the same player the sample will use, so the real sample is allowed to play when it arrives.
  function blessPlayer(): HTMLAudioElement {
    let a = audio.current;
    if (!a) {
      a = document.createElement('audio');
      a.setAttribute('playsinline', '');
      a.style.display = 'none';
      document.body.appendChild(a);
      audio.current = a;
    }
    a.srcObject = null;
    a.src = silentWav();
    a.play().catch(() => {});
    // Also start (inside the tap) the small sound engine used to feed silence to Live samples.
    if (kind === 'live') {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current ??= new AC();
        void ctxRef.current.resume();
      } catch { /* optional */ }
    }
    return a;
  }

  async function play(id: string) {
    if (playing === id) { stop(); return; }
    stop();
    setMsg('');
    blessPlayer();
    setPlaying(id);
    try { await (kind === 'basic' ? playBasic(id) : playLive(id)); }
    catch (e) { setMsg((e as Error).message); setPlaying(null); }
  }

  return (
    <div className="voice-list" role="radiogroup">
      {voices.map((v) => (
        <div key={v.id} className={`voice-row ${value === v.id ? 'on' : ''}`}>
          <button className="voice-pick" role="radio" aria-checked={value === v.id} onClick={() => onPick(v.id)}>
            <span className="dot" aria-hidden="true" />{v.name}
          </button>
          <button className="voice-play" onClick={() => play(v.id)} disabled={disabled} aria-label={playing === v.id ? `Stop ${v.name}` : `Hear ${v.name}`}>
            {playing === v.id ? '■ Stop' : '▶ Hear'}
          </button>
        </div>
      ))}
      {disabled && <div className="muted" style={{ fontSize: 12 }}>End the current call to hear samples.</div>}
      {msg && <div className="goto-msg" style={{ padding: 0 }}>{msg}</div>}
    </div>
  );
}
