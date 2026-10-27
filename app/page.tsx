'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, Look, MODELS, Provider, SAVER_IDLE_SEC, Settings, STYLES, styleById, Tier, TIER_LABELS } from '@/lib/config';
import type { SessionRow, SourceData } from '@/lib/db';
import { Formatted } from '@/components/Message';
import SeferPanel from '@/components/SeferPanel';
import SettingsDrawer from '@/components/SettingsDrawer';
import { Disclaimer, Help } from '@/components/Modals';
import { stripNikud } from '@/lib/hebrew';
import { splitSentences, useVoice } from '@/components/useVoice';
import { useLive } from '@/components/useLive';

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; model?: string; usage?: Usage; refs?: { ref: string; heRef: string; url: string }[]; live?: boolean }
  | { kind: 'event'; text: string }
  | { kind: 'error'; text: string };

// What each reply cost and why the AI was (or wasn't) used.
type Usage = { ai: boolean; model?: string; reason: string; usd?: number; lookups?: number };
function cents(usd: number): string {
  const c = usd * 100;
  return c < 0.1 ? 'under 0.1¢' : c < 1 ? `${c.toFixed(2)}¢` : `${c.toFixed(1)}¢`;
}
function UsageLine({ u }: { u: Usage }) {
  return (
    <div className={`usage ${u.ai ? 'ai' : 'free'}`}>
      {u.ai
        ? <>AI · {u.model} · {cents(u.usd ?? 0)}{u.lookups ? ` · ${u.lookups} lookup${u.lookups > 1 ? 's' : ''}` : ''} · <span className="why">{u.reason}</span></>
        : <>No AI · free · <span className="why">{u.reason}</span></>}
    </div>
  );
}

