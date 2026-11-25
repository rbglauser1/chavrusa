'use client';
// Nov 25: Learn with a friend. Two people on the same text: tap a line and it lights up for both; talk it over below;
// "✦ Ask the chavrusa" brings the AI in as a third voice on the line you're on. Open to anyone with the link (no login),
// for two days. Made from the reader's ⋯ menu → Learn with a friend.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Msg = { id: number; who: string; text: string; ai?: boolean; at: number };
type RoomView = { ref: string; title: string; line: number; lineBy: string; msgs: Msg[]; aiLeft: number; he?: string[]; en?: string[] };

export default function Together() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [text, setText] = useState<{ he: string[]; en: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const lastLine = useRef(0);

  useEffect(() => { try { const n = localStorage.getItem('chavrusa-friend-name'); if (n) setName(n); } catch { /* optional */ } }, []);
  useEffect(() => {
    let gone = false, t = 0;
    const pull = async (full: boolean) => {
      try {
        const r = await fetch(`/api/room?c=${encodeURIComponent(code)}${full ? '&full=1' : ''}`);
        const d = await r.json();
        if (gone) return;
        if (!r.ok) { setErr(d.error || 'This room has ended.'); return; }
        if (d.he) setText({ he: d.he, en: d.en ?? [] });
        setRoom(d);
      } catch { /* try again next time */ }
      if (!gone) t = window.setTimeout(() => pull(false), document.visibilityState === 'visible' ? 3000 : 15000);
    };
    void pull(true);
    return () => { gone = true; window.clearTimeout(t); };
  }, [code]);
  useEffect(() => { // the pointed line is brought into view when it changes
    if (!room || room.line === lastLine.current) return;
    lastLine.current = room.line;
    document.querySelector(`[data-l="${room.line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [room]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [room?.msgs.length]);

  const send = async (body: object) => {
    const r = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: code, who: name, ...body }) });
    const d = await r.json().catch(() => null);
    if (d && !d.error) setRoom((x) => ({ ...(x ?? d), ...d }));
  };
  const point = (n: number) => { setRoom((x) => (x ? { ...x, line: n, lineBy: name } : x)); lastLine.current = n; void send({ line: n }); };
  const say = async (ai: boolean) => {
    const t = msg.trim(); if (!t && !ai) return;
    setMsg(''); setBusy(true);
    try { await send({ text: t, ai }); } finally { setBusy(false); }
  };
  const share = async () => {
    const url = window.location.href;
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
      if (nav.share) { await nav.share({ title: 'Learn with me', text: `Learn ${room?.title ?? ''} with me`, url }); return; }
      await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled */ }
  };

  if (err) return <main className="tg"><p className="tg-err">{err}</p></main>;
  if (!name) return (
    <main className="tg tg-name">
      <h1>Learn together</h1>
      <p>{room?.title ? `${room.title}. ` : ''}What should your chavrusa call you?</p>
      <form onSubmit={(e) => { e.preventDefault(); const n = nameDraft.trim().slice(0, 30); if (!n) return; setName(n); try { localStorage.setItem('chavrusa-friend-name', n); } catch { /* optional */ } }}>
        <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" autoFocus />
        <button type="submit" disabled={!nameDraft.trim()}>Join</button>
      </form>
    </main>
  );
  return (
    <main className="tg">
      <header className="tg-head">
        <a href="/" className="tg-back" aria-label="Back to the app">‹</a>
        <div><b>{room?.title ?? '…'}</b><small>Learning together{room?.lineBy ? ` · ${room.lineBy} is on line ${room.line}` : ''}</small></div>
        <button className="tg-share" onClick={() => void share()}>{copied ? 'Link copied' : 'Invite'}</button>
      </header>
      <section className="tg-text">
        {!text ? <p className="tg-wait">Opening the text…</p> : text.he.map((h, i) => (
          <button key={i} data-l={i + 1} className={`tg-line ${room?.line === i + 1 ? 'on' : ''}`} onClick={() => point(i + 1)}>
            <span className="tg-n">{i + 1}</span>
            <span className="tg-he" dir="rtl">{h}</span>
            {room?.line === i + 1 && text.en[i] && <span className="tg-en">{text.en[i]}</span>}
          </button>
        ))}
      </section>
      <section className="tg-chat">
        <div className="tg-msgs">
          {!room?.msgs.length && <p className="tg-hint">Tap a line to point at it: it lights up for both of you. Talk it over here, and call the chavrusa in when you’re stuck.</p>}
          {room?.msgs.map((m) => (
            <div key={m.id} className={`tg-msg ${m.ai ? 'ai' : m.who === name ? 'me' : ''}`}><b>{m.ai ? '✦ Chavrusa' : m.who}</b><span dir="auto">{m.text}</span></div>
          ))}
          {busy && <div className="tg-msg ai"><b>✦ Chavrusa</b><span>…</span></div>}
          <div ref={chatEnd} />
        </div>
        <form className="tg-say" onSubmit={(e) => { e.preventDefault(); void say(false); }}>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Say something about line ${room?.line ?? 1}…`} dir="auto" />
          <button type="submit" disabled={!msg.trim()}>Send</button>
          <button type="button" className="tg-ai" disabled={busy || !room?.aiLeft} onClick={() => void say(true)}>✦ Ask the chavrusa</button>
        </form>
        <p className="tg-note">The chavrusa is AI and makes mistakes · for practice, ask your rav · this room lasts two days</p>
      </section>
    </main>
  );
}
