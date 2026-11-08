'use client';
// Gemini Live (a test, side by side with GPT-Live; Settings → Voice → Live voice).
// The same job as useLive, with the same controls, so the rest of the app doesn't care which voice is talking:
// the phone talks to Google directly over a WebSocket (with a short-lived pass from our server), streams the
// microphone, plays Gemini's voice, and hands every learning turn to the Chavrusa brain through one tool
// (ask_backend). The brain's answer goes back as the tool's result, for Gemini to say.
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasNikud, namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';
import { splitPieces } from '@/lib/pieces';
import type { LiveState, useLive } from './useLive';
import { forVoice, type GeminiSpell, type SayMyWay } from '@/lib/geminiSpeech';
import { logBegin, logEnd, logLine } from '@/lib/callLog';

type Opts = Parameters<typeof useLive>[0];
const toSpeech = (he: string) => yeshivishTranslit(namesForSpeech(he), false);
function forSpeech(text: string): string {
  return text.replace(/\[\[\/?say\]\]/gi, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
}
// Captures the microphone in small blocks, for sending to Gemini.
// The microphone tap (Cap) and the player (Play). The player fixes the crackle (Nov 6): Gemini's sound arrives in
// small pieces at 24 kHz; each used to be played as its own clip, resampled on its own (a click at every seam) and
// started 20 ms ahead (any network hiccup left a gap: crackling). Now the pieces go into one steady stream, resampled
// smoothly, started only once ~180 ms is waiting (the end of a turn plays at once), and faded in and out at any gap.
const WORKLET = `class Cap extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch && ch.length) this.port.postMessage(ch.slice(0)); return true; } } registerProcessor('chavrusa-cap', Cap);
class Play extends AudioWorkletProcessor {
  constructor() { super(); this.N = 24000 * 180; this.b = new Float32Array(this.N); this.w = 0; this.r = 0; this.step = 24000 / sampleRate; this.on = false; this.busy = false; this.flush = false; this.g = 0; this.last = 0;
    this.port.onmessage = (e) => { const d = e.data;
      if (d === 'clear') { this.gaps = 0; this.w = 0; this.r = 0; this.on = false; this.flush = false; this.g = 0; this.last = 0; if (this.busy) { this.busy = false; this.port.postMessage('idle'); } return; }
      if (d === 'flush') { this.flush = true; if (!this.busy) this.port.postMessage('idle'); return; }
      for (let i = 0; i < d.length; i++) this.b[(this.w + i) % this.N] = d[i];
      this.w += d.length; this.flush = false;
      if (!this.busy) { this.busy = true; this.port.postMessage('busy'); } }; }
  process(inputs, outputs) { const o = outputs[0][0]; if (!o) return true;
    if (!this.on && this.w - this.r > 0 && (this.w - this.r >= 24000 * (this.gaps ? 0.35 : 0.25) || this.flush)) this.on = true;
    for (let k = 0; k < o.length; k++) {
      if (this.on && this.w - this.r >= 2) { const i = Math.floor(this.r), f = this.r - i; const a = this.b[i % this.N], c = this.b[(i + 1) % this.N];
        if (this.g < 1) this.g = Math.min(1, this.g + 0.004); this.last = a + (c - a) * f; o[k] = this.last * this.g * 0.85; this.r += this.step; }
      else { if (this.on) { this.on = false; if (!this.flush) { this.gaps = (this.gaps || 0) + 1; this.port.postMessage('gap'); } } this.g = Math.max(0, this.g - 0.004); this.last *= 0.995; o[k] = this.last * this.g; }
    }
    for (let ch = 1; ch < outputs[0].length; ch++) outputs[0][ch].set(o);
    if (this.busy && !this.on && this.flush && this.w - this.r < 2) { this.busy = false; this.flush = false; this.w = 0; this.r = 0; this.port.postMessage('idle'); }
    return true; } }
registerProcessor('chavrusa-play', Play);`;

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

// A tiny silent sound, played inside the tap so the phone lets the player speak later.
function silentWav(): string {
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o: number, x: string) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
// Gemini's sound is sent through a WebRTC connection inside the page and played from there, the same way GPT-Live's
// sound arrives (log of Nov 6, 12:29 AM: played straight from the page it still crackled on the iPhone, and the
// phone's echo cancelling didn't remove it, so the mic heard the voice). Resolves once the sound is flowing.
async function loopback(stream: MediaStream, el: HTMLAudioElement): Promise<() => void> {
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
  b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
  stream.getAudioTracks().forEach((t) => a.addTrack(t, stream));
  const got = new Promise<void>((res) => { b.ontrack = (ev) => { el.removeAttribute('src'); el.srcObject = ev.streams[0]; el.play().catch(() => {}); res(); }; });
  const offer = await a.createOffer();
  // Voice-quality Opus, a little higher than the default, mono.
  offer.sdp = offer.sdp?.replace(/a=fmtp:111 ([^\r\n]*)/, (m, x) => `a=fmtp:111 ${x};maxaveragebitrate=64000;stereo=0`);
  await a.setLocalDescription(offer);
  await b.setRemoteDescription(offer);
  const ans = await b.createAnswer();
  await b.setLocalDescription(ans);
  await a.setRemoteDescription(ans);
  await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('loopback timeout')), 4000))]);
  return () => { try { a.close(); b.close(); } catch { /* ignore */ } el.srcObject = null; };
}

