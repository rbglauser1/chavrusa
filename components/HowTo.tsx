'use client';
// The how-to movie (see lib/howto.ts): scenes play one after another with a caption, like a short film, and Meridian
// narrates each one. Tap ‹ › to move, the middle button to pause, ✕ to close. The last scene stays, with
// "Start learning".
//
// The narration: the first time a scene plays (on any device), Meridian says its line live (a short GPT-Live test
// session, about 15 seconds billed) and the app records it and keeps it (app/api/howto). After that every device plays
// the saved recording: no voice call and no cost. A scene moves on only when its narration has finished.
import { useEffect, useRef, useState } from 'react';
import { HOWTO_SCENES, HOWTO_SEEN_KEY, narrationOf, narrationVersion } from '@/lib/howto';

// One player for the narration, unlocked inside a tap (phones only allow sound that a tap began).
let narrEl: HTMLAudioElement | null = null;
let unlocked = false;
function silence(): string {
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
/** Call inside a tap, before the movie opens, so it can speak. */
export function unlockNarration() {
  if (typeof window === 'undefined') return;
  if (!narrEl) { narrEl = document.createElement('audio'); narrEl.setAttribute('playsinline', ''); narrEl.style.display = 'none'; document.body.appendChild(narrEl); }
  narrEl.srcObject = null;
  narrEl.src = silence();
  narrEl.play().then(() => { unlocked = true; }).catch(() => {});
  unlocked = true;
}

type Speaker = { stop: () => void };

// Say scene i's line: the saved recording if there is one, else live in Meridian (recording it to keep).
function speak(i: number, have: Set<number>, v: string, done: () => void): Speaker {
  const el = narrEl!;
  let over = false;
  const finish = () => { if (!over) { over = true; done(); } };
  if (have.has(i)) {
    el.srcObject = null;
    el.src = `/api/howto?v=${v}&i=${i}`;
    el.onended = finish;
    el.onerror = finish;
    el.play().catch(finish);
    return { stop: () => { over = true; el.onended = null; el.onerror = null; el.pause(); } };
  }
  // Live, recorded once.
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const osc = ctx.createOscillator(), gn = ctx.createGain(); gn.gain.value = 0;
  const dest = ctx.createMediaStreamDestination(); osc.connect(gn).connect(dest); osc.start();
  const pc = new RTCPeerConnection();
  dest.stream.getAudioTracks().forEach((t) => pc.addTrack(t, dest.stream));
  const dc = pc.createDataChannel('oai-events');
  let rec: MediaRecorder | null = null;
  const parts: Blob[] = [];
  const type = typeof MediaRecorder !== 'undefined' ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) : undefined;
  let said = '', lastWord = 0, cut = false;
  const started = Date.now();
  pc.ontrack = (ev) => {
    el.onended = null; el.removeAttribute('src'); el.srcObject = ev.streams[0]; el.play().catch(() => {});
    if (type) { try { rec = new MediaRecorder(ev.streams[0], { mimeType: type }); rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); }; rec.start(); } catch { rec = null; } }
  };
  dc.onmessage = (m) => {
    try { const e = JSON.parse(m.data); if (e.type === 'session.output_transcript.delta' && e.delta) { said += e.delta; lastWord = Date.now(); } } catch { /* ignore */ }
  };
  const close = () => {
    clearInterval(watch);
    try { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'session.close' })); } catch { /* ignore */ }
    setTimeout(() => { try { pc.close(); } catch { /* ignore */ } try { osc.stop(); void ctx.close(); } catch { /* ignore */ } }, 300);
    fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: Math.max(15, (Date.now() - started) / 1000) }) }).catch(() => {});
  };
  // Done a moment after the last word (or after 30 seconds at most); keep the recording only if it was heard whole.
  const watch = window.setInterval(() => {
    if ((lastWord && Date.now() - lastWord > 1800) || Date.now() - started > 30_000) {
      close();
      const keep = !cut && said.trim().split(/\s+/).length >= 3 && Date.now() - started <= 30_000;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = () => {
          if (keep && parts.length && type) {
            const blob = new Blob(parts, { type: type.split(';')[0] });
            fetch(`/api/howto?v=${v}&i=${i}&ext=${type.includes('mp4') ? 'mp4' : 'webm'}`, { method: 'POST', body: blob }).catch(() => {});
          }
        };
        rec.stop();
      }
      finish();
    }
  }, 300);
  (async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const q = new URLSearchParams({ preview: '1', narrate: '1', voice: 'meridian', say: narrationOf(HOWTO_SCENES[i]) });
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) throw new Error(d.error ?? 'no voice');
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch { cut = true; close(); finish(); }
  })();
  return { stop: () => { over = true; cut = true; close(); try { rec?.stop(); } catch { /* ignore */ } el.pause(); el.srcObject = null; } };
}

