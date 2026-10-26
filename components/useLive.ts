'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';

const toSpeech = (he: string) => yeshivishTranslit(namesForSpeech(he), false);

// Live voice: a GPT-Live session over WebRTC. The voice model listens and speaks naturally; whenever the
// learner says something about the learning, it "delegates" to us. We send the learner's words to the
// Chavrusa brain (/api/chat) and hand the answer back for the voice to say.

export type LiveState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused';

const MAX_CHARS = 1800; // the voice accepts about 500 tokens per hand-back

function forSpeech(text: string): string {
  const t = text.replace(/\[\[\/?say\]\]/gi, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
  if (t.length <= MAX_CHARS) return t;
  const cut = t.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  return end > 400 ? cut.slice(0, end + 1) : cut;
}

export function useLive(opts: {
  onRequest: (text: string, delegationId: string) => void; // learner said something: ask the brain
  onError: (msg: string) => void;
  onEnded: (seconds: number) => void;          // a connected stretch ended (for cost tracking)
  isBusy: () => boolean;                        // the brain is still working on something
  idleSeconds: () => number;                    // pause after this much quiet (0 = never)
  wakeOnSpeech: () => boolean;
  sessionId?: () => string | null;
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
  const closingTo = useRef<'off' | 'paused' | null>(null); // set when we asked the session to close
  const startWakeRef = useRef<(() => void) | null>(null);
  const setS = (s: LiveState) => { stateRef.current = s; setState(s); };

  const send = useCallback((obj: Record<string, unknown>) => {
    const ch = dc.current;
    if (ch && ch.readyState === 'open') ch.send(JSON.stringify({ event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...obj }));
  }, []);

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
      optsRef.current.onRequest(text, delegationId);
    };
    tick();
  }, [send]);

  const onEvent = useCallback((e: any) => {
    switch (e?.type) {
      case 'session.input_transcript.delta':
        if (typeof e.delta === 'string') {
          userBuf.current += e.delta;
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
        if (speakTimer.current) clearTimeout(speakTimer.current);
        speakTimer.current = window.setTimeout(() => {
          if (stateRef.current === 'speaking') setS(pending.current.size ? 'thinking' : 'listening');
          // The voice finished a reply it made by itself: record the exchange so the session (and the brain) has it.
          if (!pending.current.size && !answering.current && voiceBuf.current.trim() && !echoesHanded(voiceBuf.current)) {
            const learner = userBuf.current.trim();
            const said = voiceBuf.current.trim();
            userBuf.current = '';
            voiceBuf.current = '';
            setHeard('');
            optsRef.current.onAside?.(learner, said);
          }
          if (!pending.current.size) answering.current = false;
          voiceBuf.current = pending.current.size ? '' : voiceBuf.current;
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
          if (to === 'paused' && optsRef.current.wakeOnSpeech()) startWakeRef.current?.();
        }
        break;
      case 'error':
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
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: t });
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
      send({ type: 'session.instructions.append', delegation_id: null, content: `Immediately read the following aloud, exactly as written, word for word and in full, at a steady pace, with no pauses between verses. Do not add, explain, comment, or ask anything. The lashon kodesh is written in English letters, syllables split by hyphens, with the STRESSED syllable in CAPITALS (be-REI-shis BO-ro e-LOI-kim): say it as written and stress the capitalized syllable strongly and clearly; that is the yeshivish stress. Wherever the text has הַשֵּׁם say \"Hashem\", and say \"Elokim\" (and Elokeinu, Elokecha…) where written with a kuf. Read the English naturally.\n\n${text}` });
      window.setTimeout(() => { if (reading.current === resolve) { reading.current = null; resolve(true); } }, 90_000);
    });
  }, [send]);
  // The learner pointed to a line mid-call: go there now (the line's words are given, so nothing is said from memory).
  const pointTo = useCallback((ref: string, n: number, he: string, en: string) => {
    bump();
    const words = he ? `It reads: ${toSpeech(he)}${en ? ` — in English: "${en.slice(0, 600)}"` : ''}` : '';
    send({ type: 'session.commentary.append', delegation_id: null, content: `The learner just pointed to ${ref}, line ${n}. Go there now: stop what you were doing and start learning from this line. ${words} Say it phrase by phrase (lashon kodesh, then English) and continue in the learning style.` });
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
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: t || 'Let’s keep going.' });
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
    send({ type: 'session.instructions.append', delegation_id: delegationId, content: 'For this result: first read the part between READ EXACTLY and END word for word, every phrase, in order, the lashon kodesh and then its English exactly as written. Do not skip, shorten, summarize, or translate it differently, and do not drop the Hebrew. Then say the rest naturally.' });
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: `READ EXACTLY: ${ex} END.${more ? ` Then: ${more}` : ''}` });
  }, [send]);

  const start = useCallback(async () => {
    if (stateRef.current !== 'off' && stateRef.current !== 'paused') return;
    const resuming = stateRef.current === 'paused'; // coming back from a pause: no new greeting
    stopWakeWatch();
    closingTo.current = null;
    setS('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mic.current = stream;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.current = peer;
      // A real <audio> element in the page, set to play inline, gives phones the cleanest call playback.
      if (!audio.current) {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        el.style.display = 'none';
        el.volume = 1;
        document.body.appendChild(el);
        audio.current = el;
      }
      peer.ontrack = (ev) => { if (audio.current) { audio.current.srcObject = ev.streams[0]; audio.current.play().catch(() => {}); } };
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
      await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    } catch (err) {
      const msg = (err as Error).name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
        : `Could not start the live voice: ${(err as Error).message}`;
      optsRef.current.onError(msg);
      teardown();
      setS('off');
    }
  }, [onEvent, finish, teardown, stopWakeWatch]);

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

  return { state, heard, supported, start, stop, answer, answerPart, answerExact, read, stopReading, pointTo, pauseIn, keepAwake: bump, active: state !== 'off' };
}
