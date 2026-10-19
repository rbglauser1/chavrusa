'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, MODELS, Settings, styleById, TIER_LABELS } from '@/lib/config';
import type { SessionRow, SourceData } from '@/lib/db';
import { Formatted } from '@/components/Message';
import SeferPanel from '@/components/SeferPanel';
import SettingsDrawer from '@/components/SettingsDrawer';
import { Disclaimer, Help } from '@/components/Modals';

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; model?: string }
  | { kind: 'event'; text: string }
  | { kind: 'error'; text: string };

const STARTERS = [
  { title: "Today's Daf Yomi", sub: 'Learn the daf together', prompt: "Let's learn today's Daf Yomi." },
  { title: 'Suggest a topic', sub: 'Your chavrusa picks a sugya', prompt: 'Pick a good sugya for us to learn today, and tell me in one line why.' },
  { title: 'This week’s parsha', sub: 'A question on the parsha', prompt: "Let's learn something on this week's parsha." },
  { title: 'I have a topic', sub: 'Type it below', prompt: '' },
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
  const [pulse, setPulse] = useState(false);
  const [drawer, setDrawer] = useState<'sessions' | 'settings' | null>(null);
  const [help, setHelp] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [sessionUsd, setSessionUsd] = useState(0);
  const [isWide, setIsWide] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const warned = useRef(false);

  // ---------- Load ----------
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => { if (!s.error) setSettings(s); setLoaded(true); });
    refreshSessions();
    const mq = window.matchMedia('(min-width: 1000px)');
    const on = () => setIsWide(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Apply theme and text sizes.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
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
  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput('');
    setItems((it) => [...it, { kind: 'user', text: msg }]);
    setBusy(true); setStatus('Thinking…');

    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, sessionId }) });
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
      setBusy(false); setStatus('');
      refreshSessions();
    }
  }

  function handleEvent(e: any) {
    switch (e.type) {
      case 'session': setSessionId(e.session.id); break;
      case 'status': setStatus(e.text); break;
      case 'source':
        setSources((s) => {
          const existing = s.findIndex((x) => x.ref === e.source.ref);
          if (existing >= 0) { setSelected(existing); return s; }
          setSelected(s.length);
          return [...s, e.source];
        });
        if (window.matchMedia('(min-width: 1000px)').matches) setSeferOpen(true);
        setPulse(true); setTimeout(() => setPulse(false), 2500);
        break;
      case 'memory': setItems((it) => [...it, { kind: 'event', text: `Remembered: ${e.text}` }]); break;
      case 'mode': setSettings((s) => ({ ...s, ...e.settings })); break;
      case 'reply': setItems((it) => [...it, { kind: 'assistant', text: e.text, model: e.model }]); break;
      case 'cost':
        setSessionUsd(e.sessionUsd);
        if (settings.costWarnUsd && e.sessionUsd > settings.costWarnUsd && !warned.current) {
          warned.current = true;
          setItems((it) => [...it, { kind: 'event', text: `This session has passed $${settings.costWarnUsd}.` }]);
        }
        break;
      case 'error': setItems((it) => [...it, { kind: 'error', text: e.text }]); break;
    }
  }

  const style = styleById(settings.style);
  const blend = settings.blend ? styleById(settings.blend) : null;
  const model = MODELS[settings.provider][settings.tier];
  const showSefer = settings.display !== 'off' && seferOpen;

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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        </header>

        <div className="modebar">
          <button className="chip accent" onClick={() => setDrawer('settings')}>
            {style.short}{blend ? ` + ${blend.short}` : ''} · {settings.leads === 'learner' ? 'You lead' : 'Chavrusa leads'}
          </button>
          <button className="chip" onClick={() => setDrawer('settings')}>{TIER_LABELS[settings.tier]} · {model.label}</button>
          <button className="chip" onClick={() => updateSettings({ nusach: settings.nusach === 'ashkenaz' ? 'sephardi' : 'ashkenaz' })}>
            {settings.nusach === 'ashkenaz' ? 'Ashkenaz' : 'Sephardi'}
          </button>
          <span className="spacer" />
          <span title="Cost of this session so far">${sessionUsd.toFixed(sessionUsd < 1 ? 3 : 2)}</span>
        </div>

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {items.length === 0 && (
              <div className="welcome">
                <h1>שלום</h1>
                <p>What would you like to learn? Pick a starting point or just type. You can change style anytime by telling your chavrusa.</p>
                <div className="starters">
                  {STARTERS.map((s) => (
                    <button key={s.title} className="starter" onClick={() => (s.prompt ? send(s.prompt) : inputRef.current?.focus())}>
                      <b>{s.title}</b><span>{s.sub}</span>
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: 18, fontSize: 13 }}><a href="#" onClick={(e) => { e.preventDefault(); setHelp(true); }}>What can I ask for?</a></p>
              </div>
            )}
            {items.map((it, i) => {
              if (it.kind === 'user') return <div key={i} className="msg user"><Formatted text={it.text} /></div>;
              if (it.kind === 'assistant') return <div key={i} className="msg assistant"><Formatted text={it.text} /></div>;
              if (it.kind === 'event') return <div key={i} className="event">{it.text}</div>;
              return <div key={i} className="error">{it.text}</div>;
            })}
            {busy && <div className="status"><span className="dots"><span /><span /><span /></span>{status}</div>}
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask, answer, or say what to learn…"
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && isWide) { e.preventDefault(); send(input); } }}
              dir="auto"
            />
            <button className="send" disabled={!input.trim() || busy} onClick={() => send(input)} aria-label="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {showSefer && (
        <SeferPanel
          sources={sources} selected={selected} onSelect={setSelected}
          onClose={() => setSeferOpen(false)}
          settings={settings} onSettings={updateSettings} sessionId={sessionId}
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
                <div key={s.id} className={`session-item ${s.id === sessionId ? 'on' : ''}`}>
                  <button className="session-item" style={{ padding: 0 }} onClick={() => openSession(s.id)}>
                    <span className="t" dir="auto">{s.title}</span>
                    <span className="d">{new Date(s.updated_at).toLocaleDateString()}</span>
                  </button>
                  <button className="mem x" style={{ border: 0, background: 'none', color: 'var(--muted)', fontSize: 18 }} onClick={() => deleteSessionById(s.id)} aria-label="Delete">×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {drawer === 'settings' && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setDrawer(null)} onHelp={() => setHelp(true)} />}
      {help && <Help onClose={() => setHelp(false)} />}
      {loaded && !settings.disclaimerAccepted && <Disclaimer onAccept={() => updateSettings({ disclaimerAccepted: true })} />}
    </div>
  );
}
