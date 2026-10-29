'use client';
// The minimalist layouts (Settings → Look → Layout). They use the same learning, voice and Sefer underneath as the
// classic screen; only what's on screen changes. Three of them:
//   page     — the sefer is the home screen; the chavrusa's last words sit under it like a caption; one Talk button.
//   quiet    — the conversation, set like a page in a book, with lines of text appearing in it as quotes.
//   shtender — the text on top, the conversation below, one bar at the bottom.
import { useEffect, useRef, useState } from 'react';
import type { SourceData } from '@/lib/db';
import type { Settings } from '@/lib/config';
import { stripNikud, yeshivishEnglish } from '@/lib/hebrew';
import { Formatted } from './Message';
import { useOutline } from './useOutline';

export type Layout = 'page' | 'quiet' | 'shtender' | 'dock';
type Msg = { kind: string; text: string };
type InlineComm = { main: string; line: number; title: string; ref: string; he: string[]; en: string[]; key: number } | null;

interface Props {
  layout: Layout;
  settings: Settings;
  current: SourceData | null;
  items: Msg[];
  busy: boolean;
  status: string;
  input: string;
  setInput: (v: string) => void;
  send: (text: string) => void;
  talk: { supported: boolean; on: boolean; state: string; heard: string; toggle: () => void; resume: () => void };
  pointAt: (src: SourceData, n: number) => void;
  inlineComm: InlineComm;
  onMenu: () => void;       // sessions
  onSettings: () => void;
  onToggle?: (patch: Partial<Settings>) => void; // Quiet chat: the text's options (nikud, translation, steps, summaries) live in the ⋯ menu
  onLibrary: () => void;
  onSefer: () => void;      // the full Sefer (commentaries, next amud, everything)
  onNewSession: () => void;
  starters: { title: string; sub: string; he: string; prompt: string }[];
  sefer?: React.ReactNode;  // Quiet chat: the Sefer itself (text, commentaries, steps, summaries…), shown in its Text tab
  textTick?: number;        // changes when the Library or the Sefer is asked for: go to the Text tab
}

const MicIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h10" /></svg>
);
const DotsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
);
const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
);

function talkLabel(t: Props['talk'], busy: boolean, status: string): string {
  if (!t.on) return busy ? (status || 'Thinking…') : '';
  if (t.state === 'paused') return 'Paused · tap to resume';
  if (t.state === 'connecting') return 'Connecting…';
  if (t.state === 'thinking') return status || 'Looking inside…';
  if (t.state === 'speaking') return 'Speaking · just talk to interrupt';
  return t.heard ? `“${t.heard.slice(-80)}”` : 'Listening';
}

