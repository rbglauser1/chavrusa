'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { heReadNote, voiceHe, type HeRead } from '@/lib/hebrew';
import { splitPieces } from '@/lib/pieces';
import { forVoice, type GeminiSpell, type SayMyWay } from '@/lib/geminiSpeech';
import { voicePhrases } from '@/lib/interlinear';
import { logBegin, logEnd, logLine } from '@/lib/callLog';
import { silentWav } from './useVoice';
import { endHeard, missingHebrew, missingTail } from '@/lib/skipCheck';

let READS: 'all' | 'english' | 'gist' = 'all'; // who reads the text in this call (Settings → Voice)
let HE_MODE: HeRead = 'join-kh'; // how the voice gets the lashon kodesh (from the call's settings)
const toSpeech = (he: string) => voiceHe(he, HE_MODE);

// Live voice: a GPT-Live session over WebRTC. The voice model listens and speaks naturally; whenever the
// learner says something about the learning, it "delegates" to us. We send the learner's words to the
// Chavrusa brain (/api/chat) and hand the answer back for the voice to say.

export type LiveState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused';

// Mid-call reminders of the style and the learner's instructions: off while we rebuild the voice from a clean base
// (Oct 31, 2026). The style card is still in the instructions at the start of every call.
const REMINDERS = false;

const MAX_TOKENS = 420; // the voice accepts at most 500 tokens per message: kept safely under

// About how many tokens a stretch of text is: English runs about 4 characters a token; Hebrew letters with their
// nikud take far more (each letter and mark is close to a token of its own).
function tokensOf(t: string): number {
  const he = (t.match(/[\u0591-\u05F4]/g) ?? []).length;
  return Math.ceil((t.length - he) / 4 + he * 0.9);
}

