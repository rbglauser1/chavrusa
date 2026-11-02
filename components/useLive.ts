'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { heReadNote, voiceHe, type HeRead } from '@/lib/hebrew';
import { splitPieces } from '@/lib/pieces';
import { forVoice, type GeminiSpell, type SayMyWay } from '@/lib/geminiSpeech';
import { logBegin, logEnd, logLine } from '@/lib/callLog';
import { silentWav } from './useVoice';
import { missingTail } from '@/lib/skipCheck';

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

const MAX_CHARS = 1800; // the voice accepts about 500 tokens per hand-back

function forSpeech(text: string): string {
  return text.replace(/\[\[\/?say\]\]/gi, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
}
// A long answer is handed over in several pieces (each within what the voice accepts at once), split at the end
// of a sentence, so nothing is cut off in the middle.
function chunks(t: string): string[] {
  const out: string[] = [];
  let rest = t;
  while (rest.length > MAX_CHARS) {
    const cut = rest.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'), cut.lastIndexOf(' | '));
    const at = end > 400 ? end + 1 : cut.lastIndexOf(' ') > 400 ? cut.lastIndexOf(' ') : MAX_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

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
  const startRef = useRef<((retry?: boolean) => Promise<void>) | null>(null);
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

  const send = useCallback((obj: Record<string, unknown>) => {
    const ch = dc.current;
    const o = obj as { type?: string; delegation_id?: string | null; content?: string };
    logLine('APP→VOICE', `${o.type ?? '?'}${o.delegation_id ? ` [${String(o.delegation_id).slice(-5)}]` : ''}${o.content ? `: ${String(o.content).slice(0, 900)}` : ''}${ch && ch.readyState === 'open' ? '' : ' (NOT SENT: channel closed)'}`);
    if (ch && ch.readyState === 'open') ch.send(JSON.stringify({ event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...obj }));
  }, []);
  sendRef.current = send;

  const teardown = useCallback(() => {
    try { dc.current?.close(); } catch { /* ignore */ }
    try { pc.current?.close(); } catch { /* ignore */ }
    mic.current?.getTracks().forEach((t) => t.stop());
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
    w.stream.getTracks().forEach((t) => t.stop());
    w.ctx.close().catch(() => {});
    wake.current = null;
  }, []);

  useEffect(() => () => { teardown(); stopWakeWatch(); }, [teardown, stopWakeWatch]);

  // Wait until the learner's words have stopped arriving, then hand them to the brain.
  const handleDelegation = useCallback((delegationId: string) => {
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
          recIn.current.timer = window.setTimeout(() => { logLine('LEARNER', `■ "${recIn.current.text.trim()}"`); recIn.current.text = ''; }, 1200);
          lastInputAt.current = Date.now();
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
          if (recOut.current) { logLine('VOICE', `■ stopped after ${((Date.now() - 900 - recOutAt.current) / 1000).toFixed(1)} s: "${recOut.current.trim()}"`); recOut.current = ''; }
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
          if (!pending.current.size) answering.current = false;
          voiceBuf.current = pending.current.size ? '' : voiceBuf.current;
          if (!pending.current.size) checkSkip();
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
  const pointTo = useCallback((ref: string, n: number, he: string, en: string) => {
    bump();
    // The tap overrides everything: stop a read-through, and drop any answer still on its way (closing it for the voice).
    const r = reading.current; reading.current = null; r?.(false);
    pending.current.forEach((id) => send({ type: 'session.commentary.append', delegation_id: id, content: '(Skip this: the learner just moved to a different place.)' }));
    pending.current.clear(); partial.current.clear(); exactTold.current.clear();
    userBuf.current = ''; voiceBuf.current = ''; setHeard('');
    setS('speaking');
    const first = he ? splitPieces(he, en)[0] : null; // a long line: its first piece ("next" goes on)
    const exact = !first ? '' : READS === 'english' ? first.en.slice(0, 900) : READS === 'gist' ? '' : `${toSpeech(first.he)}${first.en ? ` — ${first.en.slice(0, 900)}` : ''}`;
    const gist = READS === 'gist' && first?.en ? first.en.slice(0, 900) : '';
    answering.current = true;
    handed.current = { text: exact, at: Date.now() };
    send({ type: 'session.instructions.append', delegation_id: null, content: g(`STOP what you are saying right now. The learner tapped ${ref}, line ${n} in the Sefer: that is where we are now, and it overrides wherever you were. ${gist ? `He reads it himself. In English it says: "${gist}". In a sentence or two, give the gist of it in your own words (do not read it), then stop and wait for the learner.` : exact ? `Read it now, the way a chavrusa reads inside: in your lively voice, at the speed and with the pauses set in your instructions, with feeling, ${READS === 'english' ? 'the English only (he reads the lashon kodesh himself)' : 'phrase by phrase, the lashon kodesh and then its English'}, leaving nothing out: ${exact}. Then stop and wait for the learner.` : 'Say in a few words that we are there now, and wait for the learner.'} Do not go back to what you were saying before, and do not go past this line by yourself.`) });
    if (exact) { toCheck(`⟪${exact}⟫`); send({ type: 'session.commentary.append', delegation_id: null, content: g(`⟪${exact}⟫`) }); }
  }, [send]);
  // The learner chose something on the Mikraos Gedolos page (a pasuk, a comment, a meforesh on Rashi): read it the way
  // his "who reads" setting says, say briefly what it's bothered by or adds, and wait.
  const pointText = useCallback((label: string, he: string, en: string) => {
    bump();
    const r = reading.current; reading.current = null; r?.(false);
    pending.current.forEach((id) => send({ type: 'session.commentary.append', delegation_id: id, content: '(Skip this: the learner just moved to a different place.)' }));
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
    send({ type: 'session.instructions.append', delegation_id: null, content: g(`STOP what you are saying right now. The learner chose ${label} on the Mikraos Gedolos page: that is what we are learning now. ${how} Do not go back to what you were saying before.`) });
    if (exact) { toCheck(`⟪${exact}⟫`); send({ type: 'session.commentary.append', delegation_id: null, content: g(`⟪${exact}⟫`) }); }
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
    if (!t) send({ type: 'session.commentary.append', delegation_id: delegationId, content: 'Let’s keep going.' });
    else for (const c of chunks(t)) send({ type: 'session.commentary.append', delegation_id: delegationId, content: g(c) });
  }, [send]);

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

  // ---------- Keeping it steady ----------
  // Run a job once the voice has really finished (its sound, not just its words) and nobody is talking. One job per
  // quiet moment: a job that makes the voice speak (reading what it skipped) is followed by the next one later.
  // `need`: how long it must be quiet first (long enough that a pause in the reading isn't taken for its end).
  function whenQuiet(name: string, run: () => void, need = 4000) {
    if (quietJobs.current.some((j) => j.name === name)) return;
    // Checking the reading comes before a fresh start (which would end this connection).
    if (name === 'fresh') quietJobs.current.push({ name, run, need }); else quietJobs.current.unshift({ name, run, need });
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
      since = 0;
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
    whenQuiet('check', () => { if (check.current) judgeSkip(); }, 4000);
  }
  function judgeSkip() {
    const c = check.current;
    if (!c) return;
    check.current = null;
    if (lastInputAt.current > c.at) return; // the learner cut in: stopping was right
    const said = voiceAll.current.slice(c.from);
    const left = missingTail(c.text, said);
    if (!left) return;
    logLine('CHECK', `the voice left out the end of the text: "${left.slice(0, 300)}"${c.redo ? ' (already asked once: leaving it)' : ': asking it to read the rest'}`);
    if (c.redo) return;
    whenQuiet('skip', () => {
      if (lastInputAt.current > c.at) return;
      answering.current = true;
      handed.current = { text: left, at: Date.now() };
      setS('speaking');
      const content = `⟪${left}⟫`;
      toCheck(content, 1);
      sendRef.current({ type: 'session.instructions.append', delegation_id: null, content: 'You stopped before the end of the text. Say "and the rest of it:" (a few words, no apology), then read the rest of the text now, the way you read inside, every phrase in order to the very end. Do not repeat what you already read. Then stop and wait.' });
      sendRef.current({ type: 'session.commentary.append', delegation_id: null, content: g(content) });
    }, 300);
  }
  // A new section: at the next quiet moment, quietly reconnect, so the voice starts clean (it keeps the place and the
  // conversation, from the session). Long calls drift; a fresh connection doesn't carry that drift.
  const freshStart = useCallback(() => {
    if (!pc.current) return;
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

  const start = useCallback(async (retry = false) => {
    if (!retry && stateRef.current !== 'off' && stateRef.current !== 'paused') return;
    const resuming = retry || stateRef.current === 'paused'; // coming back from a pause (or a retry): no new greeting
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (connectTry.current !== attempt) { stream.getTracks().forEach((t) => t.stop()); return; }
      mic.current = stream;
      armLimit();
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.current = peer;
      peer.ontrack = (ev) => { if (audio.current) { audio.current.removeAttribute('src'); audio.current.srcObject = ev.streams[0]; audio.current.play().catch(() => {}); } };
      stream.getAudioTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore */ } };
      channel.onopen = () => { startedAt.current = Date.now(); bump(); setS('listening'); };
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
      const res = await fetch(`/api/live/session${q.toString() ? `?${q}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sdp) throw new Error(data.error ?? `status ${res.status}`);
      if (data.speech) { speech.current = { spell: data.speech.spell ?? 'stressed', myWay: Array.isArray(data.speech.myWay) ? data.speech.myWay : [], house: data.speech.house !== false }; if (data.speech.heRead) HE_MODE = data.speech.heRead; if (data.speech.reads) READS = data.speech.reads; }
      await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      if (data.notice) { logLine('──', String(data.notice)); optsRef.current.onError(String(data.notice)); }
    } catch (err) {
      const msg = (err as Error).name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
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
  const stop = useCallback(() => {
    stopWakeWatch();
    if (stateRef.current === 'paused') { setS('off'); setPauseIn(null); return; }
    closingTo.current = 'off';
    send({ type: 'session.close' });
    window.setTimeout(() => { if (pc.current) { closingTo.current = null; finish('off'); } }, 400);
  }, [send, finish, stopWakeWatch]);

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
  return { freshStart, remind, note, state, heard, supported, start, stop, answer, answerWhole, answerPart, answerExact, answerExactPart, read, stopReading, pointTo, pointText, pauseIn, keepAwake: bump, active: state !== 'off' };
}
