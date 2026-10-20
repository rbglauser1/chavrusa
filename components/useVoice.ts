'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Microphone recording (with automatic stop after a pause) and spoken replies.
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking';

const SILENCE_MS = 1200;     // stop after this much quiet once you've started talking
const MAX_MS = 90_000;       // never record longer than this
const LEVEL = 0.01;          // minimum loudness that can count as speech

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

// Split text into speakable sentences. Returns finished sentences and the unfinished remainder.
// The first sentence is allowed to be short so speech starts quickly; later ones are grouped.
export function splitSentences(text: string, final = false): { sentences: string[]; rest: string } {
  const clean = text.replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '');
  const parts: string[] = [];
  const re = /[^.!?…:;\n]+(?:[.!?…:;]+["'”’)\]]*|\n+)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(clean))) { parts.push(m[0]); last = re.lastIndex; }
  let rest = clean.slice(last);
  if (final && rest.trim()) { parts.push(rest); rest = ''; }
  const sentences: string[] = [];
  let cur = '';
  for (const p of parts) {
    cur += p;
    if (cur.trim().length >= 40 || (sentences.length === 0 && cur.trim().length >= 12)) { sentences.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) { if (final) sentences.push(cur.trim()); else rest = cur + rest; }
  return { sentences, rest };
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
  const timers = useRef<{ raf?: number; max?: number; interval?: number }>({});
  const releaseTimer = useRef<number | undefined>(undefined);
  const IDLE_RELEASE_MS = 120_000; // turn the microphone off after 2 minutes unused

  // Keep one microphone stream open and reuse it, so the browser only asks for permission once.
  const releaseMic = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  const scheduleRelease = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => { if (!recRef.current) releaseMic(); }, IDLE_RELEASE_MS);
  }, [releaseMic]);
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
    if (timers.current.interval) clearInterval(timers.current.interval);
    if (timers.current.max) clearTimeout(timers.current.max);
    timers.current = {};
    setLevel(0);
    scheduleRelease();
  }, [scheduleRelease]);

  const listen = useCallback(async () => {
    if (recRef.current) return;
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = undefined; }
    let stream = streamRef.current;
    if (!stream || !stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        optsRef.current.onError('Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.');
        setState('idle');
        return;
      }
      streamRef.current = stream;
    }
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

    // Stop automatically after a pause. The thresholds adapt to the room: we track the background
    // noise level and treat speech as clearly louder than that, and a pause as falling back near it.
    let ctx = ctxRef.current;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) { ctx = new AC(); ctxRef.current = ctx; }
    }
    if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch { /* ignore */ } }
    if (ctx) {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let heard = false, quietSince = 0, smooth = 0, floor = -1, loudest = 0;
      const t0 = Date.now();
      const id = window.setInterval(() => {
        if (rec.state !== 'recording') { clearInterval(id); return; }
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        smooth = smooth ? smooth * 0.7 + rms * 0.3 : rms;
        // Background noise: starts from the first reading, drifts down quickly and up slowly.
        floor = floor < 0 ? smooth : smooth < floor ? floor * 0.8 + smooth * 0.2 : floor * 0.995 + smooth * 0.005;
        loudest = Math.max(loudest, smooth);
        setLevel(Math.min(1, smooth * 12));
        const speakAt = Math.max(LEVEL, floor * 2.5);
        const quietAt = Math.max(LEVEL * 0.5, floor * 1.6, loudest * 0.18);
        const now = Date.now();
        if (smooth > speakAt && now - t0 > 250) { heard = true; quietSince = 0; }
        else if (heard && smooth < quietAt) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince > SILENCE_MS) { clearInterval(id); rec.stop(); }
        } else if (heard) quietSince = 0;
      }, 60);
      timers.current.interval = id;
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

  // ---------- Speaking: a queue of sentences ----------
  // Each sentence is turned into audio as soon as it's queued (in parallel), and played in order,
  // so the first words start while later sentences are still being prepared.
  const queue = useRef<Promise<string | null>[]>([]);
  const playing = useRef(false);
  const ended = useRef(true);          // no more sentences are coming for this reply
  const generation = useRef(0);        // bumps on stop, to cancel anything in flight
  const drainWaiters = useRef<((ok: boolean) => void)[]>([]);
  const hadError = useRef(false);

  const finishDrain = useCallback((ok: boolean) => {
    const w = drainWaiters.current;
    drainWaiters.current = [];
    w.forEach((f) => f(ok));
  }, []);

  const fetchAudio = useCallback(async (text: string, gen: number): Promise<string | null> => {
    try {
      const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sessionId: optsRef.current.sessionId() }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `status ${res.status}`);
      }
      const blob = await res.blob();
      if (gen !== generation.current) return null;
      return URL.createObjectURL(blob);
    } catch (e) {
      if (gen === generation.current && !hadError.current) {
        hadError.current = true;
        optsRef.current.onError(`Could not play the reply: ${(e as Error).message}`);
      }
      return null;
    }
  }, []);

  const playUrl = useCallback((url: string) => new Promise<void>((resolve) => {
    const a = audioEl.current ?? new Audio();
    audioEl.current = a;
    a.src = url;
    const done = () => { speakDone.current = null; URL.revokeObjectURL(url); resolve(); };
    speakDone.current = done;
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  }), []);

  const runQueue = useCallback(async () => {
    if (playing.current) return;
    playing.current = true;
    const gen = generation.current;
    // An open microphone switches phones into call-quality audio, which makes playback crackle.
    if (!recRef.current) releaseMic();
    ctxRef.current?.suspend().catch(() => {});
    setState('speaking');
    while (queue.current.length && gen === generation.current) {
      const url = await queue.current.shift()!;
      if (gen !== generation.current) break;
      if (url) await playUrl(url);
    }
    playing.current = false;
    if (gen !== generation.current) return;
    if (ended.current) {
      setState('idle');
      finishDrain(!hadError.current);
    }
    // If more sentences are still coming, enqueue() restarts the loop.
  }, [finishDrain, playUrl, releaseMic]);

  // Start a new spoken reply (stops anything playing).
  const beginSpeech = useCallback(() => {
    generation.current++;
    if (speakDone.current) { audioEl.current?.pause(); speakDone.current(); }
    queue.current = [];
    playing.current = false;
    ended.current = false;
    hadError.current = false;
    finishDrain(false);
  }, [finishDrain]);

  const enqueue = useCallback((text: string) => {
    const t = text.trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return;
    queue.current.push(fetchAudio(t, generation.current));
    runQueue();
  }, [fetchAudio, runQueue]);

  // No more sentences for this reply. Resolves true when everything has been spoken.
  const endSpeech = useCallback((): Promise<boolean> => {
    ended.current = true;
    return new Promise<boolean>((resolve) => {
      if (!playing.current && queue.current.length === 0) { setState((st) => (st === 'speaking' ? 'idle' : st)); resolve(!hadError.current); return; }
      drainWaiters.current.push(resolve);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    generation.current++;
    queue.current = [];
    playing.current = false;
    ended.current = true;
    const a = audioEl.current;
    if (a) a.pause();
    speakDone.current?.();
    speakDone.current = null;
    finishDrain(false);
    setState((st) => (st === 'speaking' ? 'idle' : st));
  }, [finishDrain]);

  // Speak a whole text at once (used by the Listen button).
  const speak = useCallback(async (text: string): Promise<boolean> => {
    beginSpeech();
    for (const part of splitSentences(text, true).sentences) enqueue(part);
    return endSpeech();
  }, [beginSpeech, enqueue, endSpeech]);

  const stopAll = useCallback(() => { cancelListening(); stopSpeaking(); releaseMic(); }, [cancelListening, stopSpeaking, releaseMic]);

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  return { state, level, supported, unlock, listen, stopListening, cancelListening, speak, beginSpeech, enqueue, endSpeech, stopSpeaking, stopAll };
}