// The text itself: the place we're on stands out; tap any line to learn from there.
function TextView({ src, settings, pointAt, dimOthers, englishAll, inlineComm }: {
  src: SourceData; settings: Settings; pointAt: (s: SourceData, n: number) => void; dimOthers: boolean; englishAll: boolean; inlineComm: InlineComm;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const focus = src.focus ?? 1;
  useEffect(() => {
    const t = window.setTimeout(() => box.current?.querySelector(`[data-n="${focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    return () => window.clearTimeout(t);
  }, [src.ref, focus]);
  const comm = /\s(on)\s/i.test(src.ref);
  const showEn = settings.display !== 'off';
  const outline = useOutline(src.ref, !!settings.outline);
  return (
    <div className="min-text" ref={box}>
      {src.he.map((line, i) => {
        const n = i + 1, on = n === focus;
        const en = src.en[i] || (src.en.length ? '' : src.altEn?.[i] ?? '');
        const c = inlineComm && inlineComm.main === src.ref && inlineComm.line === n ? inlineComm : null;
        return (
          <div key={i} data-n={n} className={`min-line ${on ? 'on' : ''} ${dimOthers && !on ? 'dim' : ''}`}>
            {(outline.byLine[n] ?? []).map((m, k) => <div key={k} className="move">{m}</div>)}
            <button className={`min-he ${comm ? 'rashi' : ''}`} dir="rtl" onClick={() => pointAt(src, n)} aria-label={`Learn from line ${n}`}>
              {settings.nikud ? line : stripNikud(line)}
            </button>
            {showEn && en && (englishAll || on) && <p className="min-en">{yeshivishEnglish(en)}</p>}
            {c && (
              <div className="min-comm">
                <span className="min-comm-title">{c.title === 'Tosafot' ? 'Tosafos' : c.title}</span>
                {c.he.map((h, k) => <p key={k} className="rashi" dir="rtl">{settings.nikud ? h : stripNikud(h)}</p>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Thread({ items, busy, status, endRef }: { items: Msg[]; busy: boolean; status: string; endRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="min-thread">
      {items.map((it, i) => it.kind === 'user'
        ? <div key={i} className="min-me" dir="auto">{it.text}</div>
        : it.kind === 'assistant'
          ? <div key={i} className="min-them"><Formatted text={it.text} /></div>
          : <div key={i} className={it.kind === 'error' ? 'min-error' : 'min-event'}>{it.text}</div>)}
      {busy && <div className="min-event">{status || 'Thinking…'}</div>}
      <div ref={endRef} />
    </div>
  );
}

export default function Minimal(p: Props) {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);     // page: the conversation pulled up
  const [typing, setTyping] = useState(false);   // shtender: show the box for typing
  const [tab, setTab] = useState<'text' | 'talk'>('text'); // quiet chat: the text, or the conversation
  // The Library or the Sefer was asked for, or a new place opened: show the text.
  useEffect(() => { if (p.textTick) setTab('text'); }, [p.textTick]);
  useEffect(() => { if (p.current?.ref) setTab('text'); }, [p.current?.ref]);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [p.items.length, p.busy, sheet, typing]);
  const lastSaid = [...p.items].reverse().find((x) => x.kind === 'assistant')?.text ?? '';
  const caption = lastSaid.replace(/^\s*>.*$/gm, '').replace(/\*\*|__|`|\[\[\/?say\]\]/g, '').replace(/\s+/g, ' ').trim();
  const src = p.current;
  const label = talkLabel(p.talk, p.busy, p.status);
  const onTalk = () => (p.talk.on && p.talk.state === 'paused' ? p.talk.resume() : p.talk.toggle());
  // Next / back: in a call, move to the line (the voice reads it); otherwise ask the chavrusa (free).
  const step = (d: 1 | -1) => {
    if (src && p.talk.on) { const n = Math.min(Math.max((src.focus ?? 1) + d, 1), src.he.length); p.pointAt(src, n); return; }
    p.send(d === 1 ? 'next' : 'back');
  };
  const submit = () => { if (p.input.trim() && !p.busy) p.send(p.input); };

  const header = (
    <header className="min-head">
      <button className="min-icon" onClick={p.onMenu} aria-label="Sessions"><MenuIcon /></button>
      {p.layout === 'quiet'
        ? <span className="min-brand">חברותא</span>
        : <button className="min-place" onClick={p.onSefer} aria-label="Open the full Sefer">
            <span className="he">{src?.heRef ?? 'חברותא'}</span>
            <small>{src?.ref ?? 'Your learning partner'}</small>
          </button>}
      {p.layout === 'quiet' && src
        ? <button className="min-pill" onClick={p.onSefer} aria-label="Open the full Sefer"><span className="he">{src.heRef}</span></button>
        : <button className="min-icon" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}><DotsIcon /></button>}
      {p.layout === 'quiet' && src && <button className="min-icon" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}><DotsIcon /></button>}
      {menu && (
        <div className="min-menu" role="menu">
          <button role="menuitem" onClick={() => { setMenu(false); p.onLibrary(); }}>Library</button>
          <button role="menuitem" onClick={() => { setMenu(false); p.onSefer(); }}>The full Sefer (commentaries, next amud)</button>
          {p.onToggle && (
            <>
              <button role="menuitemcheckbox" aria-checked={p.settings.seferEnglish !== false} onClick={() => p.onToggle!({ seferEnglish: p.settings.seferEnglish === false })}>Translation <span className="min-check">{p.settings.seferEnglish !== false ? 'on' : 'off'}</span></button>
              <button role="menuitemcheckbox" aria-checked={!!p.settings.nikud} onClick={() => p.onToggle!({ nikud: !p.settings.nikud })}>Nikud <span className="min-check">{p.settings.nikud ? 'on' : 'off'}</span></button>
              <button role="menuitemcheckbox" aria-checked={!!p.settings.outline} onClick={() => p.onToggle!({ outline: !p.settings.outline })}>Steps <span className="min-check">{p.settings.outline ? 'on' : 'off'}</span></button>
              <button role="menuitemcheckbox" aria-checked={!!p.settings.commSummary} onClick={() => p.onToggle!({ commSummary: !p.settings.commSummary })}>Commentary summaries <span className="min-check">{p.settings.commSummary ? 'on' : 'off'}</span></button>
              <span className="min-menu-rule" />
            </>
          )}
          <button role="menuitem" onClick={() => { setMenu(false); p.onNewSession(); }}>New session</button>
          <button role="menuitem" onClick={() => { setMenu(false); p.onSettings(); }}>Settings</button>
          <a role="menuitem" href="/guide">How we learn</a>
        </div>
      )}
    </header>
  );

  const composer = (autoFocus = false) => (
    <form className="min-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="min-ask" className="sr-only">Your answer or question</label>
      <input id="min-ask" value={p.input} onChange={(e) => p.setInput(e.target.value)} placeholder="Answer, or ask…" dir="auto" autoFocus={autoFocus} />
      {p.input.trim()
        ? <button type="submit" className="min-round" aria-label="Send" disabled={p.busy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        : p.talk.supported && <button type="button" className={`min-round ${p.talk.on ? 'live' : ''}`} onClick={onTalk} aria-label={p.talk.on ? 'End the call' : 'Talk'}><MicIcon size={20} /></button>}
    </form>
  );

  const welcome = (
    <div className="min-welcome">
      <h1 className="he">שלום</h1>
      <p>What shall we learn?</p>
      <div className="min-starters">
        <button onClick={p.onLibrary}><span>Browse the library</span><i className="he">ספרייה</i></button>
        {p.starters.filter((s) => s.prompt).map((s) => (
          <button key={s.title} onClick={() => p.send(s.prompt)}><span>{s.title}</span><i className="he">{s.he}</i></button>
        ))}
      </div>
    </div>
  );

  // ---------- The dock under the Sefer (Sefer only): the last words, a box, and the conversation when pulled up ----------
  if (p.layout === 'dock') {
    return (
      <div className="min-dock">
        {(caption || label) && (
          <button className="min-caption" onClick={() => setSheet(true)} aria-label="Show the conversation">
            <span className="min-grip" aria-hidden="true" />
            {label && <span className="min-status inline">{label}</span>}
            {caption && <span className="min-caption-text">{caption.length > 200 ? `${caption.slice(0, 200).replace(/\s+\S*$/, '')}…` : caption}</span>}
          </button>
        )}
        {composer()}
        {sheet && (
          <>
            <div className="min-scrim" onClick={() => setSheet(false)} />
            <section className="min-sheet" aria-label="Conversation">
              <button className="min-grip-btn" onClick={() => setSheet(false)} aria-label="Back to the text"><span className="min-grip" /></button>
              <Thread items={p.items} busy={p.busy} status={p.status} endRef={endRef} />
              {composer(true)}
            </section>
          </>
        )}
      </div>
    );
  }

  // ---------- A · The page ----------
  if (p.layout === 'page') {
    return (
      <div className="min min-page">
        {header}
        <div className="min-rule" />
        <main className="min-body">
          {src ? <TextView src={src} settings={p.settings} pointAt={p.pointAt} dimOthers englishAll={false} inlineComm={p.inlineComm} /> : welcome}
        </main>
        {(caption || p.items.length > 0) && (
          <button className="min-caption" onClick={() => setSheet(true)} aria-label="Show the conversation">
            <span className="min-grip" aria-hidden="true" />
            {caption && <span className="min-caption-text">{caption.length > 230 ? `${caption.slice(0, 230).replace(/\s+\S*$/, '')}…` : caption}</span>}
          </button>
        )}
        <footer className="min-controls">
          <button className="min-step" onClick={() => step(1)} aria-label="Next line" disabled={!src}><Chevron dir="left" /></button>
          {p.talk.supported && <button className={`min-talk ${p.talk.on ? 'live' : ''}`} onClick={onTalk} aria-label={p.talk.on ? 'End the call' : 'Talk'}><MicIcon size={26} /></button>}
          <button className="min-step" onClick={() => step(-1)} aria-label="Previous line" disabled={!src}><Chevron dir="right" /></button>
        </footer>
        <div className="min-status">{label || (p.talk.on ? '' : 'Tap to talk · or swipe up to type')}</div>
        {sheet && (
          <>
            <div className="min-scrim" onClick={() => setSheet(false)} />
            <section className="min-sheet" aria-label="Conversation">
              <button className="min-grip-btn" onClick={() => setSheet(false)} aria-label="Back to the text"><span className="min-grip" /></button>
              <Thread items={p.items} busy={p.busy} status={p.status} endRef={endRef} />
              {composer(true)}
            </section>
          </>
        )}
      </div>
    );
  }

  // ---------- B · Quiet chat ----------
  if (p.layout === 'quiet') {
    // One page: the text when there is one, the chavrusa's last words under it; tap them for the whole conversation.
    const showText = !!p.sefer && (!!src || (p.textTick ?? 0) > 0);
    return (
      <div className="min min-quiet">
        {header}
        {p.sefer && <div className="min-sefer" style={showText ? undefined : { display: 'none' }}>{p.sefer}</div>}
        {!showText && (
          <main className="min-body">
            {p.items.length === 0 ? welcome : <Thread items={p.items} busy={p.busy} status={p.status} endRef={endRef} />}
          </main>
        )}
        {showText && caption && (
          <button className="min-caption" onClick={() => setSheet(true)} aria-label="Show the conversation">
            <span className="min-caption-text">{caption.length > 180 ? `${caption.slice(0, 180).replace(/\s+\S*$/, '')}…` : caption}</span>
          </button>
        )}
        {sheet && showText && (
          <>
            <div className="min-scrim" onClick={() => setSheet(false)} />
            <section className="min-sheet" aria-label="Conversation">
              <button className="min-grip-btn" onClick={() => setSheet(false)} aria-label="Back to the text"><span className="min-grip" /></button>
              <Thread items={p.items} busy={p.busy} status={p.status} endRef={endRef} />
              {composer(true)}
            </section>
          </>
        )}
        {src && (
          <div className="min-chips">
            <button onClick={() => step(1)}>Next line</button>
            <button onClick={() => p.send('continue')}>Explain</button>
            <button onClick={() => p.send("let's see the Rashi")}>Rashi</button>
            <button onClick={() => p.send("let's see the Tosafos")}>Tosafos</button>
          </div>
        )}
        {label && <div className="min-status">{label}</div>}
        {composer()}
      </div>
    );
  }

  // ---------- C · Shtender ----------
  return (
    <div className="min min-shtender">
      <section className="min-top" aria-label="The text">
        <div className="min-top-head">
          <button className="min-place left" onClick={p.onSefer} aria-label="Open the full Sefer">
            <span className="he">{src?.heRef ?? 'חברותא'}</span>
            <small>{src ? `${src.ref}${src.focus ? ` · line ${src.focus}` : ''}` : 'Your learning partner'}</small>
          </button>
          <button className="min-icon" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}><DotsIcon /></button>
          {menu && (
            <div className="min-menu" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); p.onLibrary(); }}>Library</button>
              <button role="menuitem" onClick={() => { setMenu(false); p.onSefer(); }}>The full Sefer (commentaries, next amud)</button>
              <button role="menuitem" onClick={() => { setMenu(false); p.onNewSession(); }}>New session</button>
              <button role="menuitem" onClick={() => { setMenu(false); p.onSettings(); }}>Settings</button>
              <a role="menuitem" href="/guide">How we learn</a>
            </div>
          )}
        </div>
        {src ? <TextView src={src} settings={p.settings} pointAt={p.pointAt} dimOthers={false} englishAll={p.settings.seferEnglish !== false} inlineComm={p.inlineComm} /> : welcome}
        {src && (
          <div className="min-chips tight">
            <button className="he" onClick={() => p.send("let's see the Rashi")}>רש״י</button>
            <button className="he" onClick={() => p.send("let's see the Tosafos")}>תוספות</button>
            <button onClick={() => step(1)}>Next ‹</button>
          </div>
        )}
      </section>
      <section className="min-bottom" aria-label="Conversation">
        <Thread items={p.items.slice(-12)} busy={p.busy} status={p.status} endRef={endRef} />
      </section>
      {typing ? composer(true) : (
        <footer className="min-bar">
          <button className="min-icon" onClick={p.onMenu} aria-label="Sessions"><MenuIcon /></button>
          {p.talk.supported && (
            <button className={`min-talk-pill ${p.talk.on ? 'live' : ''}`} onClick={onTalk}>
              <MicIcon size={18} /> {p.talk.on ? (p.talk.state === 'paused' ? 'Resume' : 'End') : 'Talk'}
            </button>
          )}
          <button className="min-icon" onClick={() => setTyping(true)} aria-label="Type instead">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>
          </button>
        </footer>
      )}
      {label && <div className="min-status overlay">{label}</div>}
    </div>
  );
}