export function HowTo({ onClose, onStart }: { onClose: () => void; onStart?: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(unlocked); // opened by a tap: with sound; opened by itself: silent until asked
  const [timeUp, setTimeUp] = useState(false);
  const [voiceDone, setVoiceDone] = useState(true);
  const leftRef = useRef(HOWTO_SCENES[0].dur * 1000); // ms left in this scene (kept across a pause)
  const shownI = useRef(0);
  const have = useRef<Set<number> | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const v = useRef(narrationVersion()).current;
  const scene = HOWTO_SCENES[i];
  const last = i === HOWTO_SCENES.length - 1;

  useEffect(() => { try { localStorage.setItem(HOWTO_SEEN_KEY, '1'); } catch { /* ignore */ } }, []);
  // Which scenes already have a saved narration.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch(`/api/howto?v=${v}`).then((r) => r.json()).then((d) => { have.current = new Set(Array.isArray(d.have) ? d.have : []); }).catch(() => { have.current = new Set(); }).finally(() => setReady(true));
  }, [v]);

  // The clock: runs only while playing; a new scene starts it from the top.
  useEffect(() => {
    if (shownI.current !== i) { shownI.current = i; leftRef.current = HOWTO_SCENES[i].dur * 1000; setTimeUp(false); }
    if (paused || !HOWTO_SCENES[i].dur) return;
    const began = Date.now(), had = leftRef.current;
    const t = window.setTimeout(() => setTimeUp(true), had);
    return () => { window.clearTimeout(t); leftRef.current = Math.max(0, had - (Date.now() - began)); };
  }, [paused, i]);

  // The narration: each scene's line once, from the top of the scene (or when sound is turned on).
  useEffect(() => {
    if (!sound || !ready || !narrEl) { setVoiceDone(true); return; }
    setVoiceDone(false);
    const sp = speak(i, have.current ?? new Set(), v, () => setVoiceDone(true));
    speaker.current = sp;
    return () => { sp.stop(); speaker.current = null; };
  }, [i, sound, ready, v]);
  // Pause holds a saved recording too (a live one just finishes its sentence).
  useEffect(() => { if (narrEl && narrEl.src && !narrEl.srcObject) { if (paused) narrEl.pause(); else if (sound && !voiceDone) narrEl.play().catch(() => {}); } }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Next scene when both the time and the narration are done.
  useEffect(() => {
    if (timeUp && voiceDone && !paused && !last) { const t = window.setTimeout(() => setI((n) => Math.min(n + 1, HOWTO_SCENES.length - 1)), 500); return () => window.clearTimeout(t); }
  }, [timeUp, voiceDone, paused, last]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, HOWTO_SCENES.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
      if (e.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); speaker.current?.stop(); };
  }, [onClose]);

  const go = (n: number) => { setPaused(false); setI(Math.max(0, Math.min(n, HOWTO_SCENES.length - 1))); };
  const soundOn = () => { unlockNarration(); setSound(true); };

  return (
    <div className="ht" role="dialog" aria-modal="true" aria-label="How to use the app">
      <div className="ht-bars" aria-hidden="true">
        {HOWTO_SCENES.map((s, n) => (
          <span key={n} className={`ht-bar ${n < i ? 'done' : n === i ? 'now' : ''}`}>
            <i key={`${n}-${i}`} style={n === i && s.dur ? { animationDuration: `${s.dur}s`, animationPlayState: paused ? 'paused' : 'running' } : undefined} />
          </span>
        ))}
      </div>
      <button className="ht-x" onClick={onClose} aria-label="Close">×</button>

      <div className="ht-cap" key={`c${i}`}>
        <h2>{scene.caption}</h2>
        <p>{scene.sub}</p>
      </div>

      <div className={`ht-stage ${paused ? 'paused' : ''}`} onClick={() => !last && setPaused((p) => !p)}>
        <div key={i} className="ht-scene" dangerouslySetInnerHTML={{ __html: scene.html }} />
        {paused && <div className="ht-paused">Paused · tap to play</div>}
      </div>

      <div className="ht-ctrl">
        <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back">‹</button>
        {last ? (
          <>
            <button className="ht-again" onClick={() => go(0)}>Watch again</button>
            <button className="ht-start" onClick={() => { onClose(); onStart?.(); }}>Start learning</button>
          </>
        ) : (
          <button className="ht-play" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
        )}
        <button onClick={() => go(i + 1)} disabled={last} aria-label="Next">›</button>
      </div>
      <button className="ht-sound" onClick={() => (sound ? setSound(false) : soundOn())}>{sound ? 'Sound: on' : 'Turn the sound on'}</button>
    </div>
  );
}

/** Whether the movie has been seen on this device (it opens by itself once, the first time). */
export function howToSeen(): boolean {
  try { return localStorage.getItem(HOWTO_SEEN_KEY) === '1'; } catch { return true; }
}
