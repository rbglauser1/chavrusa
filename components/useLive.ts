'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Live voice: a GPT-Live session over WebRTC. The voice model listens and speaks naturally; whenever the
// learner says something about the learning, it "delegates" to us. We send the learner's words to the
// Chavrusa brain (/api/chat) and hand the answer back for the voice to say.

export type LiveState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking';

const MAX_CHARS = 1800; // the voice accepts about 500 tokens per hand-back

function forSpeech(text: string): string {
  const t = text.replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[(\d+)\]/g, '').replace(/\n{2,}/g, '\n').trim();
  if (t.length <= MAX_CHARS) return t;
  const cut = t.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  return end > 400 ? cut.slice(0, end + 1) : cut;
}

export function useLive(opts: {
  onRequest: (text: string, delegationId: string) => void; // learner said something: ask the brain
  onError: (msg: string) => void;
  onEnded: (seconds: number) => void;
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
  const lastInputAt = useRef(0);
  const seconds = useRef(0);
  const startedAt = useRef(0);
  const speakTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Set<string>>(new Set());
  const stateRef = useRef<LiveState>('off');
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

  const finish = useCallback(() => {
    if (stateRef.current === 'off') return;
    const secs = Math.max(seconds.current, startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0);
    teardown();
    setS('off');
    seconds.current = 0; startedAt.current = 0;
    optsRef.current.onEnded(secs);
  }, [teardown]);

  const stop = useCallback(() => {
    send({ type: 'session.close' });
    // Give the close a moment to go out, then hang up.
    window.setTimeout(finish, 300);
  }, [send, finish]);

  useEffect(() => () => { teardown(); }, [teardown]);

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
          setHeard(userBuf.current);
          if (stateRef.current === 'speaking') setS('listening');
        }
        break;
      case 'session.output_transcript.delta':
        setS('speaking');
        if (speakTimer.current) clearTimeout(speakTimer.current);
        speakTimer.current = window.setTimeout(() => {
          if (stateRef.current === 'speaking') setS(pending.current.size ? 'thinking' : 'listening');
        }, 900);
        break;
      case 'session.delegation.created':
        if (e.delegation?.id) handleDelegation(e.delegation.id);
        break;
      case 'session.usage.updated':
        if (typeof e.usage?.seconds === 'number') seconds.current = e.usage.seconds;
        break;
      case 'session.closed':
        if (typeof e.usage?.seconds === 'number') seconds.current = e.usage.seconds;
        if (e.reason === 'expired') optsRef.current.onError('The live session reached its time limit. Tap Talk to continue.');
        finish();
        break;
      case 'error':
        optsRef.current.onError(`Live voice: ${e.error?.message ?? 'something went wrong'}`);
        break;
    }
  }, [finish, handleDelegation]);

  // The brain's answer for a delegation: give it to the voice to say.
  const answer = useCallback((delegationId: string, text: string) => {
    if (!pending.current.has(delegationId)) return;
    pending.current.delete(delegationId);
    send({ type: 'session.commentary.append', delegation_id: delegationId, content: forSpeech(text) || 'Let’s keep going.' });
  }, [send]);

  const start = useCallback(async () => {
    if (stateRef.current !== 'off') return;
    setS('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mic.current = stream;
      const peer = new RTCPeerConnection();
      pc.current = peer;
      if (!audio.current) { audio.current = new Audio(); audio.current.autoplay = true; }
      peer.ontrack = (ev) => { if (audio.current) { audio.current.srcObject = ev.streams[0]; audio.current.play().catch(() => {}); } };
      stream.getAudioTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore */ } };
      channel.onopen = () => { startedAt.current = Date.now(); setS('listening'); };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          if (stateRef.current !== 'off') { optsRef.current.onError('The live connection dropped. Tap Talk to reconnect.'); finish(); }
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const res = await fetch('/api/live/session', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
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
  }, [onEvent, finish, teardown]);

  const supported = typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  return { state, heard, supported, start, stop, answer, active: state !== 'off' };
}