const STARTERS = [
  { title: "Today's Daf Yomi", sub: 'Learn the daf together', he: 'דף', prompt: "Let's learn today's Daf Yomi." },
  { title: 'Suggest a sugya', sub: 'Your chavrusa picks one and tells you why', he: 'סוגיא', prompt: 'Pick a good sugya for us to learn today, and tell me in one line why.' },
  { title: 'This week’s parsha', sub: 'Start from a question on the parsha', he: 'פרשה', prompt: "Let's learn something on this week's parsha." },
  { title: 'I have a topic', sub: 'Type it below', he: 'נושא', prompt: '' },
];

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<SourceData[]>([]);
  const [selected, setSelected] = useState(0);
  const [seferOpen, setSeferOpen] = useState(false);
  const [pinCollapsed, setPinCollapsed] = useState(true);
  const [seenDisclaimer, setSeenDisclaimer] = useState(false);
  const [quick, setQuick] = useState<'style' | 'model' | null>(null);
  const [requests, setRequests] = useState<{ id: string; content: string }[]>([]); // learner's requests for this session
  const [convo, setConvo] = useState(false);
  const convoRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const spokeLast = useRef(false);
  const liveIdx = useRef<number | null>(null);   // the reply currently being written
  const liveText = useRef('');
  const speakTurn = useRef(false);               // speak this reply as it streams in
  const speechBuf = useRef('');
  const turnRefs = useRef<{ ref: string; heRef: string; url: string }[]>([]); // sources brought during this reply
  const voice = useVoice({
    onText: (t) => { spokeLast.current = true; send(t); },
    onError: (m) => { setItems((it) => [...it, { kind: 'error', text: m }]); setConvoMode(false); },
    sessionId: () => sessionIdRef.current,
  });

  // ---------- Live voice ----------
  const liveQueue = useRef<{ text: string; id: string }[]>([]);
  const liveDelegation = useRef<string | null>(null);
  const liveSpeech = useRef({ buf: '', out: '', sent: false }); // the answer, as it streams, for the Live voice
  const exactSent = useRef(0);      // phrases of a [[say]] block already handed to the voice
  const afterSay = useRef(false);   // the [[say]] block is done; the rest is handed over at the end
  const preStreamed = useRef(false); // something before the [[say]] block was already spoken
  // Read-through (say over the pesukim / shnayim mikra): where we are, while it's running.
  const readingRef = useRef<{ mode: string; base: string; next: number; id: number } | null>(null);
  const [readingOn, setReadingOn] = useState(false);
  // Open the Sefer straight into the Library (from the top bar or the start screen).
  const [libReq, setLibReq] = useState(0);
  const openLibrary = () => { setSeferOpen(true); setLibReq((n) => n + 1); };
  const live = useLive({
    onRequest: (text, id) => { liveQueue.current.push({ text, id }); pumpLive(); },
    onError: (m) => setItems((it) => [...it, { kind: 'error', text: m }]),
    onEnded: (seconds) => {
      liveQueue.current = [];
      liveDelegation.current = null;
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds, sessionId: sessionIdRef.current }) }).catch(() => {});
    },
    isBusy: () => busyRef.current || !!liveDelegation.current || liveQueue.current.length > 0 || !!readingRef.current,
    sessionId: () => sessionIdRef.current,
    exactReader: () => settingsRef.current.exactReader !== false,
    // The voice answered by itself: show the exchange and save it, so the brain knows what was said.
    onAside: (learner, said) => {
      setItems((it) => [...it, ...(learner ? [{ kind: 'user' as const, text: learner }] : []), { kind: 'assistant' as const, text: said, usage: { ai: false, reason: 'The voice answered by itself (part of the call)' } }]);
      fetch('/api/live/aside', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionIdRef.current, user: learner, voice: said }) })
        .then((r) => r.json()).then((d) => { if (d?.session?.id) { sessionIdRef.current = d.session.id; setSessionId(d.session.id); } }).catch(() => {});
    },
    // Saver pauses sooner: never later than 30 quiet seconds.
    idleSeconds: () => { const t = settingsRef.current.liveIdleSec ?? 60; return settingsRef.current.saver !== false && t > 0 ? Math.min(t, SAVER_IDLE_SEC) : t; },
    wakeOnSpeech: () => settingsRef.current.liveWake ?? true,
  });

  function pumpLive() {
    if (busyRef.current || liveDelegation.current || !liveQueue.current.length) return;
    const next = liveQueue.current.shift()!;
    liveDelegation.current = next.id;
    send(next.text, { live: true });
  }

  function toggleTalk() {
    if (settings.talkMode === 'live' && live.supported) {
      if (convo) setConvoMode(false);
      if (live.active) live.stop(); else { voice.shutdown(); live.start(); }
    } else {
      if (live.active) live.stop();
      setConvoMode(!convo);
    }
  }
  const talking = convo || live.active;
  // Blank screen during a voice conversation (purely verbal). "Show screen" peeks for the rest of this call.
  const [peek, setPeek] = useState(false);
  useEffect(() => { if (!talking) setPeek(false); }, [talking]);
  const blank = !!settings.blankCall && talking && !peek;

  function setConvoMode(on: boolean) {
    convoRef.current = on;
    setConvo(on);
    if (on) { voice.unlock(); voice.listen(); }
    else voice.stopAll();
  }

  async function sayAloud(text: string) {
    const ok = await voice.speak(text);
    if (ok && convoRef.current) voice.listen();
  }
  const [pulse, setPulse] = useState(false);
  const [drawer, setDrawer] = useState<'sessions' | 'settings' | null>(null);
  const [help, setHelp] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const [status, setStatus] = useState('');
  const [sessionUsd, setSessionUsd] = useState(0);
  const [isWide, setIsWide] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const warned = useRef(false);

  // ---------- Load ----------
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s && !s.error) setSettings(s);
      else setItems([{ kind: 'error', text: `Could not reach the database: ${s?.error ?? 'unknown error'}` }]);
      setLoaded(true);
    }).catch((e) => { setItems([{ kind: 'error', text: `Could not load settings: ${String(e)}` }]); setLoaded(true); });
    refreshSessions();
    try { if (localStorage.getItem('chavrusa_disclaimer') === '1') setSeenDisclaimer(true); } catch { /* storage unavailable */ }
    const mq = window.matchMedia('(min-width: 1000px)');
    const on = () => setIsWide(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Apply theme and text sizes.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.look = settings.theme;
    root.dataset.rashi = settings.rashiScript ? 'on' : 'off';
    root.style.setProperty('--he-size', `${settings.heSize}px`);
    root.style.setProperty('--en-size', `${settings.enSize}px`);
  }, [settings.theme, settings.heSize, settings.enSize, settings.rashiScript]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [items, status]);

  function refreshSessions() {
    fetch('/api/sessions').then((r) => r.json()).then((d) => Array.isArray(d) && setSessions(d));
  }

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  }, []);

  async function openSession(id: string) {
    setDrawer(null);
    const res = await fetch(`/api/sessions/${id}`);
    const d = await res.json();
    if (d.error) return;
    setSessionId(id);
    setItems(d.messages.map((m: { role: 'user' | 'assistant'; content: string; meta?: { usage?: Usage } | null }) => ({ kind: m.role, text: m.content, usage: m.meta?.usage })));
    setSources(d.sources);
    setSelected(Math.max(0, d.sources.length - 1));
    setSessionUsd(d.sessionUsd ?? 0);
    setRequests(Array.isArray(d.requests) ? d.requests : []);
    setSeferOpen(isWide && d.sources.length > 0);
    warned.current = false;
  }

  // Read straight through, piece by piece, until the learner talks or it reaches the end.
  // In a Live call the voice reads each piece aloud; when typing, one longer piece is shown at a time.
  async function readLoop() {
    const st = readingRef.current;
    if (!st) return;
    setReadingOn(true);
    try {
      while (readingRef.current === st) {
        const calling = live.active;
        const q = new URLSearchParams({ base: st.base, from: String(st.next), mode: st.mode, count: String(calling ? (st.mode === 'shnayim' ? 1 : 2) : 5) });
        if (sessionIdRef.current) q.set('session', sessionIdRef.current);
        const r = await fetch(`/api/readthrough?${q}`).then((x) => x.json()).catch(() => ({ error: 'Could not load the next pesukim.' }));
        if (readingRef.current !== st) break;
        if (r.error || r.done) {
          setItems((it) => [...it, { kind: 'event', text: r.error ?? 'That\u2019s the end of what we can read here.' }]);
          break;
        }
        st.base = r.base; st.next = r.next;
        setItems((it) => [...it, { kind: 'assistant', text: `**${r.ref}**\n\n${r.text}`, usage: { ai: false, reason: 'Read-through, straight from Sefaria' } }]);
        if (!calling) {
          setItems((it) => [...it, { kind: 'event', text: 'Say or type \u201ckeep reading\u201d for more.' }]);
          break;
        }
        // The voice gets the lashon kodesh in yeshivish transliteration with the stressed syllable in capitals.
        const spoken = (r.lines as { say: { he: string; en: string; tg: string; heTr?: string; tgTr?: string } }[]).map(({ say: l }) => {
          const he = l.heTr || l.he, tg = l.tgTr || l.tg;
          return st.mode === 'shnayim' ? `${he}\n${he}${tg ? `\n${tg}` : ''}` : st.mode === 'he' ? he : `${he}\n${l.en}`;
        }).join('\n\n');
        const finished = await live.read(spoken);
        if (!finished) break; // the learner started talking
      }
    } finally {
      if (readingRef.current === st) readingRef.current = null;
      setReadingOn(false);
    }
  }
  function stopReadThrough() { readingRef.current = null; live.stopReading(); setReadingOn(false); }

  // The learner tapped a line in the Sefer: learn from there. Saved to the session (so the Chavrusa and a new
  // call start there), and if a call is going, the voice is told right away.
  function pointAt(src: SourceData, n: number) {
    setSources((s) => s.map((x) => (x.ref === src.ref ? { ...x, focus: n } : x)));
    const sid = sessionIdRef.current;
    if (sid) fetch('/api/place', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, ref: src.ref, n, source: src }) }).catch(() => {});
    if (live.active) live.pointTo(src.ref, n, src.he[n - 1] ?? '', src.en[n - 1] ?? src.altEn?.[n - 1] ?? '');
    setItems((it) => [...it, { kind: 'event', text: `📍 Learning from ${src.ref}, line ${n}.` }]);
  }

  function newSession() {
    setDrawer(null); setSessionId(null); setItems([]); setSources([]); setSelected(0); setSessionUsd(0); setRequests([]);
    warned.current = false;
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Clear the whole list: one tap arms it, a second tap (within a few seconds) clears. No pop-up.
  const [clearArmed, setClearArmed] = useState(false);
  async function clearAllSessions() {
    if (!clearArmed) { setClearArmed(true); window.setTimeout(() => setClearArmed(false), 4000); return; }
    setClearArmed(false);
    await fetch('/api/sessions', { method: 'DELETE' });
    newSession();
    refreshSessions();
  }

  async function deleteSessionById(id: string) {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (id === sessionId) newSession();
    refreshSessions();
  }

  // ---------- Send ----------
  // Put a source on screen (Sefer panel and the bar at the top).
  function showSource(src: SourceData) {
    setSources((s) => {
      const existing = s.findIndex((x) => x.ref === src.ref);
      if (existing >= 0) {
        setSelected(existing);
        // Same perek/amud, new place in it: move the highlight.
        if (src.focus && src.focus !== s[existing].focus) { const copy = s.slice(); copy[existing] = { ...s[existing], focus: src.focus }; return copy; }
        return s;
      }
      setSelected(s.length);
      return [...s, src];
    });
    if (window.matchMedia('(min-width: 1000px)').matches) setSeferOpen(true);
    setPulse(true); setTimeout(() => setPulse(false), 2500);
  }

  // Fetch a source straight from Sefaria, without the AI. Returns an error message, or null when shown.
  async function openRef(q: string, direct: boolean): Promise<string | null> {
    try {
      const res = await fetch('/api/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, direct, sessionId: sessionIdRef.current }) });
      const d = await res.json();
      if (d.session?.id) { sessionIdRef.current = d.session.id; setSessionId(d.session.id); refreshSessions(); }
      if (d.source) { showSource(d.source); if (!direct) setPinCollapsed(false); return null; }
      return d.message ?? null;
    } catch (e) { return (e as Error).message; }
  }

  // Open an exact Sefaria reference (from the Library), with a reason and an approve option if it's not approved.
  async function openExact(ref: string): Promise<string | { message: string; approvable?: string } | null> {
    try {
      const res = await fetch('/api/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: ref, direct: true, exact: true, sessionId: sessionIdRef.current }) });
      const d = await res.json();
      if (d.session?.id) { sessionIdRef.current = d.session.id; setSessionId(d.session.id); refreshSessions(); }
      if (d.source) { showSource(d.source); return null; }
      return d.approvable ? { message: d.message ?? 'Not on the approved list.', approvable: d.approvable } : (d.message ?? `Couldn't open ${ref}.`);
    } catch (e) { return (e as Error).message; }
  }

  async function send(text: string, opts: { live?: boolean } = {}) {
    const msg = text.trim();
    if (!msg || busyRef.current) return;
    busyRef.current = true;
    setInput('');
    // A reply left unfinished by an earlier error is closed, so this turn's reply starts fresh.
    setItems((it) => [...it.map((x) => (x.kind === 'assistant' && x.live ? { ...x, live: false } : x)), { kind: 'user', text: msg }]);
    setBusy(true); setStatus('Thinking…');
    liveIdx.current = null;
    liveText.current = ''; liveSpeech.current = { buf: '', out: '', sent: false }; exactSent.current = 0; afterSay.current = false; preStreamed.current = false;
    speechBuf.current = '';
    turnRefs.current = [];
    speakTurn.current = !opts.live && (convoRef.current || settingsRef.current.autoSpeak || spokeLast.current);
    spokeLast.current = false;
    if (speakTurn.current) voice.beginSpeech();
    // Show any source the message names right away, without waiting for the AI.
    if (/\d|daf|parsh|parash|sedra/i.test(msg)) void openRef(msg, false);

    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, sessionId: sessionIdRef.current ?? sessionId, voice: convoRef.current || !!opts.live }) });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.body) throw new Error('No response from server.');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line));
        }
      }
    } catch (e) {
      setItems((it) => [...it, { kind: 'error', text: (e as Error).message }]);
    } finally {
      busyRef.current = false;
      if (liveDelegation.current) { live.answer(liveDelegation.current, 'Sorry, I lost my place for a moment. Could you say that again?'); liveDelegation.current = null; }
      setBusy(false); setStatus('');
      window.setTimeout(pumpLive, 0);
      refreshSessions();
    }
  }

  function handleEvent(e: any) {
    switch (e.type) {
      case 'session': setSessionId(e.session.id); break;
      case 'status': setStatus(e.text); break;
      case 'source':
        if (!turnRefs.current.some((r) => r.ref === e.source.ref)) turnRefs.current.push({ ref: e.source.ref, heRef: e.source.heRef, url: e.source.url });
        showSource(e.source);
        break;
      case 'memory': setItems((it) => [...it, { kind: 'event', text: `Remembered: ${e.text}` }]); break;
      case 'mode': setSettings((s) => ({ ...s, ...e.settings })); break;
      case 'requests': setRequests(e.items ?? []); break;
      case 'readthrough':
        // Start reading straight through once this reply is done (the app reads; no AI).
        readingRef.current = { mode: e.mode, base: e.base, next: e.from, id: Date.now() };
        window.setTimeout(() => { void readLoop(); }, 50);
        break;
      case 'delta': {
        liveText.current += e.text;
        // Live call: pass finished sentences to the voice as they arrive. The first sentence goes at once;
        // after that, a couple of sentences at a time so it flows naturally.
        // Text to be said word for word ([[say]] … [[/say]]): hand it over phrase by phrase as it is written.
        if (liveDelegation.current && /\[\[say\]\]/i.test(liveText.current)) {
          const full = liveText.current;
          const start = full.search(/\[\[say\]\]/i) + 7;
          const endAt = full.search(/\[\[\/say\]\]/i);
          const body = full.slice(start, endAt >= 0 ? endAt : undefined);
          const pieces = body.split('|');
          const done = endAt >= 0 ? pieces : pieces.slice(0, -1);            // the last piece may still be growing
          const ready = done.slice(exactSent.current).map((x) => x.trim()).filter(Boolean);
          // The first phrase goes at once; after that, two at a time so it flows.
          if (ready.length && (exactSent.current === 0 || ready.length >= 2 || endAt >= 0)) {
            live.answerExactPart(liveDelegation.current, ready.join(' | '));
            exactSent.current += ready.length;
            liveSpeech.current.sent = true;
          }
          if (endAt >= 0) { liveSpeech.current.buf = full.slice(endAt + 8); liveSpeech.current.out = ''; afterSay.current = true; }
        } else if (liveDelegation.current && !afterSay.current) {
          liveSpeech.current.buf += e.text;
          const { sentences, rest } = splitSentences(liveSpeech.current.buf);
          liveSpeech.current.buf = rest;
          liveSpeech.current.out += sentences.join(' ') + (sentences.length ? ' ' : '');
          const out = liveSpeech.current.out.trim();
          if (out && (!liveSpeech.current.sent || out.length >= 180)) {
            live.answerPart(liveDelegation.current, out);
            preStreamed.current = true;
            liveSpeech.current = { buf: liveSpeech.current.buf, out: '', sent: true };
          }
        }
        const full = liveText.current;
        setItems((it) => {
          // The reply being written is marked "live", so it is updated in place (never added twice).
          const i = it.findIndex((x) => x.kind === 'assistant' && x.live);
          if (i < 0) return [...it, { kind: 'assistant', text: full, live: true }];
          const copy = it.slice();
          copy[i] = { kind: 'assistant', text: full, live: true };
          return copy;
        });
        if (speakTurn.current) {
          speechBuf.current += e.text;
          const { sentences, rest } = splitSentences(speechBuf.current);
          sentences.forEach((x) => voice.enqueue(x));
          speechBuf.current = rest;
        }
        setStatus('');
        break;
      }
      case 'reply': {
        const finalText: string = e.text;
        const refs = turnRefs.current.slice();
        const streamed = liveText.current.length > 0;
        setItems((it) => {
          const i = it.findIndex((x) => x.kind === 'assistant' && x.live);
          const done = { kind: 'assistant' as const, text: finalText, model: e.model, usage: e.usage, refs };
          if (i < 0) return [...it, done];
          const copy = it.slice();
          copy[i] = done;
          return copy;
        });
        liveIdx.current = null;
        if (liveDelegation.current) {
          // Whatever wasn't handed over yet: all of it if nothing streamed (e.g. a free reply), else the remainder.
          const rest = liveSpeech.current.sent ? `${liveSpeech.current.out} ${liveSpeech.current.buf}`.trim() : finalText;
          // Text the voice must say word for word (the lashon kodesh with its English) comes in [[say]] … [[/say]].
          const sayBody = finalText.match(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/i)?.[1] ?? '';
          // What's outside the block: the part before it may already have been spoken while streaming.
          const before = finalText.split(/\[\[say\]\]/i)[0];
          const after = finalText.split(/\[\[\/say\]\]/i).slice(1).join(' ');
          const outside = `${preStreamed.current ? '' : before} ${after}`.replace(/\[\[\/?say\]\]/gi, '').replace(/\s+/g, ' ').trim();
          if (sayBody) {
            // Any phrases not yet handed over are read exactly; then the explanation, in the voice's own words.
            const left = sayBody.split('|').slice(exactSent.current).map((x) => x.trim()).filter(Boolean).join(' | ');
            if (left) live.answerExactPart(liveDelegation.current, left);
            live.answer(liveDelegation.current, outside);
          } else live.answer(liveDelegation.current, rest.replace(/\[\[\/?say\]\]/gi, ''));
          liveDelegation.current = null;
        }
        liveSpeech.current = { buf: '', out: '', sent: false };
        if (speakTurn.current) {
          const leftover = streamed ? speechBuf.current : finalText;
          splitSentences(leftover, true).sentences.forEach((x) => voice.enqueue(x));
          speechBuf.current = '';
          speakTurn.current = false;
          voice.endSpeech().then((ok) => { if (ok && convoRef.current) voice.listen(); });
        }
        break;
      }
      case 'cost':
        setSessionUsd(e.sessionUsd);
        if (settings.costWarnUsd && e.sessionUsd > settings.costWarnUsd && !warned.current) {
          warned.current = true;
          setItems((it) => [...it, { kind: 'event', text: `This session has passed $${settings.costWarnUsd}.` }]);
        }
        break;
      case 'error':
        if (speakTurn.current) { speakTurn.current = false; voice.stopSpeaking(); }
        setItems((it) => [...it, { kind: 'error', text: e.text }]);
        if (convoRef.current) setConvoMode(false);
        break;
    }
  }

  const style = styleById(settings.style);
  const blend = settings.blend ? styleById(settings.blend) : null;
  const model = MODELS[settings.provider][settings.tier];
  const replies = items.filter((x): x is Extract<Item, { kind: 'assistant' }> => x.kind === 'assistant' && !!x.usage);
  const allTurns = replies.length;
  const aiTurns = replies.filter((x) => x.usage?.ai).length;
  const showSefer = settings.display !== 'off' && seferOpen;
  const current = sources[selected];
  const look: Look = settings.theme;
  const showPin = settings.pinBar !== false && settings.display !== 'off' && !!current && !(isWide && showSefer);
  const isCommentary = (ref: string) => /^(Rashi|Tosafot|Tosafos|Rashbam|Ran|Rosh) on /i.test(ref);

  return (
    <div className="app">
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setDrawer('sessions')} aria-label="Sessions">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="brand">חברותא</div>
          <div className="spacer" />
          {settings.display !== 'off' && (
            <button className="icon-btn" onClick={openLibrary} aria-label="Library" title="Library">
              <span aria-hidden="true" style={{ fontSize: 18 }}>📚</span>
              <span className="hide-mobile">Library</span>
            </button>
          )}
          {settings.display !== 'off' && (
            <button className={`icon-btn ${showSefer ? 'active' : ''} ${pulse ? 'pulse' : ''}`} onClick={() => { setSeferOpen((v) => !v); setLibReq(0); }} aria-label="Sefer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M2 5c3-1.5 6-1.5 10 1 4-2.5 7-2.5 10-1v14c-3-1.5-6-1.5-10 1-4-2.5-7-2.5-10-1z" /><path d="M12 6v14" /></svg>
              <span className="hide-mobile">Sefer</span>
              {sources.length > 0 && <span className="badge">{sources.length}</span>}
            </button>
          )}
          <button className="icon-btn" onClick={() => setDrawer('settings')} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
          <div className="hero-ref" aria-hidden={!current}>
            <div className="big">{current ? current.heRef : 'חברותא'}</div>
            <div className="sub">{current ? current.ref : 'Your learning partner'}</div>
          </div>
        </header>

        <div className="modebar">
          {/* Talk comes first, so it's always in view without scrolling. */}
          {voice.supported && (
            <button className={`chip talk ${talking ? 'live' : ''}`} onClick={toggleTalk} aria-pressed={talking}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              {talking ? 'End talk' : 'Talk'}
            </button>
          )}
          <button className={`chip accent ${quick === 'style' ? 'open' : ''}`} aria-expanded={quick === 'style'} onClick={() => setQuick((q) => (q === 'style' ? null : 'style'))}>
            {style.short}{blend ? ` + ${blend.short}` : ''} · {settings.leads === 'learner' ? 'You lead' : 'Chavrusa leads'}
          </button>
          <button className={`chip ${quick === 'model' ? 'open' : ''}`} aria-expanded={quick === 'model'} onClick={() => setQuick((q) => (q === 'model' ? null : 'model'))}>{TIER_LABELS[settings.tier]} · {model.label}</button>
          <button className="chip" onClick={() => updateSettings({ nusach: settings.nusach === 'ashkenaz' ? 'sephardi' : 'ashkenaz' })}>
            {settings.nusach === 'ashkenaz' ? 'Ashkenaz' : 'Sephardi'}
          </button>
          <span className="spacer" />
          <span className="cost" title={`Cost of this session so far. The AI answered ${aiTurns} of ${allTurns} replies; the rest were free.`}>${sessionUsd.toFixed(sessionUsd < 1 ? 3 : 2)}{allTurns > 0 && <span className="cost-ai"> · AI {aiTurns}/{allTurns}</span>}</span>
        </div>

        {requests.length > 0 && (
          <div className="reqbar" aria-label="Your requests for this session">
            <span className="req-label">This session:</span>
            {requests.map((r) => (
              <span key={r.id} className="req" title={r.content}>
                <span className="req-text">{r.content}</span>
                <button aria-label={`Cancel: ${r.content}`} onClick={async () => {
                  setRequests((list) => list.filter((x) => x.id !== r.id));
                  await fetch(`/api/memory?id=${r.id}`, { method: 'DELETE' });
                }}>×</button>
              </span>
            ))}
          </div>
        )}

        {quick === 'model' && (
          <div className="quick" role="dialog" aria-label="Choose model">
            <div className="quick-row">
              {(['anthropic', 'openai'] as Provider[]).map((p) => (
                <button key={p} className={`quick-opt ${settings.provider === p ? 'on' : ''}`} onClick={() => updateSettings({ provider: p })}>{p === 'anthropic' ? 'Claude' : 'OpenAI'}</button>
              ))}
            </div>
            <div className="quick-list">
              {(['basic', 'middle', 'top'] as Tier[]).map((t) => (
                <button key={t} className={`quick-item ${settings.tier === t ? 'on' : ''}`} onClick={() => { updateSettings({ tier: t }); setQuick(null); }}>
                  <b>{TIER_LABELS[t]}</b>
                  <span>{MODELS[settings.provider][t].label} · {t === 'basic' ? 'quick review, lowest cost' : t === 'middle' ? 'everyday learning' : 'iyun and long reasoning, highest cost'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {quick === 'style' && (
          <div className="quick" role="dialog" aria-label="Choose style">
            <div className="quick-row">
              <button className={`quick-opt ${settings.leads === 'learner' ? 'on' : ''}`} onClick={() => updateSettings({ leads: 'learner' })}>I explain first</button>
              <button className={`quick-opt ${settings.leads === 'chavrusa' ? 'on' : ''}`} onClick={() => updateSettings({ leads: 'chavrusa' })}>Chavrusa explains first</button>
            </div>
            <div className="quick-list">
              {STYLES.map((st) => (
                <button key={st.id} className={`quick-item ${settings.style === st.id ? 'on' : ''}`} onClick={() => { updateSettings({ style: st.id, blend: null }); setQuick(null); }}>
                  <b>{st.name}</b><span>{st.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showPin && !blank && (
          <section className={`pin ${pinCollapsed ? 'collapsed' : ''}`} aria-label="Current source">
            <div className="pin-inner">
              <div className="pin-head">
                <span className="ref">{current.heRef}</span>
                <span className="en-ref">{current.ref}</span>
                <button onClick={() => setPinCollapsed((v) => !v)}>{pinCollapsed ? 'Show text' : 'Hide'}</button>
                <button onClick={() => setSeferOpen(true)}>Open</button>
                <button className="pin-close" aria-label="Remove this box (you can bring it back in Settings, Display)" title="Remove this box" onClick={() => { updateSettings({ pinBar: false }); setItems((it) => [...it, { kind: 'event', text: 'The text box is hidden. To bring it back: Settings → Display → Text box at the top. The full text is always in the Sefer (📖).' }]); }}>✕</button>
              </div>
              <div className="pin-text">
                <div className={`he ${isCommentary(current.ref) ? 'rashi' : ''}`}>
                  {current.he.map((line, i) => {
                    const t = settings.nikud ? line : stripNikud(line);
                    if (i === 0 && look === 'daf') {
                      const sp = t.indexOf(' ');
                      return <span key={i}><span className="first">{sp > 0 ? t.slice(0, sp) : t}</span>{sp > 0 ? t.slice(sp) : ''} </span>;
                    }
                    return <span key={i}>{t} </span>;
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {blank && (
          <div className="blank-call" aria-label="Voice only">
            <div className="blank-note">Voice only. The screen stays blank.</div>
            <button className="blank-peek" onClick={() => setPeek(true)}>Show screen</button>
          </div>
        )}
        <div className="thread" ref={threadRef} style={blank ? { display: 'none' } : undefined}>
          <div className="thread-inner">
            {items.length === 0 && (
              <div className="welcome">
                <div className="shalom">שלום</div>
                <p>What would you like to learn? Pick a starting point or just type. You can change how your chavrusa learns with you at any time, just by asking.</p>
                <div className="starters">
                  {settings.display !== 'off' && (
                    <button className="starter" onClick={openLibrary}>
                      <b>Browse the library</b><span>Pick any sefer, perek or daf from Sefaria</span><i>ספרייה</i>
                    </button>
                  )}
                  {STARTERS.map((s) => (
                    <button key={s.title} className="starter" onClick={() => (s.prompt ? send(s.prompt) : inputRef.current?.focus())}>
                      <b>{s.title}</b><span>{s.sub}</span><i>{s.he}</i>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 14 }}><a href="/guide">How we learn</a> · <a href="#" onClick={(e) => { e.preventDefault(); setHelp(true); }}>What can I ask for?</a></p>
              </div>
            )}
            {items.map((it, i) => {
              if (it.kind === 'user' || it.kind === 'assistant') {
                const me = it.kind === 'user';
                return (
                  <div key={i} className={`turn ${me ? 'me' : 'them'}`}>
                    <span className="bar" aria-hidden="true" />
                    <span className="letter" aria-hidden="true">{me ? 'א' : 'ח'}</span>
                    <div>
                      <div className="name">{me ? 'You' : 'Chavrusa'}</div>
                      <div className="say"><Formatted text={it.text} /></div>
                      {!me && it.kind === 'assistant' && !!it.refs?.length && settings.display !== 'off' && (
                        <div className="refs">
                          {it.refs.map((r) => (
                            <span key={r.ref} className="ref-chip">
                              <button onClick={() => { const idx = sources.findIndex((x) => x.ref === r.ref); if (idx >= 0) setSelected(idx); setSeferOpen(true); }}>
                                <span className="he-mini" dir="rtl">{r.heRef}</span> · Read inside
                              </button>
                              <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.ref} on Sefaria`}>Sefaria ↗</a>
                            </span>
                          ))}
                        </div>
                      )}
                      {!me && it.kind === 'assistant' && it.usage && <UsageLine u={it.usage} />}
                      {!me && voice.supported && !live.active && (
                        <button className="listen" onClick={() => { voice.unlock(); sayAloud(it.text); }} aria-label="Listen to this reply">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                          Listen
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              if (it.kind === 'event') return <div key={i} className="event">{it.text}</div>;
              return <div key={i} className="error">{it.text}</div>;
            })}
            {busy && <div className="status"><span className="dots"><span /><span /><span /></span>{status}</div>}
          </div>
        </div>

        {live.active && (
          <div className="voicebar" role="status">
            <span className={`orb ${live.state === 'listening' ? 'listening' : live.state === 'speaking' ? 'speaking' : 'idle'}`} aria-hidden="true" />
            <span className="vtext" dir="auto">
              {live.state === 'paused' ? (settings.liveWake ? 'Paused to save cost. Just start talking, or tap Resume.' : 'Paused to save cost. Tap Resume to continue.')
                : live.pauseIn ? `Pausing in ${live.pauseIn}s… say something to keep going`
                : live.state === 'connecting' ? 'Connecting…'
                : live.heard && !blank ? `“${live.heard.slice(-120)}”`
                : live.state === 'thinking' ? (status || 'Looking into it…')
                : readingOn ? 'Reading… just talk to stop'
                : live.state === 'speaking' ? 'Speaking… just talk to interrupt'
                : 'Listening… just talk'}
            </span>
            {live.state === 'paused' && <button className="btn primary" onClick={() => live.start()}>Resume</button>}
            {live.pauseIn && live.state !== 'paused' && <button className="btn" onClick={() => live.keepAwake()}>Stay</button>}
            {readingOn && <button className="btn" onClick={stopReadThrough}>Stop reading</button>}
            <button className="btn" onClick={() => live.stop()}>End</button>
          </div>
        )}

        {convo && (
          <div className="voicebar" role="status">
            <span className={`orb ${voice.state}`} style={{ ['--lvl' as string]: String(voice.level) }} aria-hidden="true" />
            <span className="vtext">
              {voice.state === 'listening' ? 'Listening… pause or tap Done when you finish'
                : voice.state === 'transcribing' ? 'Got it…'
                : voice.state === 'speaking' ? 'Speaking… tap to interrupt'
                : busy ? (status || 'Thinking…') : 'Ready'}
            </span>
            {voice.state === 'listening' && <button className="btn primary" onClick={() => voice.stopListening()}>Done</button>}
            {voice.state === 'speaking' && <button className="btn" onClick={() => { voice.stopSpeaking(); voice.listen(); }}>Interrupt</button>}
            {voice.state === 'idle' && !busy && <button className="btn" onClick={() => voice.listen()}>Speak</button>}
            <button className="btn" onClick={() => setConvoMode(false)}>End</button>
          </div>
        )}

        <div className="composer" style={blank ? { display: 'none' } : undefined}>
          <div className="composer-inner">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={voice.state === 'listening' ? 'Listening…' : voice.state === 'transcribing' ? 'Writing down what you said…' : 'Your answer or question…'}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && isWide) { e.preventDefault(); spokeLast.current = false; if (!live.active) voice.unlock(); send(input); } }}
              dir="auto"
            />
            {voice.supported && !convo && (
              <button
                className={`mic ${voice.state}`}
                onClick={() => { voice.unlock(); if (voice.state === 'listening') voice.stopListening(); else if (voice.state === 'idle') voice.listen(); }}
                disabled={voice.state === 'transcribing' || busy}
                aria-label={voice.state === 'listening' ? 'Stop recording' : 'Speak'}
                style={{ ['--lvl' as string]: String(voice.level) }}
              >
                {voice.state === 'listening'
                  ? <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
              </button>
            )}
            <button className="send" disabled={!input.trim() || busy} onClick={() => { spokeLast.current = false; if (!live.active) voice.unlock(); send(input); }} aria-label="Send">
              {look === 'daf' ? 'שלח' : look === 'techelet' ? 'Send' : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {showSefer && (
        <SeferPanel
          sources={sources} selected={selected} onSelect={setSelected}
          onClose={() => { setSeferOpen(false); setLibReq(0); }}
          settings={settings} onSettings={updateSettings} sessionId={sessionId}
          libraryRequest={libReq}
          onPoint={pointAt}
          talk={voice.supported ? { on: talking, toggle: toggleTalk, status: live.active ? (live.state === 'paused' ? 'Paused' : live.state === 'speaking' ? 'Speaking…' : live.state === 'thinking' ? 'Thinking…' : live.state === 'connecting' ? 'Connecting…' : 'Listening…') : '' } : undefined}
          onOpenRef={(q) => openRef(q, true)}
          onOpenExact={openExact}
        />
      )}

      {drawer === 'sessions' && (
        <>
          <div className="scrim" onClick={() => setDrawer(null)} />
          <div className="drawer left" role="dialog" aria-label="Sessions">
            <div className="drawer-head"><h2>Sessions</h2><button className="icon-btn" onClick={() => setDrawer(null)} aria-label="Close">✕</button></div>
            <div className="drawer-body">
              <button className="btn primary" style={{ width: '100%', margin: '8px 0 12px' }} onClick={newSession}>+ New session</button>
              {sessions.length === 0 && <div className="muted" style={{ fontSize: 14 }}>No sessions yet.</div>}
              {sessions.length > 0 && (
                <button className={`clear-all ${clearArmed ? 'armed' : ''}`} onClick={clearAllSessions}>
                  {clearArmed ? `Tap again to clear all ${sessions.length}` : 'Clear all'}
                </button>
              )}
              {sessions.map((s) => (
                <div key={s.id} className={`session-row ${s.id === sessionId ? 'on' : ''}`}>
                  <button className="session-item" onClick={() => openSession(s.id)}>
                    <span className="t" dir="auto">{s.title}</span>
                    <span className="d">{new Date(s.updated_at).toLocaleDateString()}</span>
                  </button>
                  <button className="icon-btn" style={{ color: 'var(--soft)', fontSize: 18 }} onClick={() => deleteSessionById(s.id)} aria-label="Delete session">×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {drawer === 'settings' && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setDrawer(null)} onHelp={() => setHelp(true)} liveActive={live.active} />}
      {help && <Help onClose={() => setHelp(false)} />}
      {loaded && !settings.disclaimerAccepted && !seenDisclaimer && (
        <Disclaimer
          look={settings.theme}
          onLook={(l) => updateSettings({ theme: l })}
          onAccept={() => {
            setSeenDisclaimer(true);
            try { localStorage.setItem('chavrusa_disclaimer', '1'); } catch { /* storage unavailable */ }
            updateSettings({ disclaimerAccepted: true });
          }}
        />
      )}
    </div>
  );
}