function forSpeech(text: string): string {
  return text.replace(/\[\[\/?say\]\]/gi, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
}
// A long answer is handed over in several pieces (each within what the voice accepts at once, counted in tokens),
// split at the end of a sentence or between phrases, so nothing is cut off in the middle.
function chunks(t: string): string[] {
  const out: string[] = [];
  let rest = t.trim();
  while (rest && tokensOf(rest) > MAX_TOKENS) {
    // The longest start of it that fits.
    let lo = 1, hi = rest.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (tokensOf(rest.slice(0, mid)) <= MAX_TOKENS) lo = mid; else hi = mid - 1; }
    const cut = rest.slice(0, lo);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'), cut.lastIndexOf(' … '), cut.lastIndexOf(' | '));
    const at = end > lo * 0.4 ? end + 1 : cut.lastIndexOf(' ') > lo * 0.4 ? cut.lastIndexOf(' ') : lo;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}
// A text block (⟪ … ⟫) handed over in pieces: each piece is its own ⟪ … ⟫, so the voice reads each as text.
function textChunks(ex: string): string[] {
  return chunks(ex).map((c) => `⟪${c.replace(/^⟪|⟫$/g, '').replace(/^…\s*/, '')}⟫`);
}

// ── One microphone for the page ───────────────────────────────────────────────────────────────────────────────────
// On an iPhone, asking for the microphone again on the same page sometimes gives a microphone that reports itself
// "live" but sends no sound (the call recorder showed 0 sound packets for 8 seconds), and the voice, hearing nothing,
// never starts. So the page keeps the microphone from its first call and uses it for every call (and for listening
// while paused), and lets it go after 3 minutes without a call, or when the page is left.
const MIC_OPTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
let sharedMic: MediaStream | null = null;
let micRelease: number | undefined;
function micAlive(s: MediaStream | null) { const t = s?.getAudioTracks()[0]; return !!t && t.readyState === 'live'; }
let micGranted = false; // the phone already said yes to the microphone on this page (no question will be asked)
async function getMic(fresh = false): Promise<MediaStream> {
  window.clearTimeout(micRelease);
  if (!fresh && micAlive(sharedMic)) return sharedMic!;
  sharedMic?.getTracks().forEach((t) => t.stop());
  sharedMic = await navigator.mediaDevices.getUserMedia({ audio: MIC_OPTS });
  micGranted = true;
  return sharedMic;
}
// Starting a call: on an iPhone, asking for the microphone again right after one was let go can hang (no answer at
// all), which left Talk doing nothing. Once the phone has said yes on this page there is no question to wait for, so
// after 4 seconds ask once more; after 4 more, give up and say so. (The first time, the phone's question can take
// as long as the learner needs.)
async function getMicForCall(log: (what: string) => void): Promise<MediaStream> {
  if (micAlive(sharedMic) || !micGranted) return getMic();
  const t0 = Date.now();
  const late = (ms: number) => new Promise<null>((r) => window.setTimeout(() => r(null), ms));
  const first = getMic();
  let got = await Promise.race([first, late(4000)]);
  if (!got) {
    log('the microphone didn\'t open in 4 s: asking again');
    got = await Promise.race([first, navigator.mediaDevices.getUserMedia({ audio: MIC_OPTS }).then((m) => { sharedMic = m; return m; }), late(4000)]);
  }
  if (!got) throw new Error('the microphone didn\'t open');
  log(`microphone open (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return got;
}
function releaseMicNow() { window.clearTimeout(micRelease); sharedMic?.getTracks().forEach((t) => t.stop()); sharedMic = null; }
function releaseMicSoon() {
  window.clearTimeout(micRelease);
  micRelease = window.setTimeout(() => { sharedMic?.getTracks().forEach((t) => t.stop()); sharedMic = null; }, 3 * 60_000);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { sharedMic?.getTracks().forEach((t) => t.stop()); sharedMic = null; });

export function useLive(opts: {
  onRequest: (text: string, delegationId: string) => void; // learner said something: ask the brain
  onError: (msg: string) => void;
  onEnded: (seconds: number) => void;          // a connected stretch ended (for cost tracking)
  isBusy: () => boolean;                        // the brain is still working on something
  idleSeconds: () => number;                    // pause after this much quiet (0 = never)
  wakeOnSpeech: () => boolean;
  sessionId?: () => string | null;
  logMeta?: () => string; // a one-line summary of the settings for the call recorder
  reminder?: () => string; // the style card + the learner's instructions, re-sent during the call so they don't fade
  onTurn?: (learner: string, said: string) => void; // the voice finished a turn (anything it said): for coach notes
  checkOn?: () => boolean; // catch skipped words: compare what the voice said with the text it was given
  checkHeOn?: () => boolean; // catch skipped Hebrew: look for each Hebrew phrase in what the voice said (English letters)
  autoGo?: () => number;   // keep going by itself: seconds of quiet after a piece before going on (0 = wait for the learner)
  onAside?: (learner: string, voice: string) => void; // an exchange the voice handled by itself (not sent to the brain)              // the current learning session (so the voice knows the style, place and requests)                  // while paused, reconnect when the learner starts talking
}) {
  const [state, setState] = useState<LiveState>('off');
  const [heard, setHeard] = useState('');           // what the learner is saying right now
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const userBuf = useRef('');
  const voiceBuf = useRef('');   // what the voice is saying on its own (not an answer from the brain)
  const answering = useRef(false); // the voice is saying an answer we handed it
  const handed = useRef({ text: '', at: 0 }); // what we last handed the voice to say (so it isn't saved twice)
  const lastInputAt = useRef(0);
  const seconds = useRef(0);
  const startedAt = useRef(0);
  const speakTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Set<string>>(new Set());
  const stateRef = useRef<LiveState>('off');
  const lastActivity = useRef(0);
  const [pauseIn, setPauseIn] = useState<number | null>(null);
  const wake = useRef<{ stream: MediaStream; ctx: AudioContext; timer: number } | null>(null);
  const bump = () => { lastActivity.current = Date.now(); };
  const lastHeardPaint = useRef(0);
  const connectTry = useRef(0); // which attempt to connect is current (the 15-second limit checks it)
  const startRef = useRef<((retry?: boolean | 'silent') => Promise<void>) | null>(null);
  const pointToRef = useRef<((ref: string, n: number, he: string, en: string, enB?: string, literal?: boolean) => void) | null>(null);
  const firstResume = useRef(false); // whether the call being started is a resume (a retry keeps the same opening)
  const silentTry = useRef(0);       // reconnects because the voice said nothing after connecting
  const closingTo = useRef<'off' | 'paused' | null>(null); // set when we asked the session to close
  const startWakeRef = useRef<(() => void) | null>(null);
  // Keeping it steady: what the voice said (all of it), the text it was last given to read (to check nothing was
  // skipped), about when its sound really ends (its words arrive ahead of its audio), and jobs waiting for quiet.
  const voiceAll = useRef('');
  const check = useRef<{ text: string; from: number; at: number; redo: number } | null>(null);
  const estEnd = useRef(0);
  const quietJobs = useRef<{ name: string; run: () => void; need: number }[]>([]);
  const quietTimer = useRef<number | undefined>(undefined);
  const refreshing = useRef(false);
  // Caught when the voice says "one moment" but never actually asks the app (it then waits in silence forever).
  const lastUtter = useRef({ text: '', at: 0 });   // what the voice said in its last stretch of speech, and when it ended
  const lastLearner = useRef('');                  // the learner's last words
  const lastDelegAt = useRef(0);                   // when the voice last asked the app for something
  const setS = (s: LiveState) => { if (stateRef.current !== s) logLine('STATE', s); stateRef.current = s; setState(s); };
  // Reminders: the style card and the learner's instructions, re-sent every few turns (and at once when they change),
  // attached to a turn being handed to the brain, so the voice holds onto them all call long.
  const recIn = useRef<{ text: string; timer?: number }>({ text: '' }); // the call recorder: the learner's words so far
  const recOut = useRef(''); // and the voice's
  const recOutAt = useRef(0);
  const heardAll = useRef(''); // everything the learner said since the voice last spoke (for coach notes)
  const saidAll = useRef('');  // everything the voice said this turn
  const turns = useRef(0);
  const remindDirty = useRef(false);
  const remindNow = (delegationId: string | null) => {
    const text = optsRef.current.reminder?.();
    if (!text) return;
    remindDirty.current = false;
    sendRef.current({ type: 'session.instructions.append', delegation_id: delegationId, content: `REMINDER from the app (say nothing about it; just follow it): ${text}` });
  };
  const sendRef = useRef<(o: Record<string, unknown>) => void>(() => {});
  // The learner's spelling choice and "say it my way" list (Settings → Voice), applied to everything the voice is given.
  const speech = useRef<{ spell: GeminiSpell; myWay: SayMyWay[]; house: boolean }>({ spell: 'stressed', myWay: [], house: true });
  const g = (t: string) => forVoice(t, speech.current.spell, speech.current.myWay, speech.current.house);

  const send = useCallback((obj0: Record<string, unknown>) => {
    // A request the app made by itself (app_…) isn't GPT-Live's: anything for it goes to the voice as plain speech.
    const obj = typeof obj0.delegation_id === 'string' && obj0.delegation_id.startsWith('app_') ? { ...obj0, delegation_id: null } : obj0;
    const ch = dc.current;
    const o = obj as { type?: string; delegation_id?: string | null; content?: string };
    logLine('APP→VOICE', `${o.type ?? '?'}${o.delegation_id ? ` [${String(o.delegation_id).slice(-5)}]` : ''}${o.content ? `: ${String(o.content).slice(0, 900)}` : ''}${ch && ch.readyState === 'open' ? '' : ' (NOT SENT: channel closed)'}`);
    if (ch && ch.readyState === 'open') ch.send(JSON.stringify({ event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...obj }));
  }, []);
  sendRef.current = send;

  // The call recorder's microphone check: every 10 seconds, how loud the microphone was at its loudest (from the
  // connection's own numbers). A learner who spoke but isn't in the log, with the mic "silent", means no sound reached
  // the app (muted, the wrong microphone, Bluetooth…), not that the voice ignored him.
  const micTimer = useRef<number | undefined>(undefined);
  const seconds8 = useRef(0);
  function micWatch(peer: RTCPeerConnection) {
    window.clearInterval(micTimer.current);
    seconds8.current = 0;
    let peak = 0, ticks = 0, lastWord = '';
    micTimer.current = window.setInterval(async () => {
      if (pc.current !== peer) { window.clearInterval(micTimer.current); return; }
      let sent = -1, got = -1, level = -1;
      try {
        (await peer.getStats()).forEach((r: { type?: string; kind?: string; audioLevel?: number; packetsSent?: number; packetsReceived?: number }) => {
          if ((r.type === 'media-source' || r.type === 'track') && r.kind === 'audio' && typeof r.audioLevel === 'number') { peak = Math.max(peak, r.audioLevel); level = r.audioLevel; }
          if (r.type === 'outbound-rtp' && r.kind === 'audio' && typeof r.packetsSent === 'number') sent = r.packetsSent;
          if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.packetsReceived === 'number') got = r.packetsReceived;
        });
      } catch { /* not available here */ }
      // The first 8 seconds of a connection, second by second: is the phone's sound really going out to OpenAI, and is
      // anything coming back? (Some calls never start; this tells a silent microphone from OpenAI not starting.)
      if (seconds8.current < 8) {
        seconds8.current++;

        const t = mic.current?.getAudioTracks()[0];
        logLine('AUDIO', `${seconds8.current} s: sent to OpenAI ${sent < 0 ? '?' : sent} sound packets · received ${got < 0 ? '?' : got} · mic level ${level < 0 ? '?' : level.toFixed(3)} · mic ${t ? `${t.readyState}${t.muted ? ', MUTED' : ''}${t.enabled ? '' : ', off'}` : 'none'}`);
      }
      if (++ticks < 10) return;
      const word = peak < 0.01 ? 'silent' : peak < 0.05 ? 'very quiet' : 'hearing sound';
      // Logged every 10 seconds while it changes, and every 30 seconds otherwise, to keep the log short.
      if (word !== lastWord || ticks >= 30) { logLine('MIC', `${word} (loudest ${peak.toFixed(2)} in the last ${ticks} s)`); lastWord = word; ticks = 0; peak = 0; }
      else if (ticks % 10 === 0) peak = 0;
    }, 1000);
  }
  const teardown = useCallback(() => {
    window.clearInterval(micTimer.current);
    try { dc.current?.close(); } catch { /* ignore */ }
    try { pc.current?.close(); } catch { /* ignore */ }
    releaseMicSoon(); // the page keeps its one microphone a little while (see getMic)
    dc.current = null; pc.current = null; mic.current = null;
    if (audio.current) audio.current.srcObject = null;
    if (speakTimer.current) clearTimeout(speakTimer.current);
    pending.current.clear();
    userBuf.current = '';
    setHeard('');
  }, []);

  // End the current connection. `next` is 'off' (call ended) or 'paused' (resume later).
  const finish = useCallback((next: 'off' | 'paused' = 'off') => {
    if (!pc.current && (stateRef.current === 'off' || stateRef.current === 'paused')) { setS(next === 'off' ? 'off' : stateRef.current); return; }
    const secs = Math.max(seconds.current, startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0);
    // The recorder: whatever the voice or the learner was in the middle of saying when the connection ended.
    if (recOut.current) { logLine('VOICE', `■ (cut off: the call ended) after ${((Date.now() - recOutAt.current) / 1000).toFixed(1)} s: "${recOut.current.trim()}"`); recOut.current = ''; }
    if (recIn.current.text) { logLine('LEARNER', `■ "${recIn.current.text.trim()}"`); recIn.current.text = ''; }
    if (next === 'off') logEnd(`ended, ${Math.round(secs)} s billed`); else logLine('──', `paused (connection closed, ${Math.round(secs)} s billed)`);
    teardown();
    setS(next);
    setPauseIn(null);
    seconds.current = 0; startedAt.current = 0;
    optsRef.current.onEnded(secs);
  }, [teardown]);

  const stopWakeWatch = useCallback(() => {
    const w = wake.current;
    if (!w) return;
    clearInterval(w.timer);
    w.ctx.close().catch(() => {}); // (the microphone itself is the page's one, kept: see getMic)
    wake.current = null;
  }, []);

  useEffect(() => () => { teardown(); stopWakeWatch(); }, [teardown, stopWakeWatch]);

  // Wait until the learner's words have stopped arriving, then hand them to the brain.
  const lastAskAt = useRef(0); // when the learner last asked the brain something (a new request)
  const handleDelegation = useCallback((delegationId: string) => {
    lastAskAt.current = Date.now();
    pending.current.add(delegationId);
    setS('thinking');
    const started = Date.now();
    const tick = () => {
      // The transcript of what was said can arrive slightly after the hand-off, so wait for it
      // (up to 2.5 s), then until it has been quiet for a moment.
      const elapsed = Date.now() - started;
      const quiet = Date.now() - lastInputAt.current > 350;
      const empty = !userBuf.current.trim();
      if (elapsed < 2500 && (empty || !quiet)) { window.setTimeout(tick, 100); return; }
      const text = userBuf.current.trim();
      userBuf.current = '';
      setHeard('');
      if (!text) {
        send({ type: 'session.commentary.append', delegation_id: delegationId, content: 'Sorry, I didn’t catch that. Could you say it again?' });
        pending.current.delete(delegationId);
        return;
      }
      turns.current++;
      if (REMINDERS && (remindDirty.current || turns.current % 2 === 1)) remindNow(delegationId);
      logLine('BRAIN', `asked [${delegationId.slice(-5)}]: "${text}"`);
      optsRef.current.onRequest(text, delegationId);
    };
    tick();
  }, [send]);

  const onEvent = useCallback((e: any) => {
    if (e?.type !== 'session.input_transcript.delta' && e?.type !== 'session.output_transcript.delta') {
      try { const { type, event_id: _id, ...rest } = e ?? {}; logLine('EVENT', `${type}${Object.keys(rest).length ? ` ${JSON.stringify(rest).slice(0, 400)}` : ''}`); } catch { /* ignore */ }
    }
    switch (e?.type) {
      case 'session.input_transcript.delta':
        if (typeof e.delta === 'string') {
          userBuf.current += e.delta;
          heardAll.current += e.delta;
          if (!recIn.current.text) logLine('LEARNER', `▶ starts speaking${stateRef.current === 'speaking' ? ' (WHILE THE VOICE IS SPEAKING)' : ''}`);
          recIn.current.text += e.delta;
          if (recIn.current.timer) clearTimeout(recIn.current.timer);
          recIn.current.timer = window.setTimeout(() => {
            const said = recIn.current.text.trim();
            logLine('LEARNER', `■ "${said}"`);
            lastLearner.current = said || lastLearner.current;
            // "Stop", "wait": no going on by itself until he says to go on again.
            if (/\b(stop|wait|hold on|pause|enough|hang on|let me think|not yet)\b/i.test(said)) autoHold.current = true;
            else if (/\b(go on|next|continue|keep going|yes|ok(ay)?|go ahead)\b/i.test(said)) autoHold.current = false;
            recIn.current.text = '';
          }, 1200);
          lastInputAt.current = Date.now();
          autoArmed.current = false; // he spoke: what comes next is his call (his "go on" brings the next piece)
          bump();
          if (Date.now() - lastHeardPaint.current > 250) { lastHeardPaint.current = Date.now(); setHeard(userBuf.current); }
          if (stateRef.current === 'speaking') setS('listening');
          // The learner spoke during a read-through: stop reading and let him talk.
          if (reading.current && e.delta.trim()) { const r = reading.current; reading.current = null; r(false); }
        }
        break;
      case 'session.output_transcript.delta':
        bump();
        setS('speaking');
        if (typeof e.delta === 'string' && !answering.current && !pending.current.size) voiceBuf.current += e.delta;
        if (typeof e.delta === 'string') saidAll.current += e.delta;
        if (typeof e.delta === 'string') { if (!recOut.current) { recOutAt.current = Date.now(); logLine('VOICE', '▶ starts speaking'); } recOut.current += e.delta; }
        if (typeof e.delta === 'string') {
          voiceAll.current += e.delta;
          estEnd.current = Math.max(estEnd.current, recOutAt.current + (recOut.current.trim().split(/\s+/).length / 2.3) * 1000);
        }
        if (speakTimer.current) clearTimeout(speakTimer.current);
        speakTimer.current = window.setTimeout(() => {
          if (recOut.current) { logLine('VOICE', `■ stopped after ${((Date.now() - 900 - recOutAt.current) / 1000).toFixed(1)} s: "${recOut.current.trim()}"`); lastUtter.current = { text: recOut.current.trim(), at: Date.now() }; recOut.current = ''; }
          if (stateRef.current === 'speaking') setS(pending.current.size ? 'thinking' : 'listening');
          // The voice finished a turn: hand the exchange to the coach (if on), then start fresh.
          if (!pending.current.size && saidAll.current.trim()) {
            const l = heardAll.current.trim(), w = saidAll.current.trim();
            heardAll.current = ''; saidAll.current = '';
            optsRef.current.onTurn?.(l, w);
          }
          // The voice finished a reply it made by itself: record the exchange so the session (and the brain) has it.
          if (!pending.current.size && !answering.current && voiceBuf.current.trim() && !echoesHanded(voiceBuf.current)) {
            const learner = userBuf.current.trim();
            const said = voiceBuf.current.trim();
            userBuf.current = '';
            voiceBuf.current = '';
            setHeard('');
            optsRef.current.onAside?.(learner, said);
            turns.current++;
            if (REMINDERS && (remindDirty.current || turns.current % 2 === 0)) remindNow(null);
          }
          // Keep going by itself stays armed across the voice's stretches of speech (log of Nov 6, 10:03 AM: a reading or
          // an explanation often comes out in two or three stretches; the first stretch's end armed it, the next
          // stretch cancelled it, and the last one, no longer "an answer", never armed it again, so it never went on).
          const wasAnswer = answering.current || autoArmed.current;
          if (!pending.current.size) answering.current = false;
          if (!pending.current.size && wasAnswer) { autoArmed.current = true; autoNext(); }
          else if (!pending.current.size && autoStart.current) { autoStart.current = false; autoNext(true); }
          voiceBuf.current = pending.current.size ? '' : voiceBuf.current;
          if (!pending.current.size) checkSkip();
          if (!pending.current.size) watchStall();
          // A read-through piece finished (allowing for the audio running a little behind the words).
          if (reading.current) {
            const r = reading.current;
            const wait = Math.max(0, readMinEnd.current - Date.now());
            window.setTimeout(() => { if (reading.current === r) { reading.current = null; r(true); } }, wait);
          }
        }, 900);
        break;
      case 'session.delegation.created':
        bump();
        lastDelegAt.current = Date.now();
        if (e.delegation?.id) handleDelegation(e.delegation.id);
        break;
      case 'session.usage.updated':
        if (typeof e.usage?.seconds === 'number') seconds.current = e.usage.seconds;
        break;
      case 'session.closed':
        if (typeof e.usage?.seconds === 'number') seconds.current = e.usage.seconds;
        if (pc.current) {
          const to = closingTo.current ?? (e.reason === 'expired' ? 'paused' : 'off'); // expired: just reconnect on the next tap or word
          closingTo.current = null;
          finish(to);
          if (to === 'paused' && !refreshing.current && optsRef.current.wakeOnSpeech()) startWakeRef.current?.();
        }
        break;
      case 'error':
        logLine('ERROR', JSON.stringify(e.error ?? e).slice(0, 400));
        optsRef.current.onError(`Live voice: ${e.error?.message ?? 'something went wrong'}`);
        break;
    }
  }, [finish, handleDelegation]);

  // Sentence by sentence: hand the voice the first part of the answer while the brain is still writing the rest,
  // so it can start speaking sooner. (GPT-Live accepts several updates for one delegation.)
  const partial = useRef<Set<string>>(new Set());
  const answerPart = useCallback((delegationId: string, text: string) => {
    if (!pending.current.has(delegationId)) return;
    const t = forSpeech(text);
    if (!t) return;
    partial.current.add(delegationId);
    handed.current = { text: handed.current.at > Date.now() - 60_000 ? `${handed.current.text} ${t}` : t, at: Date.now() };
    answering.current = true;
    voiceBuf.current = '';
    bump();
    for (const c of chunks(t)) send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(c) });
  }, [send]);

  // Is what the voice just said really the answer we handed it (spoken after a pause), not its own reply?
  function echoesHanded(said: string): boolean {
    if (!handed.current.text || Date.now() - handed.current.at > 90_000) return false;
    const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z\u05d0-\u05ea' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    const a = words(said), b = words(handed.current.text);
    if (!a.size) return false;
    let shared = 0;
    a.forEach((w) => { if (b.has(w)) shared++; });
    return shared / a.size > 0.5;
  }

  // Read-through: have the voice read a piece of text aloud exactly, then resolve when it has finished
  // (true) or when the learner starts talking (false).
  const reading = useRef<((done: boolean) => void) | null>(null);
  const readMinEnd = useRef(0);
  const read = useCallback(async (text: string): Promise<boolean> => {
    // Let anything the voice is already saying finish first.
    await new Promise((r) => setTimeout(r, 700));
    for (let i = 0; i < 100 && (stateRef.current === 'speaking' || stateRef.current === 'thinking' || pending.current.size); i++) await new Promise((r) => setTimeout(r, 200));
    if (stateRef.current === 'off' || stateRef.current === 'paused') return false;
    answering.current = true;
    voiceBuf.current = '';
    handed.current = { text, at: Date.now() };
    bump();
    const words = text.split(/\s+/).length;
    readMinEnd.current = Date.now() + (words / 2.8) * 1000 * 0.85; // rough length of the audio
    return new Promise<boolean>((resolve) => {
      reading.current = resolve;
      send({ type: 'session.instructions.append', delegation_id: null, content: `Read the following aloud now, the way a chavrusa reads inside: in your lively voice, at the speed and with the pauses set in your instructions, with feeling, all of it, with only the pauses your instructions ask for between verses. Do not add, explain, comment, or ask anything. ${heReadNote(HE_MODE)} Wherever the text has הַשֵּׁם say \"Hashem\", and say \"Elokim\" (and Elokeinu, Elokecha…) where written with a kuf. Read the English naturally.\n\n${g(text)}` });
      window.setTimeout(() => { if (reading.current === resolve) { reading.current = null; resolve(true); } }, 90_000);
    });
  }, [send]);
  // The learner pointed to a line mid-call: go there now (the line's words are given, so nothing is said from memory).
  // enB: the line's English with Sefaria's bold marked (to line the phrases up by); literal: only its bold words are read.
  const pointTo = useCallback((ref: string, n: number, he: string, en: string, enB?: string, literal?: boolean) => {
    bump();
    // The tap overrides everything: stop a read-through, and drop any answer still on its way (closing it for the voice).
    const r = reading.current; reading.current = null; r?.(false);
    pending.current.forEach((id) => { if (!isAppId(id)) send({ type: 'session.commentary.append', delegation_id: id, content: '(Skip this: the learner just moved to a different place.)' }); });
    pending.current.clear(); partial.current.clear(); exactTold.current.clear();
    userBuf.current = ''; voiceBuf.current = ''; setHeard('');
    setS('speaking');
    const first = he ? splitPieces(he, en)[0] : null; // a long line: its first piece ("next" goes on)
    // Phrase by phrase (each Hebrew phrase, then its English), as the brain's readings are: given as one block (all
    // the Hebrew, then all the English), the voice read the first phrases and then only the English of the rest.
    // The lashon kodesh phrase by phrase, then the English of the whole piece. (Pairing each phrase with its own
    // English by position put English under the wrong Hebrew where the word order differs: "why do I need X and Y"
    // for "X, Y, למה לי". Exact pairs come only from the brain, which pairs by meaning.)
    const hePhrases = first ? voicePhrases(first.he) : [];
    const plainEn = (t: string) => t.replace(/[\u0002\u0003]/g, '').replace(/\s+/g, ' ').trim();
    void enB; void literal; // (kept for the call signature)
    const exact = !first ? '' : READS === 'english' ? first.en.slice(0, 900) : READS === 'gist' ? ''
      : hePhrases.length > 1 ? `${hePhrases.map((x) => toSpeech(x)).join(' … ')}${first.en ? ` … ${plainEn(first.en).slice(0, 900)}` : ''}`
      : `${toSpeech(first.he)}${first.en ? ` — ${first.en.slice(0, 900)}` : ''}`;
    const gist = READS === 'gist' && first?.en ? first.en.slice(0, 900) : '';
    answering.current = true;
    handed.current = { text: exact, at: Date.now() };
    for (const c of chunks(g(`STOP what you are saying right now. The learner tapped ${ref}, line ${n} in the Sefer: that is where we are now, and it overrides wherever you were. ${gist ? `He reads it himself. In English it says: "${gist}". In a sentence or two, give the gist of it in your own words (do not read it), then stop and wait for the learner.` : exact ? `Read it now, the way a chavrusa reads inside: in your American yeshivish accent (never Israeli) and your lively voice, at the speed and with the pauses set in your instructions, with feeling, ${READS === 'english' ? 'the English only (he reads the lashon kodesh himself)' : 'phrase by phrase, the lashon kodesh and then its English'}, leaving nothing out: ${exact}. Then stop and wait for the learner.` : 'Say in a few words that we are there now, and wait for the learner.'} Do not go back to what you were saying before, and do not go past this line by yourself.`))) send({ type: 'session.instructions.append', delegation_id: null, content: c });
    if (exact) { toCheck(`⟪${exact}⟫`); for (const c of textChunks(exact)) send({ type: 'session.commentary.append', delegation_id: null, content: g(c) }); }
  }, [send]);
  pointToRef.current = pointTo;
  // The learner chose something on the Mikraos Gedolos page (a pasuk, a comment, a meforesh on Rashi): read it the way
  // his "who reads" setting says, say briefly what it's bothered by or adds, and wait.
  // A request the app won't send on (a second "go on" while the first is still coming): close it quietly.
  const dismiss = useCallback((id: string) => {
    if (!pending.current.has(id)) return;
    pending.current.delete(id);
    logLine('CHECK', 'a second "go on" while the first is still on its way: going on once, not twice');
    if (!isAppId(id)) send({ type: 'session.commentary.append', delegation_id: id, content: '(Already on its way: say nothing about this one.)' });
  }, [send]);
  const pointText = useCallback((label: string, he: string, en: string) => {
    bump();
    const r = reading.current; reading.current = null; r?.(false);
    pending.current.forEach((id) => { if (!isAppId(id)) send({ type: 'session.commentary.append', delegation_id: id, content: '(Skip this: the learner just moved to a different place.)' }); });
    pending.current.clear(); partial.current.clear(); exactTold.current.clear();
    userBuf.current = ''; voiceBuf.current = ''; setHeard('');
    setS('speaking');
    const heS = he ? toSpeech(he.slice(0, 1500)) : '', enS = en.slice(0, 1500);
    const exact = READS === 'english' ? enS : READS === 'gist' ? '' : `${heS}${enS ? ` — ${enS}` : ''}`;
    answering.current = true;
    handed.current = { text: exact || enS, at: Date.now() };
    const how = READS === 'gist'
      ? `He reads it himself. In English it says: "${enS || '(no English: work from the lashon kodesh you were given)'}"${enS ? '' : `: ${heS}`}. Give its gist in a sentence or two in your own words (do not read it), then briefly what it is bothered by or adds, and stop.`
      : exact
        ? `Read it now, the way a chavrusa reads inside, in your lively voice at the speed and with the pauses set in your instructions, ${READS === 'english' ? 'the English only (he reads the lashon kodesh himself)' : 'phrase by phrase, the lashon kodesh and then its English'}, leaving nothing out. Then, in two or three sentences of your own, say what it is bothered by or what it adds, and stop.`
        : 'Say in a few words that we are there now, and wait.';
    for (const c of chunks(g(`STOP what you are saying right now. The learner chose ${label} on the Mikraos Gedolos page: that is what we are learning now. ${how} Do not go back to what you were saying before.`))) send({ type: 'session.instructions.append', delegation_id: null, content: c });
    if (exact) { toCheck(`⟪${exact}⟫`); for (const c of textChunks(exact)) send({ type: 'session.commentary.append', delegation_id: null, content: g(c) }); }
  }, [send]);
  const stopReading = useCallback(() => { const r = reading.current; reading.current = null; r?.(false); }, []);

  // The rest of the brain's answer (or all of it, if nothing went ahead): give it to the voice to say.
  const answer = useCallback((delegationId: string, text: string) => {
    if (!pending.current.has(delegationId)) return;
    pending.current.delete(delegationId);
    const hadPart = partial.current.delete(delegationId);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    const t = forSpeech(text);
    if (t) handed.current = { text: hadPart ? `${handed.current.text} ${t}` : t, at: Date.now() };
    if (!t && hadPart) return; // everything was already handed over
    // A request the app made itself (keep going by itself, the opening's next piece) has no GPT-Live request behind it,
    // so a result alone is never spoken (log of Nov 6, 2:07 PM: the explanation after the opening's piece was handed
    // and the voice stayed silent). It's told to say it now.
    if (isAppId(delegationId) && t) {
      setS('speaking');
      send({ type: 'session.instructions.append', delegation_id: null, content: `${hadPart ? 'The reading is done. Now say what comes after it' : 'Here is the answer to what the learner just said. Say it now'}, in your own voice (the text that follows), then stop.` });
      for (const c of chunks(t)) send({ type: 'session.commentary.append', delegation_id: null, content: g(c) });
      return;
    }
    if (!t) send({ type: 'session.commentary.append', delegation_id: delegationId, content: 'Let’s keep going.' });
    else for (const c of chunks(t)) send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(c) });
  }, [send]);

  // Read at once, explain after: on "go on" the app hands the voice the next piece right away (readNow), while the
  // brain writes the explanation; that is held until the voice has read the piece to its end (explainAfter), so
  // nothing new arrives in the middle of a reading (that made it stop, pivot, or jump to the next line).
  const early = useRef<{ id: string; text: string; at: number; from: number } | null>(null);
  const readNow = useCallback((delegationId: string, body: string) => {
    if (!pending.current.has(delegationId)) return;
    const ex = forSpeech(body.replace(/\s*\|\s*/g, ' … '));
    if (!ex) return;
    partial.current.add(delegationId);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    setS('speaking');
    handed.current = { text: `⟪${ex}⟫`, at: Date.now() };
    toCheck(`⟪${ex}⟫`);
    early.current = { id: delegationId, text: ex, at: Date.now(), from: voiceAll.current.length };
    logLine('AUTO', 'reading the next piece at once; the explanation follows when it has been read');
    send({ type: 'session.instructions.append', delegation_id: delegationId, content: 'For this result: the text between ⟪ and ⟫ is the next piece of the text itself. Read it now, the way a chavrusa reads inside, in your American yeshivish accent (never Israeli): every phrase in order to the end, each lashon kodesh phrase and then its English. Then stop: what comes after the reading follows in a moment.' });
    for (const c of textChunks(ex)) send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(c) });
  }, [send]);
  const explainAfter = useCallback((delegationId: string, text: string) => {
    const e = early.current;
    if (!e || e.id !== delegationId) { answer(delegationId, text); return; }
    const timer = window.setInterval(() => {
      if (!pending.current.has(delegationId) || !pc.current) { window.clearInterval(timer); early.current = null; return; }
      // He asked something during the reading (a question, "wait"…): the explanation is no longer wanted. ("Mm-hmm",
      // "okay" and the like are not a request, so they don't count.)
      if (lastAskAt.current > e.at) {
        window.clearInterval(timer); early.current = null;
        pending.current.delete(delegationId); partial.current.delete(delegationId);
        logLine('CHECK', 'the learner spoke during the reading: the explanation is left out');
        send({ type: 'session.commentary.append', delegation_id: delegationId, content: '(Nothing more to add here: answer what the learner just said.)' });
        return;
      }
      const said = voiceAll.current.slice(e.from);
      const quietFor = recOut.current ? 0 : Date.now() - lastUtter.current.at;
      const done = !!said.trim() && endHeard(e.text, said);
      if ((done && quietFor > 700) || (Date.now() - e.at > 40_000 && quietFor > 1500)) {
        window.clearInterval(timer); early.current = null;
        logLine('AUTO', done ? 'the piece has been read: now the explanation' : 'the explanation (the reading took long)');
        answer(delegationId, text);
      }
    }, 250);
  }, [answer, send]);

  // The answer has text to say word for word (lashon kodesh phrase by phrase, with its English): the voice is told,
  // for this request, to read that part exactly, every phrase and in order, and only then say the rest.
  const answerExact = useCallback((delegationId: string, exact: string, rest: string) => {
    if (!pending.current.has(delegationId)) return;
    pending.current.delete(delegationId);
    partial.current.delete(delegationId);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    const ex = forSpeech(exact);
    const more = forSpeech(rest);
    handed.current = { text: `${ex} ${more}`, at: Date.now() };
    send({ type: 'session.instructions.append', delegation_id: delegationId, content: 'For this result: the part between ⟪ and ⟫ is the text itself. Read it first, the way a chavrusa reads inside: in your lively voice, at the speed and with the pauses set in your instructions, with feeling, phrase by phrase, the lashon kodesh and then its English, leaving nothing out and keeping its words. Then say the rest in your own words.' });
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(`⟪${ex}⟫${more ? ` ${more}` : ''}`) });
  }, [send]);

  // The whole answer at once (Oct 31 rebuild): what comes before the text, the text to read exactly, and the rest, handed
  // to the voice in one piece when the brain has finished, so it says it as one smooth turn (no waiting for more words
  // mid-sentence, and no instructions arriving mid-answer: how to read TEXT … END is in the call's instructions).
  const answerWhole = useCallback((delegationId: string, before: string, exact: string, after: string) => {
    if (!pending.current.has(delegationId)) return;
    pending.current.delete(delegationId);
    partial.current.delete(delegationId);
    answering.current = true;
    voiceBuf.current = '';
    bump();
    const b = forSpeech(before), ex = forSpeech(exact.replace(/\s*\|\s*/g, ' … ')), a = forSpeech(after);
    const whole = [b, ex ? `⟪${ex}⟫` : '', a].filter(Boolean).join(' ') || 'Let’s keep going.';
    handed.current = { text: whole, at: Date.now() };
    toCheck(whole);
    if (isAppId(delegationId)) {
      setS('speaking');
      send({ type: 'session.instructions.append', delegation_id: null, content: 'Here is the answer to what the learner just said. Say it now, the way you say any result: read the text between ⟪ and ⟫ inside, every phrase, the lashon kodesh and then its English, then the rest in your own words. Then stop and wait.' });
      for (const c of chunks(whole)) send({ type: 'session.commentary.append', delegation_id: null, content: g(c) });
      return;
    }
    for (const c of chunks(whole)) send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(c) });
  }, [send]);

  const exactTold = useRef<Set<string>>(new Set());
  const answerExactPart = useCallback((delegationId: string, exact: string) => {
    if (!pending.current.has(delegationId)) return;
    const ex = forSpeech(exact.replace(/\s*\|\s*/g, ' … '));
    if (!ex) return;
    if (!exactTold.current.has(delegationId)) {
      exactTold.current.add(delegationId);
      send({ type: 'session.instructions.append', delegation_id: delegationId, content: 'For this result: whatever comes between ⟪ and ⟫ is the text itself. Read it as it arrives, the way a chavrusa reads inside: in your lively voice, at the speed and with the pauses set in your instructions, with feeling, phrase by phrase, the lashon kodesh and then its English, leaving nothing out and keeping its words. Say the other parts in your own words.' });
    }
    partial.current.add(delegationId);
    answering.current = true;
    voiceBuf.current = '';
    handed.current = { text: handed.current.at > Date.now() - 60_000 ? `${handed.current.text} ${ex}` : ex, at: Date.now() };
    bump();
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(`⟪${ex}⟫`) });
  }, [send]);

  // ---------- The voice said "one moment" but didn't ask ----------
  // GPT-Live sometimes says its waiting words ("one moment", "let me look") and then never hands the request to the app,
  // so nothing comes and it sits in silence. If no request arrives within 3 seconds of such words (and the learner
  // hasn't spoken since), the app asks the brain itself, with the learner's last words, and has the voice say the answer.
  function watchStall() {
    const u = lastUtter.current;
    if (!/(one moment|one sec|one second|just a (sec|second|moment)|let me (look|check|see|read|find|pull|get)|give me a (sec|second|moment)|hold on|bear with me)[^a-z]*$/i.test(u.text)) return;
    const at = u.at;
    window.setTimeout(() => {
      if (lastUtter.current.at !== at) return;                      // it spoke again since
      if (pending.current.size || lastDelegAt.current > at - 4000) return; // a request did come (or was already on its way)
      if (lastInputAt.current > at || stateRef.current !== 'listening' || !pc.current) return;
      if (quietJobs.current.some((j) => j.name === 'auto')) return; // Keep going by itself will bring the next piece
      const id = `app_${Date.now()}`;
      // A greeting or a short yes isn't a new request: it means go on from where we are.
      const last = lastLearner.current.trim();
      const text = !last || /^(hi|hello|hey|shalom|yes|yeah|yep|sure|right|ok(ay)?|go ahead|go on|ready|let'?s go)[\s.!,]*$/i.test(last) ? 'Yes, go on.' : last;
      logLine('CHECK', `the voice said "${u.text.slice(-40)}" but never asked the app: asking the brain for it ("${text}")`);
      pending.current.add(id);
      setS('thinking');
      optsRef.current.onRequest(text, id);
    }, 3000);
  }
  // Keep going by itself (Settings): after a piece has been read and explained, and it has been quiet for a few seconds
  // (he didn't speak), the app asks for the next piece itself. Not after a question (he should answer it), and not
  // while he has said to stop or wait, until he says to go on again.
  const autoHold = useRef(false);
  const autoArmed = useRef(false); // a piece was read or answered and nothing has been said since: go on when quiet
  const pointOpen = useRef<{ ref: string; n: number; he: string; en: string; enB?: string; literal?: boolean } | null>(null); // a tapped line to open the call with
  const oldOpen = useRef(false);
  const openingNow = useRef<{ text: string; speaks: boolean } | null>(null); // the voice's opening, given once sound flows // "Open calls the Nov 3 way" (a test): no app-brought opening, no silent-start retry
  const autoStart = useRef(false); // the opening said where we are: go on after it by itself (Keep going by itself)
  function autoNext(force = false) {
    const secs = optsRef.current.autoGo?.() ?? 0;
    if (!secs || autoHold.current || (!force && /\?\s*["”']?\s*$/.test(lastUtter.current.text))) return;
    const at = lastUtter.current.at;
    quietJobs.current = quietJobs.current.filter((j) => j.name !== 'auto'); // a newer stretch of speech replaces the wait
    whenQuiet('auto', () => {
      if (lastUtter.current.at !== at || autoHold.current || pending.current.size || lastInputAt.current > at || !pc.current) return;
      autoArmed.current = false;
      const id = `app_${Date.now()}`;
      logLine('──', `keep going by itself: ${secs} s quiet after the piece, asking for the next one`);
      pending.current.add(id);
      setS('thinking');
      optsRef.current.onRequest('next', id);
    }, secs * 1000);
  }
  // An answer to a request the app made itself (above) has no GPT-Live request to attach to: it's handed to the voice
  // as something to say now.
  const isAppId = (id: string) => id.startsWith('app_');

  // ---------- Keeping it steady ----------
  // Run a job once the voice has really finished (its sound, not just its words) and nobody is talking. One job per
  // quiet moment: a job that makes the voice speak (reading what it skipped) is followed by the next one later.
  // `need`: how long it must be quiet first (long enough that a pause in the reading isn't taken for its end).
  function whenQuiet(name: string, run: () => void, need = 4000) {
    if (quietJobs.current.some((j) => j.name === name)) return;
    // In order: checking the reading (and reading what was skipped) first, then going on by itself, then a fresh start
    // (which ends this connection).
    const rank = (n: string) => (n === 'check' || n === 'skip' ? 0 : n === 'auto' ? 1 : 2);
    const at = quietJobs.current.findIndex((j) => rank(j.name) > rank(name));
    if (at < 0) quietJobs.current.push({ name, run, need }); else quietJobs.current.splice(at, 0, { name, run, need });
    if (quietTimer.current) return;
    let since = 0;
    const t0 = Date.now();
    quietTimer.current = window.setInterval(async () => {
      const peer = pc.current;
      const st = stateRef.current;
      if (!peer || st === 'off' || st === 'paused' || !quietJobs.current.length || Date.now() - t0 > 120_000) {
        window.clearInterval(quietTimer.current); quietTimer.current = undefined; quietJobs.current = []; return;
      }
      let level = -1; // how loud the voice's sound is right now (when the browser can tell)
      try { (await peer.getStats()).forEach((r: { type?: string; kind?: string; audioLevel?: number }) => { if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') level = r.audioLevel; }); } catch { /* fall back to the estimate */ }
      const sounding = level >= 0 ? level > 0.015 : Date.now() < estEnd.current;
      const busy = st !== 'listening' || pending.current.size > 0 || !!recIn.current.text || Date.now() - lastInputAt.current < 1500 || sounding || !!reading.current;
      if (busy) { since = 0; return; }
      if (!since) { since = Date.now(); return; }
      if (Date.now() - since < quietJobs.current[0].need) return;
      // The quiet keeps counting: the next job waits only for its own need (a job that makes the voice speak ends
      // the quiet by itself).
      const job = quietJobs.current.shift();
      if (!quietJobs.current.length) { window.clearInterval(quietTimer.current); quietTimer.current = undefined; }
      job?.run();
    }, 250);
  }
  // Remember the text the voice was just given to read, to check afterwards that it all came out.
  function toCheck(handedText: string, redo = 0) {
    const blocks = [...handedText.matchAll(/⟪([\s\S]*?)⟫/g)].map((m) => m[1].trim()).filter(Boolean);
    check.current = blocks.length ? { text: blocks.join(' … '), from: voiceAll.current.length, at: Date.now(), redo } : null;
  }
  // The voice finished a turn: if it clearly left out the end of the text, have it read the rest (once).
  function checkSkip() {
    if (!check.current || optsRef.current.checkOn?.() === false) return;
    // Judged only once it has really finished: a pause between phrases is not the end.
    whenQuiet('check', () => { if (check.current) judgeSkip(); }, 1500); // (was 4 s: it held keep going by itself back to 5–7 s between pieces; Nov 8)
  }
  function judgeSkip() {
    const c = check.current;
    if (!c) return;
    check.current = null;
    if (lastInputAt.current > c.at) return; // the learner cut in: stopping was right
    const said = voiceAll.current.slice(c.from);
    const tail = missingTail(c.text, said);
    const heGap = !tail && optsRef.current.checkHeOn?.() !== false ? missingHebrew(c.text, said) : null;
    const left = tail ?? heGap;
    if (!left) return;
    logLine('CHECK', `${tail ? 'the voice left out the end of the text' : 'the voice left out the Hebrew of'}: "${left.slice(0, 300)}"${c.redo ? ' (already asked once: leaving it)' : tail ? ': asking it to read the rest' : ': asking it to read that again, inside'}`);
    if (c.redo) return;
    whenQuiet('skip', () => {
      if (lastInputAt.current > c.at) return;
      answering.current = true;
      handed.current = { text: left, at: Date.now() };
      setS('speaking');
      const content = `⟪${left}⟫`;
      toCheck(content, 1);
      sendRef.current({ type: 'session.instructions.append', delegation_id: null, content: tail
        ? 'You stopped before the end of the text. Say "and the rest of it:" (a few words, no apology), then read the rest of the text now, the way you read inside, every phrase in order to the very end. Do not repeat what you already read. Then stop and wait.'
        : 'You left out the Hebrew of part of the text. Say "let me read that inside:" (a few words, no apology), then read this part now the way you read inside: every Hebrew phrase in the Hebrew, every word of it, and then its English, in order to the end. Then stop and wait.' });
      sendRef.current({ type: 'session.commentary.append', delegation_id: null, content: g(content) });
    }, 300);
  }
  // A new section: at the next quiet moment, quietly reconnect, so the voice starts clean (it keeps the place and the
  // conversation, from the session). Long calls drift; a fresh connection doesn't carry that drift.
  const freshStart = useCallback(() => {
    // Not in a call's first minute: the place often updates just as a call opens, and that isn't a new section.
    if (!pc.current || !startedAt.current || Date.now() - startedAt.current < 60000) return;
    whenQuiet('fresh', () => {
      if (!pc.current || closingTo.current) return;
      logLine('──', 'fresh start (new section): reconnecting');
      refreshing.current = true;
      closingTo.current = 'paused';
      sendRef.current({ type: 'session.close' });
      window.setTimeout(() => {
        if (pc.current) { closingTo.current = null; finish('paused'); }
        refreshing.current = false;
        void startRef.current?.();
      }, 400);
    });
  }, [finish]);

  // The voice opens a new call within a second or two. Sometimes OpenAI never finishes setting the voice up (the call
  // connects, the mic is on, and nothing happens; OpenAI's error at the end says its "context injection" never
  // completed). So: if the voice has said nothing 6 seconds after connecting (counted from when the app's first piece
  // is ready, if the app is bringing one), and the learner hasn't spoken, reconnect once; if it's silent again, say so.
  // The opening waits for sound: OpenAI is given the voice's opening only once the phone's sound is really going out
  // to it (a call that began with no sound got stuck loading its opening and never spoke, even after sound came).
  // No sound after 1.2 s, or 3 s: swap in a fresh microphone (an iPhone microphone can be "live" but send nothing).
  // After 7 s it goes ahead anyway.
  function whenSoundFlows(peer: RTCPeerConnection, go: () => void) {
    const t0 = Date.now();
    let swaps = 0, done = false;
    const swap = () => {
      swaps++;
      logLine('AUDIO', 'no sound is going out to OpenAI yet: swapping in a fresh microphone');
      getMic(true).then((fresh) => {
        if (pc.current !== peer) return;
        const sender = peer.getSenders().find((x) => x.track?.kind === 'audio');
        mic.current = fresh;
        return sender?.replaceTrack(fresh.getAudioTracks()[0]);
      }).catch((e) => logLine('ERROR', `could not get a fresh microphone: ${(e as Error).message}`));
    };
    const t = window.setInterval(async () => {
      if (done) return;
      if (pc.current !== peer) { window.clearInterval(t); return; }
      let sent = 0;
      try { (await peer.getStats()).forEach((r: { type?: string; kind?: string; packetsSent?: number }) => { if (r.type === 'outbound-rtp' && r.kind === 'audio' && typeof r.packetsSent === 'number') sent = r.packetsSent; }); } catch { /* not available */ }
      const ms = Date.now() - t0;
      if (sent >= 5 || ms > 7000) {
        done = true; window.clearInterval(t);
        logLine('AUDIO', sent >= 5 ? `sound is going out (${sent} packets after ${(ms / 1000).toFixed(1)} s): now the opening` : 'still no sound going out after 7 s: giving the opening anyway');
        go();
        return;
      }
      if ((ms > 1200 && swaps === 0) || (ms > 3000 && swaps === 1)) swap();
    }, 200);
  }
  function openWatch(peer: RTCPeerConnection) {
    const opened = Date.now();
    let waitFrom = opened;
    const t = window.setInterval(() => {
      const now = Date.now();
      if (pc.current !== peer || closingTo.current || recOut.current || lastUtter.current.at > opened || lastInputAt.current > opened || now - opened > 60_000) { window.clearInterval(t); return; }
      if (pending.current.size) { waitFrom = now; return; } // the brain is still preparing what the voice will say
      // 6 s on the first try; the retry gets longer (some sessions are only slow to start, not stuck).
      if (now - waitFrom < (silentTry.current ? 15000 : 6000)) return;
      window.clearInterval(t);
      if (silentTry.current >= 1) {
        logLine('ERROR', `the voice said nothing for 15 s after reconnecting: stopping (OpenAI never started the voice)`);
        closingTo.current = 'off';
        sendRef.current({ type: 'session.close' });
        window.setTimeout(() => { if (pc.current === peer) { closingTo.current = null; finish('off'); } }, 300);
        optsRef.current.onError('OpenAI’s voice isn’t answering right now. Try again in a few minutes.');
        return;
      }
      silentTry.current++;
      logLine('CHECK', 'the voice said nothing for 6 s after connecting: reconnecting once (waiting up to 15 s this time), with a plain opening (only the place: no tapped line, no recap, no session instructions)');
      refreshing.current = true;
      closingTo.current = 'paused';
      sendRef.current({ type: 'session.close' });
      window.setTimeout(() => {
        if (pc.current === peer) { closingTo.current = null; finish('paused'); }
        refreshing.current = false;
        void startRef.current?.('silent');
      }, 300);
    }, 500);
  }
  const start = useCallback(async (retry: boolean | 'silent' = false) => {
    if (!retry && stateRef.current !== 'off' && stateRef.current !== 'paused') return;
    // Coming back from a pause: no new greeting. A retry opens the same way as the try it replaces.
    const resuming = retry ? firstResume.current : stateRef.current === 'paused';
    if (!retry) { firstResume.current = resuming; silentTry.current = 0; }
    stopWakeWatch();
    closingTo.current = null;
    if (!retry) logBegin(optsRef.current.logMeta?.() ?? '', resuming);
    setS('connecting');
    // The player starts inside the tap, before anything is awaited: phones only allow sound that a tap began.
    if (!audio.current) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.style.display = 'none';
      el.volume = 1;
      document.body.appendChild(el);
      audio.current = el;
    }
    if (!audio.current.srcObject) { audio.current.src = silentWav(); audio.current.play().catch(() => {}); }
    // A connection that never opens would leave Talk on "Connecting…" forever: 15 seconds after the microphone is
    // open (time spent on the phone's "allow microphone?" question doesn't count), try once more, then say so.
    const attempt = ++connectTry.current;
    const armLimit = () => window.setTimeout(() => {
      if (connectTry.current !== attempt || stateRef.current !== 'connecting') return;
      logLine('ERROR', `still connecting after 15 s${retry ? ' (second try)' : ', trying again'}`);
      teardown();
      if (!retry) { void startRef.current?.(true); return; }
      optsRef.current.onError('The voice didn’t connect. Check the internet connection and tap Talk again.');
      logEnd('did not connect');
      setS('off');
    }, 15_000);
    try {
      const stream = await getMicForCall((w) => logLine('MIC', w));
      if (connectTry.current !== attempt) return;
      mic.current = stream;
      armLimit();
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.current = peer;
      peer.ontrack = (ev) => { if (audio.current) { audio.current.removeAttribute('src'); audio.current.srcObject = ev.streams[0]; audio.current.play().catch(() => {}); } };
      stream.getAudioTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore */ } };
      channel.onopen = () => {
        startedAt.current = Date.now(); bump(); setS('listening'); micWatch(peer);
        // With Keep going by itself the voice is told not to open the call: the app brings the next piece right away
        // (the voice opens with a few words as it reads it).
        const opened = Date.now();
        if (oldOpen.current) {
          // The Nov 3 way (a test): the voice opens the call; with Keep going by itself, after 6 silent seconds the app
          // brings the next piece.
          logLine('──', 'opening the Nov 3 way (a test)');
          window.setTimeout(() => {
            if (pc.current !== peer || !autoStart.current || lastUtter.current.at > opened || recOut.current || lastInputAt.current > opened || pending.current.size) return;
            autoStart.current = false;
            const id = `app_${Date.now()}`;
            logLine('CHECK', 'the voice didn\'t open the call: going on by itself');
            pending.current.add(id);
            setS('thinking');
            optsRef.current.onRequest('Yes, go on.', id);
          }, 6000);
        } else whenSoundFlows(peer, () => {
          if (pc.current !== peer) return;
          const op = openingNow.current; openingNow.current = null;
          if (op) {
            // The opening: what the voice was told to do at the start of this call (greet, pick up where we were, wait…).
            // In pieces: OpenAI takes at most 500 tokens per message (a long recap was turned down whole).
            for (const c of chunks(op.text)) send({ type: 'session.instructions.append', delegation_id: null, content: c });
            if (op.speaks) send({ type: 'session.commentary.append', delegation_id: null, content: '(The call is open and the learner is listening: open it now, as your instructions say.)' });
          }
          if (!resuming) openWatch(peer);
          window.setTimeout(() => {
          if (pc.current === peer && pointOpen.current && !recOut.current && lastInputAt.current <= opened) {
            const p = pointOpen.current; pointOpen.current = null; autoStart.current = false;
            logLine('AUTO', `opening the call with the line you tapped (${p.ref}, line ${p.n})`);
            pointToRef.current?.(p.ref, p.n, p.he, p.en, p.enB, p.literal);
            return;
          }
          pointOpen.current = null;
          if (pc.current !== peer || !autoStart.current || lastUtter.current.at > opened || recOut.current || lastInputAt.current > opened || pending.current.size) return;
          autoStart.current = false;
          const id = `app_${Date.now()}`;
          logLine('AUTO', 'opening the call with the next piece');
          pending.current.add(id);
          setS('thinking');
          optsRef.current.onRequest('Yes, go on.', id);
          }, 400);
        });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          if (pc.current === peer) { optsRef.current.onError('The live connection dropped. Tap Talk to reconnect.'); finish('off'); }
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sid = optsRef.current.sessionId?.();
      const q = new URLSearchParams();
      if (sid) q.set('session', sid);
      if (resuming) q.set('resume', '1');
      if (retry === 'silent') q.set('plain', '1');
      const res = await fetch(`/api/live/session${q.toString() ? `?${q}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const data = await res.json().catch(() => ({}));
      if (connectTry.current !== attempt) { try { peer.close(); } catch { /* ignore */ } return; } // ended while connecting
      if (!res.ok || !data.sdp) throw new Error(data.error ?? `status ${res.status}`);
      if (data.speech) { speech.current = { spell: data.speech.spell ?? 'stressed', myWay: Array.isArray(data.speech.myWay) ? data.speech.myWay : [], house: data.speech.house !== false }; if (data.speech.heRead) HE_MODE = data.speech.heRead; if (data.speech.reads) READS = data.speech.reads; autoStart.current = data.speech.autoStart === true; pointOpen.current = data.speech.point && typeof data.speech.point.ref === 'string' ? data.speech.point : null; oldOpen.current = data.speech.oldOpen === true; openingNow.current = typeof data.speech.opening === 'string' && data.speech.opening ? { text: data.speech.opening, speaks: data.speech.openingSpeaks === true } : null; }
      await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      if (data.rulesUsed) logLine('──', `in this call: voice ${data.voiceUsed ?? '?'} · Hebrew given as ${data.speech?.heRead ?? '?'} · rules: ${data.rulesUsed}`);
      if (data.sizes) logLine('──', `sent to OpenAI at the start: ${data.sizes}`);
      if (data.notice) { logLine('──', String(data.notice)); optsRef.current.onError(String(data.notice)); }
    } catch (err) {
      const msg = /microphone didn't open/.test((err as Error).message)
        ? 'The microphone didn’t open. Tap Talk again.'
        : (err as Error).name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
        : /quota|billing|insufficient|credit|payment/i.test((err as Error).message)
          ? `Your OpenAI account is out of credit, so the voice can't start. Add credit at platform.openai.com → Settings → Billing, then tap Talk again. (${(err as Error).message})`
          : `Could not start the live voice: ${(err as Error).message}`;
      if (connectTry.current !== attempt) return; // the time limit already moved on to another try
      connectTry.current++;
      logLine('ERROR', msg);
      teardown();
      // One quiet retry for a network hiccup; a blocked microphone or a server message is shown right away.
      if (!retry && (err as Error).name !== 'NotAllowedError' && /fetch|network|load failed|status 5/i.test((err as Error).message)) { void startRef.current?.(true); return; }
      optsRef.current.onError(msg);
      logEnd('could not start');
      setS('off');
    }
  }, [onEvent, finish, teardown, stopWakeWatch]);
  startRef.current = start;

  // While paused: listen locally (free, nothing is sent anywhere) and reconnect when the learner speaks.
  const startWakeWatch = useCallback(async () => {
    if (wake.current) return;
    try {
      const stream = await getMic();
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume().catch(() => {});
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
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
          else if (Date.now() - loudSince > 250) { stopWakeWatch(); start(); }
        } else loudSince = 0;
      }, 80);
      wake.current = { stream, ctx, timer };
    } catch { /* if the mic can't be opened, the learner can still tap Resume */ }
  }, [start, stopWakeWatch]);

  startWakeRef.current = startWakeWatch;

  const pause = useCallback(() => {
    if (closingTo.current) return;
    closingTo.current = 'paused';
    send({ type: 'session.close' });
    window.setTimeout(() => {
      if (!pc.current) return; // already handled by session.closed
      closingTo.current = null;
      finish('paused');
      if (optsRef.current.wakeOnSpeech()) startWakeWatch();
    }, 400);
  }, [send, finish, startWakeWatch]);

  // End the call completely.
  // The learner ends the call: it ends right away, even while it's still connecting (a try still on its way is
  // dropped), and the microphone is let go at once (it's kept only across the app's own reconnects).
  const stop = useCallback(() => {
    stopWakeWatch();
    connectTry.current++;
    if (stateRef.current === 'paused') { setS('off'); setPauseIn(null); releaseMicNow(); return; }
    if (!pc.current || stateRef.current === 'connecting') {
      teardown(); releaseMicNow();
      if (stateRef.current !== 'off') logEnd('ended while connecting');
      setS('off'); setPauseIn(null);
      return;
    }
    closingTo.current = 'off';
    send({ type: 'session.close' });
    window.setTimeout(() => { if (pc.current) { closingTo.current = null; finish('off'); } releaseMicNow(); }, 400);
  }, [send, finish, teardown, stopWakeWatch]);

  // The quiet clock: runs only while nobody is talking and nothing is being worked on.
  useEffect(() => {
    if (state === 'off' || state === 'paused' || state === 'connecting') { setPauseIn(null); return; }
    const id = window.setInterval(() => {
      const limit = optsRef.current.idleSeconds();
      if (pending.current.size > 0 || optsRef.current.isBusy() || stateRef.current === 'speaking') bump();
      if (!limit) { setPauseIn(null); return; }
      const idle = (Date.now() - lastActivity.current) / 1000;
      const left = limit - idle;
      setPauseIn(left <= 10 && left > 0 ? Math.ceil(left) : null);
      if (left <= 0) pause();
    }, 1000);
    return () => clearInterval(id);
  }, [state, pause]);

  const supported = typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const remind = useCallback(() => { remindDirty.current = true; }, []);
  // A coach note: slipped to the voice privately, for its next reply on.
  const note = useCallback((text: string) => {
    if (!text.trim()) return;
    send({ type: 'session.instructions.append', delegation_id: null, content: `COACH NOTE from the app (private: never mention it or answer it; just apply it from your next reply on): ${g(text)}` });
  }, [send]);
  return { readNow, explainAfter, dismiss, freshStart, remind, note, state, heard, supported, start, stop, answer, answerWhole, answerPart, answerExact, answerExactPart, read, stopReading, pointTo, pointText, pauseIn, keepAwake: bump, active: state !== 'off' };
}