export function useGeminiLive(opts: Opts) {
  const [state, setState] = useState<LiveState>('off');
  const [heard, setHeard] = useState('');
  const [pauseIn, setPauseIn] = useState<number | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stateRef = useRef<LiveState>('off');
  const setS = (s: LiveState) => { if (stateRef.current !== s) logLine('STATE', s); stateRef.current = s; setState(s); };
  // The call recorder (as for GPT-Live): what the learner and the voice said, turn by turn.
  const recIn = useRef('');  // the learner's words not yet written to the log
  const recOut = useRef(''); // the voice's words this turn
  const flushIn = () => { const t = recIn.current.trim(); recIn.current = ''; if (t) logLine('LEARNER', `"${t}"`); };
  const flushOut = (how = '') => { const t = recOut.current.trim(); recOut.current = ''; if (t) logLine('VOICE', `said${how}: "${t}"`); };
  const gotSound = useRef(false); // Gemini has sent sound since the call opened

  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const capNode = useRef<AudioWorkletNode | null>(null);
  const player = useRef<AudioWorkletNode | null>(null);
  const outEl = useRef<HTMLAudioElement | null>(null);
  const loopClose = useRef<(() => void) | null>(null);
  const audioBusy = useRef(false);
  // Keep going by itself (as with GPT-Live): after a piece was read or answered and it's quiet, the app asks for the
  // next piece itself (log of Nov 8, 8:03 AM: Gemini read, said one sentence and just stopped).
  const autoArmed = useRef(false);
  const autoTimer = useRef<number | undefined>(undefined);
  const lastHeardAt = useRef(0);
  const saidTail = useRef(''); // the voice's last words (did it end on a question?)
  const connectTry = useRef(0);
  const gaps = useRef(0); // times the voice's sound ran out mid-turn (a likely crackle), logged per turn // the player still has the voice's sound to play
  const pending = useRef<Map<string, Seg[]>>(new Map()); // tool calls waiting for the brain
  const userBuf = useRef('');
  const voiceBuf = useRef('');
  const heardAll = useRef(''); // for coach notes: the learner since the voice last spoke
  const saidAll = useRef('');  // and everything the voice said this turn
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
  // Reminders (as in useLive): the style card and the learner's instructions, added to the conversation every few
  // turns and at once when they change, without asking Gemini to answer them.
  const turns = useRef(0);
  const remindDirty = useRef(false);

  const send = useCallback((obj: Record<string, unknown>) => {
    const w = ws.current;
    if (w && w.readyState === WebSocket.OPEN) w.send(JSON.stringify(obj));
  }, []);
  // A message from the app (not the learner): what to do now.
  // Gemini's own spelling of lashon kodesh and the learner's "say it my way" list (Settings), applied to all it is given.
  const speech = useRef<{ spell: GeminiSpell; myWay: SayMyWay[]; house: boolean }>({ spell: 'stressed', myWay: [], house: true });
  // Any Hebrew letters (the brain's [[say]] text) are spelled out the yeshivish way first: Gemini given Hebrew letters
  // read them like an Israeli, or skipped them and said only the English.
  const g = (t: string) => forVoice(t.replace(/[\u05D0-\u05EA][\u0590-\u05FF"׳״־]*(?:[\s,:.?!;׃]+[\u05D0-\u05EA][\u0590-\u05FF"׳״־]*)*/g, (he) => (hasNikud(he) ? yeshivishTranslit(namesForSpeech(he), false) || he : he)), speech.current.spell, speech.current.myWay, speech.current.house);
  const appSay = useCallback((text: string) => {
    logLine('APP→VOICE', g(text));
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[APP] ${g(text)}` }] }], turnComplete: true } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const stopPlayback = useCallback(() => {
    player.current?.port.postMessage('clear');
    audioBusy.current = false;
  }, []);

  // When the voice has finished a turn and its audio has played out: record a reply it made by itself, finish a read-through.
  const afterTurn = useCallback(() => {
    if (audioBusy.current) return; // still playing; checked again when the player runs dry
    if (!turnDone.current) return;
    turnDone.current = false;
    if (stateRef.current === 'speaking') setS(pending.current.size ? 'thinking' : 'listening');
    if (!pending.current.size && saidAll.current.trim()) {
      const l = heardAll.current.trim(), w = saidAll.current.trim();
      heardAll.current = ''; saidAll.current = '';
      optsRef.current.onTurn?.(l, w);
    }
    if (!pending.current.size && !answering.current && voiceBuf.current.trim()) {
      const learner = userBuf.current.trim(), said = voiceBuf.current.trim();
      userBuf.current = ''; voiceBuf.current = ''; setHeard('');
      optsRef.current.onAside?.(learner, said);
    }
    const wasAnswer = answering.current;
    if (!pending.current.size) answering.current = false;
    if (!pending.current.size && (wasAnswer || autoArmed.current)) armAuto();
    voiceBuf.current = '';
    const r = reading.current;
    if (r) { reading.current = null; r(true); }
  }, []);

  const playPcm = useCallback((b64: string) => {
    const pl = player.current;
    if (!pl) return;
    const bytes = bytesFromB64(b64);
    const n = Math.floor(bytes.length / 2);
    if (!n) return;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
    pl.port.postMessage(f, [f.buffer]);
    if (!audioBusy.current) { flushIn(); logLine('VOICE', '▶ starts speaking'); }
    gotSound.current = true;
    audioBusy.current = true;
    bump();
    if (stateRef.current !== 'speaking') setS('speaking');
  }, [afterTurn]);

  const teardown = useCallback(() => {
    window.clearTimeout(autoTimer.current); autoArmed.current = false;
    ready.current = false;
    try { ws.current?.close(); } catch { /* ignore */ }
    ws.current = null;
    stopPlayback();
    try { capNode.current?.disconnect(); } catch { /* ignore */ }
    capNode.current = null;
    try { player.current?.disconnect(); } catch { /* ignore */ }
    player.current = null;
    loopClose.current?.(); loopClose.current = null;
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
    flushIn(); flushOut(' (cut off)');
    if (next === 'off') logEnd(`ended after ${Math.round(secs)} s`); else logLine('──', 'paused (the next word or tap reconnects)');
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
  useEffect(() => () => { if (stateRef.current !== 'off') logLine('──', 'the page closed the voice'); connectTry.current++; teardown(); stopWakeWatch(); }, [teardown, stopWakeWatch]);

  // Gemini asked the backend (a learning turn): pass the learner's words to the brain.
  const handleCall = useCallback((id: string, request: string) => {
    flushIn(); flushOut();
    logLine('EVENT', `asks the app [${id.slice(-5)}]: "${request}"`);
    pending.current.set(id, []);
    setS('thinking');
    bump();
    const text = (request || userBuf.current).trim();
    userBuf.current = ''; setHeard('');
    turns.current++;
    if (false && (remindDirty.current || turns.current % 2 === 1)) { // mid-call reminders off for the clean-base rebuild (Oct 31)
      const r = optsRef.current.reminder?.();
      if (r) { remindDirty.current = false; send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[APP] REMINDER (say nothing about it; just follow it): ${r}` }] }], turnComplete: false } }); }
    }
    if (!text) { respond(id, 'Sorry, I didn’t catch that. Could you say it again?'); return; }
    optsRef.current.onRequest(text, id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function armAuto() {
    const secs = optsRef.current.autoGo?.() ?? 0;
    if (!secs) return;
    autoArmed.current = true;
    window.clearTimeout(autoTimer.current);
    const at = Date.now(), sock = ws.current;
    const lastWords = saidTail.current.trim();
    autoTimer.current = window.setTimeout(() => {
      if (ws.current !== sock || !sock || pending.current.size || audioBusy.current || lastHeardAt.current > at) return;
      if (stateRef.current !== 'listening' || !autoArmed.current) return;
      if (/\?\s*["”']?$/.test(lastWords)) { autoArmed.current = false; return; } // it asked him something: his turn
      autoArmed.current = false;
      const id = `app_${Date.now()}`;
      pending.current.set(id, []);
      setS('thinking');
      logLine('AUTO', 'going on to the next piece by itself');
      optsRef.current.onRequest('next', id);
    }, secs * 1000);
  }

  function respond(id: string, result: string) {
    if (id.startsWith('app_')) { // the app asked for it itself: there's no request of Gemini's to answer, so hand it over
      pending.current.delete(id);
      answering.current = true;
      voiceBuf.current = '';
      bump();
      logLine('APP→VOICE', `next piece [app]: ${g(result)}`);
      send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[APP] The next piece. Say it now, exactly as the rules for a backend result say (the TEXT part read inside, phrase by phrase, the lashon kodesh and then its English, then what comes after it): ${g(result)}` }] }], turnComplete: true } });
      return;
    }
    pending.current.delete(id);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    logLine('APP→VOICE', `result [${id.slice(-5)}]: ${g(result)}`);
    send({ toolResponse: { functionResponses: [{ id, name: 'ask_backend', response: { result: g(result) } }] } });
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

  // The whole answer at once (same as GPT-Live): before the text, the text to read exactly, and the rest.
  const answerWhole = useCallback((id: string, before: string, exact: string, after: string) => {
    const segs = pending.current.get(id);
    if (!segs) return;
    if (forSpeech(before)) segs.push({ kind: 'say', text: forSpeech(before) });
    const ex = forSpeech(exact.replace(/\s*\|\s*/g, ' … '));
    if (ex) segs.push({ kind: 'exact', text: ex });
    if (forSpeech(after)) segs.push({ kind: 'say', text: forSpeech(after) });
    respond(id, resultOf(segs) || 'Let’s keep going.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = useCallback((m: any) => {
    if (m.setupComplete) {
      logLine('EVENT', 'setup complete: the call is open');
      ready.current = true;
      startedAt.current = Date.now(); bump(); setS('listening');
      const opening = openingRef.current;
      if (opening) { appSay(opening); autoArmed.current = true; saidTail.current = ''; }
      // A call that opens but never speaks: if Gemini has sent no sound 8 s after the opening and the learner hasn't
      // spoken, ask it once more to begin (the recorder shows a CHECK line).
      const sock = ws.current;
      window.setTimeout(() => {
        if (ws.current !== sock || gotSound.current || recIn.current.trim() || userBuf.current.trim() || pending.current.size) return;
        logLine('CHECK', 'no sound from Gemini 8 s after the opening: asking it to begin');
        appSay('The call is open and the learner is listening. Begin now, as your instructions say.');
      }, 8000);
      return;
    }
    if (m.toolCall?.functionCalls) {
      for (const c of m.toolCall.functionCalls) if (c?.id) handleCall(String(c.id), String(c.args?.request ?? ''));
      return;
    }
    if (m.toolCallCancellation?.ids) { logLine('EVENT', `cancelled its request: ${m.toolCallCancellation.ids.map((x: string) => String(x).slice(-5)).join(', ')}`); for (const id of m.toolCallCancellation.ids) pending.current.delete(String(id)); return; }
    if (m.goAway) { logLine('EVENT', `Gemini will close the session soon (time left: ${m.goAway.timeLeft ?? '?'})`); return; } // we reconnect as a pause
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.inputTranscription?.text) {
      userBuf.current += sc.inputTranscription.text;
      if (sc.inputTranscription.text.trim()) { lastHeardAt.current = Date.now(); autoArmed.current = false; window.clearTimeout(autoTimer.current); }
      recIn.current += sc.inputTranscription.text;
      heardAll.current += sc.inputTranscription.text;
      bump();
      if (Date.now() - lastHeardPaint.current > 250) { lastHeardPaint.current = Date.now(); setHeard(userBuf.current); }
      const r = reading.current; if (r && sc.inputTranscription.text.trim()) { reading.current = null; r(false); }
    }
    if (sc.outputTranscription?.text && !answering.current && !pending.current.size) voiceBuf.current += sc.outputTranscription.text;
    if (sc.outputTranscription?.text) { saidAll.current += sc.outputTranscription.text; recOut.current += sc.outputTranscription.text; saidTail.current = (saidTail.current + sc.outputTranscription.text).slice(-200); }
    for (const p of sc.modelTurn?.parts ?? []) if (p?.inlineData?.data && String(p.inlineData.mimeType ?? '').startsWith('audio')) playPcm(p.inlineData.data);
    if (sc.interrupted) { logLine('EVENT', 'interrupted (the learner spoke)'); flushOut(' (interrupted)'); stopPlayback(); setS(pending.current.size ? 'thinking' : 'listening'); }
    if (sc.turnComplete) { flushIn(); flushOut(); turnDone.current = true; player.current?.port.postMessage('flush'); afterTurn(); }
  }, [appSay, handleCall, playPcm, stopPlayback, afterTurn]);

  const openingRef = useRef('');
  const ready = useRef(false); // setup finished: audio may be sent

  const start = useCallback(async () => {
    if (stateRef.current !== 'off' && stateRef.current !== 'paused') return;
    const resuming = stateRef.current === 'paused';
    stopWakeWatch();
    closingTo.current = null;
    logBegin(`${optsRef.current.logMeta?.() ?? ''} · engine gemini`, resuming);
    gotSound.current = false;
    setS('connecting');
    const attempt = ++connectTry.current;
    // Ended while still connecting (log of Nov 8, 8:03 AM: ended at 1 s, and the call opened and spoke anyway):
    // after each wait, a call that was ended since stops here.
    const gone = () => connectTry.current !== attempt;
    try {
      // The player and microphone start inside the tap (phones only allow sound that a tap began).
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      void ac.resume().catch(() => {});
      if (!outEl.current) { const el = document.createElement('audio'); el.autoplay = true; el.setAttribute('playsinline', ''); el.style.display = 'none'; document.body.appendChild(el); outEl.current = el; }
      outEl.current.srcObject = null; outEl.current.src = silentWav(); outEl.current.play().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (gone()) { stream.getTracks().forEach((t) => t.stop()); void ac.close().catch(() => {}); return; }
      mic.current = stream;
      // Never stuck on "Connecting…": 15 seconds after the microphone opens, give up and say so.
      window.setTimeout(() => { if (mic.current === stream && stateRef.current === 'connecting') { logLine('ERROR', `still connecting after 15 s (${ws.current ? (ready.current ? 'set up' : 'the setup never completed') : 'no connection to Gemini yet'})`); optsRef.current.onError('The voice didn’t connect. Check the internet connection and tap Talk again.'); finish('off'); } }, 15_000);
      const sid = optsRef.current.sessionId?.();
      const q = new URLSearchParams();
      if (sid) q.set('session', sid);
      if (resuming) q.set('resume', '1');
      const res = await fetch(`/api/gemini/live${q.toString() ? `?${q}` : ''}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (gone()) { teardown(); return; }
      if (!res.ok || !data.url) throw new Error(data.error ?? `status ${res.status}`);
      openingRef.current = String(data.opening ?? '');
      logLine('──', `in this call: Gemini ${String(data.setup?.model ?? '?').replace('models/', '')} · voice ${data.setup?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName ?? '?'} · instructions ${String(data.setup?.systemInstruction?.parts?.[0]?.text ?? '').length} chars`);
      if (data.speech) speech.current = { spell: data.speech.spell ?? 'stressed', myWay: Array.isArray(data.speech.myWay) ? data.speech.myWay : [], house: data.speech.house !== false };

      // Microphone → 16 kHz, 16-bit blocks → Gemini.
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ac.audioWorklet.addModule(url);
      if (gone()) { teardown(); return; }
      URL.revokeObjectURL(url);
      const pl = new AudioWorkletNode(ac, 'chavrusa-play', { numberOfInputs: 0, outputChannelCount: [1] });
      // Played through WebRTC (see loopback); straight from the page only if that can't be set up.
      const toRtc = ac.createMediaStreamDestination();
      pl.connect(toRtc);
      const hush = ac.createGain(); hush.gain.value = 0; pl.connect(hush); hush.connect(ac.destination); // keeps the player running
      if (gone()) { teardown(); return; }
      try { loopClose.current = await loopback(toRtc.stream, outEl.current!); logLine('AUDIO', 'the voice plays through WebRTC, like GPT-Live (echo cancelling on)'); }
      catch (e) { pl.connect(ac.destination); logLine('AUDIO', `WebRTC playback unavailable (${(e as Error).message}): playing straight from the page`); }
      if (gone()) { teardown(); return; }
      pl.port.onmessage = (e) => { if (e.data === 'gap') { gaps.current++; return; } if (e.data === 'idle') { if (gaps.current) { logLine('AUDIO', `the voice's sound ran short ${gaps.current} time${gaps.current > 1 ? 's' : ''} this turn (the network was slower than the voice)`); gaps.current = 0; } audioBusy.current = false; afterTurn(); } else if (e.data === 'busy') audioBusy.current = true; };
      player.current = pl;
      const node = new AudioWorkletNode(ac, 'chavrusa-cap');
      capNode.current = node;
      const silent = ac.createGain(); silent.gain.value = 0;
      ac.createMediaStreamSource(stream).connect(node);
      node.connect(silent); silent.connect(ac.destination);
      const ratio = ac.sampleRate / 16000;
      let acc: number[] = [];
      // The recorder's AUDIO lines: blocks of the learner's sound sent to Gemini, and the mic level, for the first 8 s.
      let sentBlocks = 0, peak = 0, sec = 0;
      let voiceAt = 0, loudSince = 0, echoNoted = false, bargeNoted = false;
      const audioWatch = window.setInterval(() => {
        if (mic.current !== stream || ++sec > 8) { window.clearInterval(audioWatch); return; }
        logLine('AUDIO', `${sec} s: sent to Gemini ${sentBlocks} sound blocks · mic level ${peak.toFixed(3)} · mic ${stream.getAudioTracks()[0]?.readyState ?? '?'} · Gemini sound ${gotSound.current ? 'yes' : 'not yet'}`);
        peak = 0;
      }, 1000);
      let pos = 0; // where the next 16 kHz sample falls in the incoming block (carried across blocks)
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const f = e.data;
        let bp = 0;
        for (let i = 0; i < f.length; i += 16) { const a = Math.abs(f[i]); if (a > bp) bp = a; }
        if (bp > peak) peak = bp;
        // Echo guard (log of Nov 6, 12:25 AM): the phone's mic heard the voice's own words ("Let me check" came back as
        // the learner), so Gemini kept cutting itself off. Gemini's sound is played through the page, which the phone's
        // echo cancelling doesn't remove (GPT-Live's comes through WebRTC, which it does). So while the voice is
        // speaking, and for 0.4 s after, the mic is sent as silence, unless the learner is clearly talking over it
        // (loud for a quarter of a second): then it goes through, so he can still stop it.
        const now = Date.now();
        if (audioBusy.current) voiceAt = now;
        const guard = now - voiceAt < 400;
        if (guard && bp >= 0.3) { if (!loudSince) loudSince = now; } else if (bp < 0.3) loudSince = 0;
        const pass = !guard || (loudSince > 0 && now - loudSince >= 250);
        if (guard && !pass && bp >= 0.02 && !echoNoted) { echoNoted = true; logLine('AUDIO', `the mic heard sound while the voice was speaking (level ${bp.toFixed(2)}): held back as echo`); }
        if (guard && pass && !bargeNoted) { bargeNoted = true; logLine('AUDIO', `the learner spoke over the voice (level ${bp.toFixed(2)}): let through`); }
        if (!guard) bargeNoted = false;
        for (; pos < f.length; pos += ratio) {
          const v = pass ? Math.max(-1, Math.min(1, f[Math.floor(pos)])) : 0;
          acc.push(v < 0 ? v * 0x8000 : v * 0x7fff);
        }
        pos -= f.length;
        if (!ready.current) { acc = []; return; } // nothing goes out until the call is set up
        if (acc.length >= 1600) { // about 100 ms
          const pcm = new Int16Array(acc);
          acc = [];
          send({ realtimeInput: { audio: { data: b64FromBytes(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } });
          sentBlocks++;
        }
      };

      const sock = new WebSocket(data.url);
      sock.binaryType = 'arraybuffer';
      ws.current = sock;
      sock.onopen = () => { logLine('EVENT', 'connected to Gemini: sending the setup'); sock.send(JSON.stringify({ setup: data.setup })); };
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
        logLine('EVENT', `connection closed (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`);
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
      logLine('ERROR', msg);
      logEnd('could not start');
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
    connectTry.current++; // a call still connecting stops at its next step
    if (stateRef.current === 'connecting' && !ws.current) { teardown(); logEnd('ended while connecting'); setS('off'); return; }
    if (stateRef.current === 'paused') { setS('off'); setPauseIn(null); return; }
    if (!ws.current) { finish('off'); return; }
    closingTo.current = 'off';
    try { ws.current.close(); } catch { finish('off'); }
  }, [finish, stopWakeWatch, teardown]);

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

  const remind = useCallback(() => { remindDirty.current = true; }, []);
  const note = useCallback((text: string) => {
    if (!text.trim()) return;
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[APP] COACH NOTE (private: never mention it or answer it; just apply it from your next reply on): ${g(text)}` }] }], turnComplete: false } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { freshStart: () => {}, remind, note, state, heard, supported, start, stop, answer, answerWhole, answerPart, answerExact, answerExactPart, read, stopReading, pointTo, pointText: (label: string, he: string, en: string) => pointTo(label, 1, he, en), pauseIn, keepAwake: bump, active: state !== 'off' };
}
