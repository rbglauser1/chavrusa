'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, Look, MODELS, Provider, Settings, STYLES, styleById, Tier, TIER_LABELS } from '@/lib/config';
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
  | { kind: 'assistant'; text: string; model?: string; refs?: { ref: string; heRef: string; url: string }[] }
  | { kind: 'event'; text: string }
  | { kind: 'error'; text: string };

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
  const live = useLive({
    onRequest: (text, id) => { liveQueue.current.push({ text, id }); pumpLive(); },
    onError: (m) => setItems((it) => [...it, { kind: 'error', text: m }]),
    onEnded: (seconds) => {
      liveQueue.current = [];
      liveDelegation.current = null;
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds, sessionId: sessionIdRef.current }) }).catch(() => {});
    },
    isBusy: () => busyRef.current || !!liveDelegation.current || liveQueue.current.length > 0,
    idleSeconds: () => settingsRef.current.liveIdleSec ?? 60,
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
      if (live.active) live.stop(); else live.start();
    } else {
      if (live.active) live.stop();
      setConvoMode(!convo);
    }
  }
  const talking = convo || live.active;

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
    root.style.setProperty('--he-size', `${settings.heSize}px`);
    root.style.setProperty('--en-size', `${settings.enSize}px`);
  }, [settings.theme, settings.heSize, settings.enSize]);

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
    setItems(d.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({ kind: m.role, text: m.content })));
    setSources(d.sources);
    setSelected(Math.max(0, d.sources.length - 1));
    setSessionUsd(d.sessionUsd ?? 0);
    setSeferOpen(isWide && d.sources.length > 0);
    warned.current = false;
  }

  function newSession() {
    setDrawer(null); setSessionId(null); setItems([]); setSources([]); setSelected(0); setSessionUsd(0);
    warned.current = false;
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function deleteSessionById(id: string) {
    if (!confirm('Delete this session?')) return;
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (id === sessionId) newSession();
    refreshSessions();
  }

  // ---------- Send ----------
  // Put a source on screen (Sefer panel and the bar at the top).
  function showSource(src: SourceData) {
    setSources((s) => {
      const existing = s.findIndex((x) => x.ref === src.ref);
      if (existing >= 0) { setSelected(existing); return s; }
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
      if (d.source) { showSource(d.source); if (!direct) setPinCollapsed(false); return null; }
      return d.message ?? null;
    } catch (e) { return (e as Error).message; }
  }

  async function send(text: string, opts: { live?: boolean } = {}) {
    const msg = text.trim();
    if (!msg || busyRef.current) return;
    busyRef.current = true;
    setInput('');
    setItems((it) => [...it, { kind: 'user', text: msg }]);
    setBusy(true); setStatus('Thinking…');
    liveIdx.current = null;
    liveText.current = '';
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
      case 'delta': {
        liveText.current += e.text;
        const full = liveText.current;
        setItems((it) => {
          if (liveIdx.current === null || liveIdx.current >= it.length) { liveIdx.current = it.length; return [...it, { kind: 'assistant', text: full }]; }
          const copy = it.slice();
          copy[liveIdx.current] = { kind: 'assistant', text: full };
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
          if (liveIdx.current === null || liveIdx.current >= it.length) return [...it, { kind: 'assistant', text: finalText, model: e.model, refs }];
          const copy = it.slice();
          copy[liveIdx.current] = { kind: 'assistant', text: finalText, model: e.model, refs };
          return copy;
        });
        liveIdx.current = null;
        if (liveDelegation.current) { live.answer(liveDelegation.current, finalText); liveDelegation.current = null; }
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
  const showSefer = settings.display !== 'off' && seferOpen;
  const current = sources[selected];
  const look: Look = settings.theme;
  const showPin = settings.display !== 'off' && !!current && !(isWide && showSefer);
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
            <button className={`icon-btn ${showSefer ? 'active' : ''} ${pulse ? 'pulse' : ''}`} onClick={() => setSeferOpen((v) => !v)} aria-label="Sefer">
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
          <button className={`chip accent ${quick === 'style' ? 'open' : ''}`} aria-expanded={quick === 'style'} onClick={() => setQuick((q) => (q === 'style' ? null : 'style'))}>
            {style.short}{blend ? ` + ${blend.short}` : ''} · {settings.leads === 'learner' ? 'You lead' : 'Chavrusa leads'}
          </button>
          <button className={`chip ${quick === 'model' ? 'open' : ''}`} aria-expanded={quick === 'model'} onClick={() => setQuick((q) => (q === 'model' ? null : 'model'))}>{TIER_LABELS[settings.tier]} · {model.label}</button>
          <button className="chip" onClick={() => updateSettings({ nusach: settings.nusach === 'ashkenaz' ? 'sephardi' : 'ashkenaz' })}>
            {settings.nusach === 'ashkenaz' ? 'Ashkenaz' : 'Sephardi'}
          </button>
          {voice.supported && (
            <button className={`chip talk ${talking ? 'live' : ''}`} onClick={toggleTalk} aria-pressed={talking}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              {talking ? 'End talk' : 'Talk'}
            </button>
          )}
          <span className="spacer" />
          <span className="cost" title="Cost of this session so far">${sessionUsd.toFixed(sessionUsd < 1 ? 3 : 2)}</span>
        </div>

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

        {showPin && (
          <section className={`pin ${pinCollapsed ? 'collapsed' : ''}`} aria-label="Current source">
            <div className="pin-inner">
              <div className="pin-head">
                <span className="ref">{current.heRef}</span>
                <span className="en-ref">{current.ref}</span>
                <button onClick={() => setPinCollapsed((v) => !v)}>{pinCollapsed ? 'Show text' : 'Hide'}</button>
                <button onClick={() => setSeferOpen(true)}>Open</button>
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

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {items.length === 0 && (
              <div className="welcome">
                <div className="shalom">שלום</div>
                <p>What would you like to learn? Pick a starting point or just type. You can change how your chavrusa learns with you at any time, just by asking.</p>
                <div className="starters">
                  {STARTERS.map((s) => (
                    <button key={s.title} className="starter" onClick={() => (s.prompt ? send(s.prompt) : inputRef.current?.focus())}>
                      <b>{s.title}</b><span>{s.sub}</span><i>{s.he}</i>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 14 }}><a href="#" onClick={(e) => { e.preventDefault(); setHelp(true); }}>What can I ask for?</a></p>
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
                      {!me && voice.supported && (
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
                : live.heard ? `“${live.heard.slice(-120)}”`
                : live.state === 'thinking' ? (status || 'Looking into it…')
                : live.state === 'speaking' ? 'Speaking… just talk to interrupt'
                : 'Listening… just talk'}
            </span>
            {live.state === 'paused' && <button className="btn primary" onClick={() => live.start()}>Resume</button>}
            {live.pauseIn && live.state !== 'paused' && <button className="btn" onClick={() => live.keepAwake()}>Stay</button>}
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

        <div className="composer">
          <div className="composer-inner">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={voice.state === 'listening' ? 'Listening…' : voice.state === 'transcribing' ? 'Writing down what you said…' : 'Your answer or question…'}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && isWide) { e.preventDefault(); spokeLast.current = false; voice.unlock(); send(input); } }}
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
            <button className="send" disabled={!input.trim() || busy} onClick={() => { spokeLast.current = false; voice.unlock(); send(input); }} aria-label="Send">
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
          onClose={() => setSeferOpen(false)}
          settings={settings} onSettings={updateSettings} sessionId={sessionId}
          onOpenRef={(q) => openRef(q, true)}
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

      {drawer === 'settings' && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setDrawer(null)} onHelp={() => setHelp(true)} />}
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
