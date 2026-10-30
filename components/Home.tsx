'use client';
// The new main screen (Settings → Main screen → New): one home that always opens first.
// A card to pick up where you left off, four circles (Library, Recent, Themes, Settings), and a Talk button
// that starts a fresh call and waits for the learner to say what he wants to learn.
import type { ReactNode } from 'react';

type SessionRow = { id: string; title: string; updated_at: string };

const Icon = ({ d, size = 22 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const ICONS = {
  library: <><path d="M5 4h3.5v16H5zM10 4h3.5v16H10z" /><path d="M15.6 4.6l3.4.9-3.9 14.9-3.4-.9z" /></>,
  recent: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  themes: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9a4.4 4.4 0 0 0 4.4-4.4C20.5 6.7 16.7 3.5 12 3.5z" /><circle cx="7.6" cy="11.2" r="1" /><circle cx="10.4" cy="7.6" r="1" /><circle cx="14.8" cy="7.8" r="1" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9 5l7 7-7 7" />,
};

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Learning late tonight' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Learning tonight';
}

export function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff <= 0) return `Today · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export interface ContinueInfo { heRef?: string; ref?: string; line?: number; title?: string; when?: string }

export function Home(p: {
  cont: ContinueInfo | null;
  onContinue: () => void;
  onLibrary: () => void;
  onRecent: () => void;
  onThemes: () => void;
  onSettings: () => void;
  onTalk: () => void;
  talkSupported: boolean;
  talkOn: boolean;
}) {
  const c = p.cont;
  const rows: [keyof typeof ICONS, string, string, () => void][] = [
    ['library', 'Library', 'Gemara, Chumash and every sefer', p.onLibrary],
    ['recent', 'Recent', 'Your sessions, newest first', p.onRecent],
    ['settings', 'Settings', 'Look, learning style, voice, display', p.onSettings],
  ];
  return (
    <div className="home">
      <header className="home-top">
        <div className="home-brand">חברותא</div>
        <div className="home-hello">{greeting()}</div>
      </header>

      <button className={`home-card ${c ? '' : 'empty'}`} onClick={c ? p.onContinue : p.onLibrary}>
        <span className="home-card-label">{c ? 'Pick up where you left off' : 'Begin learning'}</span>
        {c ? (
          <>
            {c.heRef ? <span className="home-card-he">{c.heRef}</span> : <span className="home-card-title" dir="auto">{c.title}</span>}
            <span className="home-card-meta">
              <span>{c.ref ? `${c.ref}${c.line && c.line > 1 ? ` · line ${c.line}` : ''}` : c.when ? when(c.when) : ''}</span>
              <span className="home-card-go"><Icon d={ICONS.chevron} size={18} /></span>
            </span>
          </>
        ) : (
          <>
            <span className="home-card-title">Open the Library</span>
            <span className="home-card-meta"><span>Choose a masechta, a sefer, a perek</span><span className="home-card-go"><Icon d={ICONS.chevron} size={18} /></span></span>
          </>
        )}
      </button>

      <nav className="home-list" aria-label="Main">
        {rows.map(([k, label, sub, go]) => (
          <button key={k} className="home-row" onClick={go}>
            <span className="home-row-icon"><Icon d={ICONS[k]} size={20} /></span>
            <span className="home-row-text"><span className="home-row-title">{label}</span><span className="home-row-sub">{sub}</span></span>
            <span className="home-row-chev"><Icon d={ICONS.chevron} size={16} /></span>
          </button>
        ))}
      </nav>

      {p.talkSupported && (
        <div className="home-talk">
          <button className={`home-talk-btn ${p.talkOn ? 'live' : ''}`} onClick={p.onTalk} aria-label={p.talkOn ? 'Back to the call' : 'Talk'}>
            <Icon d={ICONS.mic} size={30} />
          </button>
          <div className="home-talk-label">{p.talkOn ? 'In a call · tap to return' : 'Talk'}</div>
          {!p.talkOn && <div className="home-talk-hint">Tell your chavrusa what you’d like to learn</div>}
        </div>
      )}
    </div>
  );
}

// A full-screen page of the new main screen (Recent, Themes, Settings): a back arrow, a title, and its content.
export function HomePage({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="hpage">
      <header className="hpage-head">
        <button className="hpage-back" onClick={onBack} aria-label="Back to the main screen"><Icon d={ICONS.back} /></button>
        <h1>{title}</h1>
        <span className="hpage-spacer" />
      </header>
      <div className="hpage-body">{children}</div>
    </div>
  );
}

export function RecentList({ sessions, currentId, onOpen, onDelete, onClearAll, clearArmed }: {
  sessions: SessionRow[]; currentId: string | null;
  onOpen: (id: string) => void; onDelete: (id: string) => void; onClearAll: () => void; clearArmed: boolean;
}) {
  if (!sessions.length) return <div className="recent-empty">Nothing here yet. Tap Talk on the main screen, or open the Library, to begin.</div>;
  return (
    <>
      <ul className="recent-list">
        {sessions.map((s) => (
          <li key={s.id} className={`recent-row ${s.id === currentId ? 'on' : ''}`}>
            <button className="recent-open" onClick={() => onOpen(s.id)}>
              <span className="recent-title" dir="auto">{s.title || 'Untitled session'}</span>
              <span className="recent-when">{when(s.updated_at)}</span>
            </button>
            <button className="recent-x" onClick={() => onDelete(s.id)} aria-label="Delete this session">×</button>
          </li>
        ))}
      </ul>
      <button className={`recent-clear ${clearArmed ? 'armed' : ''}`} onClick={onClearAll}>
        {clearArmed ? `Tap again to clear all ${sessions.length}` : 'Clear all'}
      </button>
    </>
  );
}
