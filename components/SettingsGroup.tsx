'use client';
// Settings as pages you step into, the way the iPhone's own Settings works (Nov 17; the learner found groups opening
// inside groups hard to follow):
// - The main page lists only the top groups, each a row with a line of what it's set to and a ›.
// - Tapping one opens it as its own page: a "‹ back" to where you came from and its name at the top. Its own
//   settings are on that page, and the groups inside it are rows with a › again, one more page down.
// - Only one level is ever shown. The phone's back gesture and the big ‹ at the top step back one page.
// The groups are written as before (<Group> inside <Group>); this file decides what shows.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBackLayer } from '@/lib/back';

type Nav = { path: string[]; go: (p: string[]) => void; titles: Record<string, string>; chain: string[] };
const NavCtx = createContext<Nav | null>(null);

const starts = (path: string[], chain: string[]) => chain.every((c, i) => path[i] === c);

/** The top of the settings: the main page, and the page you have stepped into. */
export function GroupList({ id, children }: { id: string; children?: ReactNode }) {
  const [path, setPath] = useState<string[]>([]);
  const titles = useRef<Record<string, string>>({}).current;
  const top = useRef<HTMLDivElement | null>(null);
  const go = (p: string[]) => setPath(p);
  useBackLayer(path.length > 0, () => setPath((p) => p.slice(0, -1)));
  // Each step: start at the top of the new page.
  useEffect(() => {
    const el = top.current; if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [path.length]);
  const here = path[path.length - 1];
  return (
    <NavCtx.Provider value={{ path, go, titles, chain: [] }}>
      <div ref={top} className="sg-top" data-settings-list={id} />
      {path.length > 0 && <div className="sg-crumb">
        <h2 className="sg-pagetitle">{titles[here] ?? ''}</h2>
      </div>}
      <div className={path.length ? 'sg-pass' : 'sg-root'}>{children}</div>
    </NavCtx.Provider>
  );
}

// `flat`: what's inside shows as if it were at this level (a page that holds only this one group).
export function Group({ id, title, hint, flat, children }: { id: string; title: string; hint?: string; level?: 1 | 2 | 3; flat?: boolean; children?: ReactNode }) {
  const nav = useContext(NavCtx);
  // With no list around it (shouldn't happen in Settings): an ordinary open-and-close group.
  const [solo, setSolo] = useState(false);
  if (!nav) {
    return (
      <div className={`sg sg-2 ${solo ? 'open' : ''}`}>
        <button type="button" className="sg-head" aria-expanded={solo} onClick={() => setSolo(!solo)}>
          <span className="sg-text"><span className="sg-title">{title}</span>{hint && !solo && <span className="sg-hint">{hint}</span>}</span>
          <svg className="sg-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        {solo && <div className="sg-body">{children}</div>}
      </div>
    );
  }
  if (flat) return <>{children}</>;
  const { path, chain } = nav;
  const depth = chain.length;
  nav.titles[id] = title;
  if (!starts(path, chain)) return null;
  // A row on the page you're on: tap to step into it.
  if (path.length === depth) {
    return (
      <div className={`sg sg-node sg-${depth === 0 ? 1 : 2}`}>
        <button type="button" className="sg-head" onClick={() => nav.go([...chain, id])}>
          <span className="sg-text"><span className="sg-title">{title}</span>{hint && <span className="sg-hint">{hint}</span>}</span>
          <svg className="sg-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    );
  }
  if (path[depth] !== id) return null;
  const inner = { ...nav, chain: [...chain, id] };
  // The page you're on: everything in it.
  if (path.length === depth + 1) {
    return <NavCtx.Provider value={inner}><div className="sg-node sg-pagecard">{children}</div></NavCtx.Provider>;
  }
  // On the way to a deeper page: only the group that leads there shows.
  return <NavCtx.Provider value={inner}><div className="sg-node sg-pass">{children}</div></NavCtx.Provider>;
}
