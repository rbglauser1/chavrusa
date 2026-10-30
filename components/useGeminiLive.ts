'use client';
// Gemini Live (a test, side by side with GPT-Live; Settings → Voice → Live voice).
// The same job as useLive, with the same controls, so the rest of the app doesn't care which voice is talking:
// the phone talks to Google directly over a WebSocket (with a short-lived pass from our server), streams the
// microphone, plays Gemini's voice, and hands every learning turn to the Chavrusa brain through one tool
// (ask_backend). The brain's answer goes back as the tool's result, for Gemini to say.
import { useCallback, useEffect, useRef, useState } from 'react';
import { namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';
import { splitPieces } from '@/lib/pieces';
import type { LiveState, useLive } from './useLive';

type Opts = Parameters<typeof useLive>[0];
const toSpeech = (he: string) => yeshivishTranslit(namesForSpeech(he), false);
function forSpeech(text: string): string {
  return text.replace(/\[\[\/?say\]\]/gi, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
}
// Captures the microphone in small blocks, for sending to Gemini.
const WORKLET = `class Cap extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch && ch.length) this.port.postMessage(ch.slice(0)); return true; } } registerProcessor('chavrusa-cap', Cap);`;

function b64FromBytes(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}
function bytesFromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

type Seg = { kind: 'exact' | 'say'; text: string };

export function useGeminiLive(opts: Opts) {
  const [state, setState] = useState<LiveState>('off');
  const [heard, setHeard] = useState('');
  const [pauseIn, setPauseIn] = useState<number | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stateRef = useRef<LiveState>('off');
  const setS = (s: LiveState) => { stateRef.current = s; setState(s); };

  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const capNode = useRef<AudioWorkletNode | null>(null);
  const playing = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAt = useRef(0);
  const pending = useRef<Map<string, Seg[]>>(new Map()); // tool calls waiting for the brain
  const userBuf = useRef('');
  const voiceBuf = useRef('');
  const answering = useRef(false);
  const startedAt = useRef(0);
  const lastActivity = useRef(0);
  const closingTo = useRef<'off' | 'paused' | null>(null);
  const reading = useRef<((done: boolean) => void) | null>(null);
  const turnDone = useRef(false);
  const lastHeardPaint = useRef(0);
  const wake = useRef<{ stream: MediaStream; ctx: AudioContext; timer: number } | null>(null);
  const startWakeRef = useRef<(() => void) | null>(null);
  const bump = () => { lastActivity.current = Date.now(); };

  const send = useCallback((obj: Record<string, unknown>) => {
    const w = ws.current;
    if (w && w.readyState === WebSocket.OPEN) w.send(JSON.stringify(obj));
  }, []);
  // A message from the app (not the learner): what to do now.
  const appSay = useCallback((text: string) => {
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[APP] ${text}` }] }], turnComplete: true } });
  }, [send]);

  const stopPlayback = useCallback(() => {
    playing.current.forEach((s) => { try { s.stop(); } catch { /* ignore */ } });
    playing.current.clear();
    nextAt.current = 0;
  }, []);

  // When the voice has finished a turn and its audio has played out: record a reply it made by itself, finish a read-through.
  const afterTurn = useCallback(() => {
    if (playing.current.size) return; // still playing; checked again when the audio ends
    if (!turnDone.current) return;
    turnDone.current = false;
    if (stateRef.current === 'speaking') setS(pending.current.size ? 'thinking' : 'listening');
    if (!pending.current.size && !answering.current && voiceBuf.current.trim()) {
      const learner = userBuf.current.trim(), said = voiceBuf.current.trim();
      userBuf.current = ''; voiceBuf.current = ''; setHeard('');
      optsRef.current.onAside?.(learner, said);
    }
    if (!pending.current.size) answering.current = false;
    voiceBuf.current = '';
    const r = reading.current;
    if (r) { reading.current = null; r(true); }
  }, []);

  const playPcm = useCallback((b64: string) => {
    const ac = ctx.current;
    if (!ac) return;
    const bytes = bytesFromB64(b64);
    const n = Math.floor(bytes.length / 2);
    if (!n) return;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const buf = ac.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    const at = Math.max(ac.currentTime + 0.02, nextAt.current);
    src.start(at);
    nextAt.current = at + buf.duration;
    playing.current.add(src);
    src.onended = () => { playing.current.delete(src); if (!playing.current.size) { nextAt.current = 0; afterTurn(); } };
    bump();
    if (stateRef.current !== 'speaking') setS('speaking');
  }, [afterTurn]);

  const teardown = useCallback(() => {
    ready.current = false;
    try { ws.current?.close(); } catch { /* ignore */ }
    ws.current = null;
    stopPlayback();
    try { capNode.current?.disconnect(); } catch { /* ignore */ }
    capNode.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    pending.current.clear();
    userBuf.current = ''; voiceBuf.current = '';
    setHeard('');
  }, [stopPlayback]);

  const finish = useCallback((next: 'off' | 'paused' = 'off') => {
    const secs = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    const was = stateRef.current;
    teardown();
    setS(next === 'off' ? 'off' : 'paused');
    setPauseIn(null);
    startedAt.current = 0;
    const r = reading.current; reading.current = null; r?.(false);
    if (was !== 'off' && was !== 'paused') optsRef.current.onEnded(secs);
  }, [teardown]);

  const stopWakeWatch = useCallback(() => {
    const w = wake.current;
    if (!w) return;
    clearInterval(w.timer);
    w.stream.getTracks().forEach((t) => t.stop());
    w.ctx.close().catch(() => {});
    wake.current = null;
  }, []);
  useEffect(() => () => { teardown(); stopWakeWatch(); }, [teardown, stopWakeWatch]);

  // Gemini asked the backend (a learning turn): pass the learner's words to the brain.
  const handleCall = useCallback((id: string, request: string) => {
    pending.current.set(id, []);
    setS('thinking');
    bump();
    const text = (request || userBuf.current).trim();
    userBuf.current = ''; setHeard('');
    if (!text) { respond(id, 'Sorry, I didn’t catch that. Could you say it again?'); return; }
    optsRef.current.onRequest(text, id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function respond(id: string, result: string) {
    pending.current.delete(id);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    send({ toolResponse: { functionResponses: [{ id, name: 'ask_backend', response: { result } }] } });
  }
  const resultOf = (segs: Seg[]) => segs.map((s) => (s.kind === 'exact' ? `TEXT: ${s.text} END.` : s.text)).join(' ').trim();

  // The brain's answer, in the order the app hands it over (exact text first, then the explanation), sent as one result.
  const answerPart = useCallback((id: string, text: string) => {
    const segs = pending.current.get(id); const t = forSpeech(text);
    if (segs && t) segs.push({ kind: 'say', text: t });
  }, []);
  const answerExactPart = useCallback((id: string, exact: string) => {
    const segs = pending.current.get(id); const t = forSpeech(exact.replace(/\s*\|\s*/g, ' … '));
    if (segs && t) segs.push({ kind: 'exact', text: t });
  }, []);
  const answer = useCallback((id: string, text: string) => {
    const segs = pending.current.get(id);
    if (!segs) return;
    const t = forSpeech(text);
    if (t) segs.push({ kind: 'say', text: t });
    respond(id, resultOf(segs) || 'Let’s keep going.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const answerExact = useCallback((id: string, exact: string, rest: string) => {
    const segs = pending.current.get(id);
    if (!segs) return;
    segs.push({ kind: 'exact', text: forSpeech(exact) });
    if (forSpeech(rest)) segs.push({ kind: 'say', text: forSpeech(rest) });
    respond(id, resultOf(segs));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = useCallback((m: any) => {
    if (m.setupComplete) {
      ready.current = true;
      startedAt.current = Date.now(); bump(); setS('listening');
      const opening = openingRef.current;
      if (opening) appSay(opening);
      return;
    }
    if (m.toolCall?.functionCalls) {
      for (const c of m.toolCall.functionCalls) if (c?.id) handleCall(String(c.id), String(c.args?.request ?? ''));
      return;
    }
    if (m.toolCallCancellation?.ids) { for (const id of m.toolCallCancellation.ids) pending.current.delete(String(id)); return; }
    if (m.goAway) return; // the session will close soon; we reconnect as a pause
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.inputTranscription?.text) {
      userBuf.current += sc.inputTranscription.text;
      bump();
      if (Date.now() - lastHeardPaint.current > 250) { lastHeardPaint.current = Date.now(); setHeard(userBuf.current); }
      const r = reading.current; if (r && sc.inputTranscription.text.trim()) { reading.current = null; r(false); }
    }
    if (sc.outputTranscription?.text && !answering.current && !pending.current.size) voiceBuf.current += sc.outputTranscription.text;
    for (const p of sc.modelTurn?.parts ?? []) if (p?.inlineData?.data && String(p.inlineData.mimeType ?? '').startsWith('audio')) playPcm(p.inlineData.data);
    if (sc.interrupted) { stopPlayback(); setS(pending.current.size ? 'thinking' : 'listening'); }
    if (sc.turnComplete) { turnDone.current = true; afterTurn(); }
  }, [appSay, handleCall, playPcm, stopPlayback, afterTurn]);

  const openingRef = useRef('');
  const ready = useRef(false); // setup finished: audio may be sent

  const start = useCallback(async () => {
    if (stateRef.current !== 'off' && stateRef.current !== 'paused') return;
    const resuming = stateRef.current === 'paused';
    stopWakeWatch();
    closingTo.current = null;
    setS('connecting');
    try {
      // The player and microphone start inside the tap (phones only allow sound that a tap began).
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      void ac.resume().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mic.current = stream;
      const sid = optsRef.current.sessionId?.();
      const q = new URLSearchParams();
      if (sid) q.set('session', sid);
      if (resuming) q.set('resume', '1');
      const res = await fetch(`/api/gemini/live${q.toString() ? `?${q}` : ''}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? `status ${res.status}`);
      openingRef.current = String(data.opening ?? '');

      // Microphone → 16 kHz, 16-bit blocks → Gemini.
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ac.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ac, 'chavrusa-cap');
      capNode.current = node;
      const silent = ac.createGain(); silent.gain.value = 0;
      ac.createMediaStreamSource(stream).connect(node);
      node.connect(silent); silent.connect(ac.destination);
      const ratio = ac.sampleRate / 16000;
      let acc: number[] = [];
      let pos = 0; // where the next 16 kHz sample falls in the incoming block (carried across blocks)
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const f = e.data;
        for (; pos < f.length; pos += ratio) {
          const v = Math.max(-1, Math.min(1, f[Math.floor(pos)]));
          acc.push(v < 0 ? v * 0x8000 : v * 0x7fff);
        }
        pos -= f.length;
        if (!ready.current) { acc = []; return; } // nothing goes out until the call is set up
        if (acc.length >= 1600) { // about 100 ms
          const pcm = new Int16Array(acc);
          acc = [];
          send({ realtimeInput: { audio: { data: b64FromBytes(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } });
        }
      };

      const sock = new WebSocket(data.url);
      sock.binaryType = 'arraybuffer';
      ws.current = sock;
      sock.onopen = () => sock.send(JSON.stringify({ setup: data.setup }));
      sock.onmessage = async (ev) => {
        try {
          const d = ev.data as unknown;
          const raw = typeof d === 'string' ? d : d instanceof ArrayBuffer ? new TextDecoder().decode(d) : await (d as Blob).text();
          onMessage(JSON.parse(raw));
        } catch { /* ignore a message we can't read */ }
      };
      sock.onerror = () => { /* the close that follows says what happened */ };
      sock.onclose = (ev) => {
        if (ws.current !== sock) return;
        const to = closingTo.current;
        closingTo.current = null;
        if (to) { finish(to); return; }
        if (startedAt.current) {
          // Gemini ended the session (time limit, network): treat it as a pause; the next word or tap reconnects.
          finish('paused');
          if (optsRef.current.wakeOnSpeech()) startWakeRef.current?.();
        } else {
          optsRef.current.onError(`Gemini Live could not start${ev.reason ? `: ${ev.reason}` : ` (code ${ev.code})`}.`);
          finish('off');
        }
      };
    } catch (err) {
      const msg = (err as Error).name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
        : `Could not start Gemini Live: ${(err as Error).message}`;
      optsRef.current.onError(msg);
      teardown();
      setS('off');
    }
  }, [onMessage, finish, teardown, stopWakeWatch, send]);

  // While paused: listen locally (free, nothing is sent anywhere) and reconnect when the learner speaks.
  const startWakeWatch = useCallback(async () => {
    if (wake.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      await ac.resume().catch(() => {});
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let floor = -1, loudSince = 0;
      const timer = window.setInterval(() => {
        if (stateRef.current !== 'paused') { stopWakeWatch(); return; }
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        floor = floor < 0 ? rms : rms < floor ? floor * 0.8 + rms * 0.2 : floor * 0.995 + rms * 0.005;
        if (rms > Math.max(0.03, floor * 3)) {
          if (!loudSince) loudSince = Date.now();
          else if (Date.now() - loudSince > 250) { stopWakeWatch(); void start(); }
        } else loudSince = 0;
      }, 80);
      wake.current = { stream, ctx: ac, timer };
    } catch { /* the learner can still tap Resume */ }
  }, [start, stopWakeWatch]);
  startWakeRef.current = startWakeWatch;

  const pause = useCallback(() => {
    if (closingTo.current || !ws.current) return;
    closingTo.current = 'paused';
    try { ws.current.close(); } catch { finish('paused'); }
    if (optsRef.current.wakeOnSpeech()) window.setTimeout(() => startWakeWatch(), 300);
  }, [finish, startWakeWatch]);

  const stop = useCallback(() => {
    stopWakeWatch();
    if (stateRef.current === 'paused') { setS('off'); setPauseIn(null); return; }
    if (!ws.current) { finish('off'); return; }
    closingTo.current = 'off';
    try { ws.current.close(); } catch { finish('off'); }
  }, [finish, stopWakeWatch]);

  // Read-through: the voice reads a piece aloud exactly; resolves when done (true) or when the learner talks (false).
  const read = useCallback(async (text: string): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 700));
    for (let i = 0; i < 100 && (stateRef.current === 'speaking' || stateRef.current === 'thinking' || pending.current.size); i++) await new Promise((r) => setTimeout(r, 200));
    if (stateRef.current === 'off' || stateRef.current === 'paused') return false;
    answering.current = true; voiceBuf.current = ''; bump();
    return new Promise<boolean>((resolve) => {
      reading.current = resolve;
      appSay(`Read the following aloud now, the way a chavrusa reads inside: in your normal lively voice and speed, with feeling, all of it, with no pauses between verses. Do not add, explain, comment, or ask anything. The lashon kodesh is written in English letters, syllables split by hyphens, with the stressed syllable in capitals (be-REI-shis BAW-raw e-LOI-kim): lean on the capitalized syllable naturally; that is the yeshivish stress. Wherever the text has הַשֵּׁם say "Hashem", and say "Elokim" (and Elokeinu, Elokecha…) where written with a kuf. Read the English naturally.\n\n${text}`);
      window.setTimeout(() => { if (reading.current === resolve) { reading.current = null; resolve(true); } }, 90_000);
    });
  }, [appSay]);
  const stopReading = useCallback(() => { const r = reading.current; reading.current = null; r?.(false); }, []);

  // The learner tapped a line mid-call: go there now.
  const pointTo = useCallback((ref: string, n: number, he: string, en: string) => {
    bump();
    const r = reading.current; reading.current = null; r?.(false);
    stopPlayback();
    pending.current.forEach((_s, id) => send({ toolResponse: { functionResponses: [{ id, name: 'ask_backend', response: { result: '(Skip this: the learner just moved to a different place.)' } }] } }));
    pending.current.clear();
    userBuf.current = ''; voiceBuf.current = ''; setHeard('');
    const first = he ? splitPieces(he, en)[0] : null;
    const exact = first ? `${toSpeech(first.he)}${first.en ? ` — ${first.en.slice(0, 900)}` : ''}` : '';
    answering.current = true;
    appSay(`STOP what you are saying right now. The learner tapped ${ref}, line ${n} in the Sefer: that is where we are now, and it overrides wherever you were. ${exact ? `Read it now, the way a chavrusa reads inside: in your normal lively voice and speed, with feeling, phrase by phrase, the lashon kodesh and then its English, leaving nothing out: TEXT: ${exact} END. Then stop and wait for the learner.` : 'Say in a few words that we are there now, and wait for the learner.'} Do not go back to what you were saying before, and do not go past this line by yourself.`);
  }, [appSay, send, stopPlayback]);

  // The quiet clock (same as GPT-Live): pause after the chosen quiet time.
  useEffect(() => {
    if (state === 'off' || state === 'paused' || state === 'connecting') { setPauseIn(null); return; }
    const id = window.setInterval(() => {
      const limit = optsRef.current.idleSeconds();
      if (pending.current.size > 0 || optsRef.current.isBusy() || stateRef.current === 'speaking') bump();
      if (!limit) { setPauseIn(null); return; }
      const left = limit - (Date.now() - lastActivity.current) / 1000;
      setPauseIn(left <= 10 && left > 0 ? Math.ceil(left) : null);
      if (left <= 0) pause();
    }, 1000);
    return () => clearInterval(id);
  }, [state, pause]);

  const supported = typeof window !== 'undefined' && typeof WebSocket !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';

  return { state, heard, supported, start, stop, answer, answerPart, answerExact, answerExactPart, read, stopReading, pointTo, pauseIn, keepAwake: bump, active: state !== 'off' };
}
