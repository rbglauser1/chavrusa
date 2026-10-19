'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Microphone recording (with automatic stop after a pause) and spoken replies.
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking';

const SILENCE_MS = 1600;     // stop after this much quiet once you've started talking
const MAX_MS = 90_000;       // never record longer than this
const LEVEL = 0.018;         // loudness that counts as speech

// A valid, very short silent WAV, used to unlock audio playback on phones.
function silentWav(): string {
  const samples = 800, rate = 8000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const m of options) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

export function useVoice(opts: { onText: (text: string) => void; onError: (msg: string) => void; sessionId: () => string | null }) {
  const [state, setState] = useState<VoiceState>('idle');
  const [level, setLevel] = useState(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const audioEl = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timers = useRef<{ raf?: number; max?: number }>({});
  const speakDone = useRef<(() => void) | null>(null);

  useEffect(() => {
    audioEl.current = new Audio();
    return () => { stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Must run inside a tap: lets the phone play audio later without another tap.
  const unlock = useCallback(() => {
    try {
      const a = audioEl.current;
      // Play a moment of silence inside the tap so the phone allows the real reply to play later.
      if (a && !a.dataset.unlocked && !speakDone.current) {
        a.dataset.unlocked = '1';
        a.src = silentWav();
        a.play().catch(() => { delete a.dataset.unlocked; });
      }
      if (!ctxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AC) ctxRef.current = new AC();
      }
      ctxRef.current?.resume().catch(() => {});
    } catch { /* ignore */ }
  }, []);

  const cleanupRecording = useCallback(() => {
    if (timers.current.raf) cancelAnimationFrame(timers.current.raf);
    if (timers.current.max) clearTimeout(timers.current.max);
    timers.current = {};
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  const listen = useCallback(async () => {
    if (recRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      optsRef.current.onError('Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.');
      setState('idle');
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      recRef.current = null;
      cleanupRecording();
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      const seconds = (Date.now() - started) / 1000;
      if (blob.size < 2000) { setState('idle'); return; }
      setState('transcribing');
      try {
        const fd = new FormData();
        fd.append('audio', blob);
        fd.append('seconds', String(seconds));
        const sid = optsRef.current.sessionId();
        if (sid) fd.append('sessionId', sid);
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const data = await res.json();
        setState('idle');
        if (data.error) optsRef.current.onError(data.error);
        else if (data.text) optsRef.current.onText(data.text);
      } catch (e) {
        setState('idle');
        optsRef.current.onError(`Could not send your recording: ${(e as Error).message}`);
      }
    };
    recRef.current = rec;
    rec.start(250);
    setState('listening');

    // Stop automatically after a pause in speech.
    const ctx = ctxRef.current;
    if (ctx) {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let heard = false, quietSince = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 12));
        const now = Date.now();
        if (rms > LEVEL) { heard = true; quietSince = 0; }
        else if (heard) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince > SILENCE_MS) { if (rec.state === 'recording') rec.stop(); return; }
        }
        timers.current.raf = requestAnimationFrame(tick);
      };
      timers.current.raf = requestAnimationFrame(tick);
    }
    timers.current.max = window.setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, MAX_MS);
  }, [cleanupRecording]);

  const stopListening = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }, []);

  const cancelListening = useCallback(() => {
    const rec = recRef.current;
    if (rec) { rec.ondataavailable = null; rec.onstop = null; if (rec.state === 'recording') rec.stop(); recRef.current = null; }
    cleanupRecording();
    setState('idle');
  }, [cleanupRecording]);

  const stopSpeaking = useCallback(() => {
    const a = audioEl.current;
    if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
    speakDone.current?.();
    speakDone.current = null;
    setState((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  // Resolves when the speech finishes (or is stopped). Returns false if it could not play.
  const speak = useCallback(async (text: string): Promise<boolean> => {
    // Finish any earlier reply, but keep the same audio element (resetting it would undo the phone's permission).
    if (speakDone.current) { audioEl.current?.pause(); speakDone.current(); speakDone.current = null; }
    setState('speaking');
    try {
      const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sessionId: optsRef.current.sessionId() }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `status ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = audioEl.current ?? new Audio();
      audioEl.current = a;
      a.src = url;
      await new Promise<void>((resolve, reject) => {
        speakDone.current = resolve;
        a.onended = () => resolve();
        a.onerror = () => reject(new Error('The audio could not play.'));
        a.play().catch(reject);
      });
      URL.revokeObjectURL(url);
      speakDone.current = null;
      setState('idle');
      return true;
    } catch (e) {
      setState('idle');
      optsRef.current.onError(`Could not play the reply: ${(e as Error).message}`);
      return false;
    }
  }, [stopSpeaking]);

  const stopAll = useCallback(() => { cancelListening(); stopSpeaking(); }, [cancelListening, stopSpeaking]);

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  return { state, level, supported, unlock, listen, stopListening, cancelListening, speak, stopSpeaking, stopAll };
}
