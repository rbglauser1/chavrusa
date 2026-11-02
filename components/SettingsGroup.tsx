'use client';
// Settings in groups that open and close: a name, a line of what it's set to now, and an arrow. Groups sit inside
// groups (Voice → Pronunciation and tests → …). Easy to find your way:
// - Only one group at each level is open at a time: opening another closes the one that was open.
// - An open group's name is marked (a colored bar, a light background) and stays pinned at the top while you scroll
//   inside it, with "Close" right there, so the way out is always in reach.
// - Opening a group scrolls it to the top. Which group is open is remembered on this device.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const KEY = (scope: string) => `chavrusa-settings-open-in-${scope}`;
type Scope = { open: string | null; set: (id: string | null) => void };
const ScopeCtx = createContext<Scope | null>(null);

function useScope(scope: string): Scope {
  const [open, setOpen] = useState<string | null>(() => { try { return localStorage.getItem(KEY(scope)) || null; } catch { return null; } });
  return { open, set: (id) => { setOpen(id); try { if (id) localStorage.setItem(KEY(scope), id); else localStorage.removeItem(KEY(scope)); } catch { /* not kept */ } } };
}

/** The top of a list of groups: one of them open at a time. */
export function GroupList({ id, children }: { id: string; children?: ReactNode }) {
  const scope = useScope(id);
  return <ScopeCtx.Provider value={scope}>{children}</ScopeCtx.Provider>;
}

// `flat`: show what's inside without the header (a page that holds only this one group).
export function Group({ id, title, hint, level = 1, flat, children }: { id: string; title: string; hint?: string; level?: 1 | 2 | 3; flat?: boolean; children?: ReactNode }) {
  const parent = useContext(ScopeCtx);
  const inner = useScope(id); // for the groups inside this one
  const [solo, setSolo] = useState(false); // used only if there's no list around it
  const open = parent ? parent.open === id : solo;
  const root = useRef<HTMLDivElement | null>(null);
  const tapped = useRef(false);
  // Opened by a tap: bring its name to the top (the group that closed above it may have moved things).
  // Closed by a tap (maybe from the bottom of a long group): keep its name in view, so you see where you are.
  useEffect(() => {
    if (!tapped.current) return;
    tapped.current = false;
    requestAnimationFrame(() => root.current?.scrollIntoView({ block: open ? 'start' : 'nearest', behavior: 'smooth' }));
  }, [open]);
  if (flat) return <ScopeCtx.Provider value={inner}>{children}</ScopeCtx.Provider>;
  const toggle = () => { tapped.current = true; if (parent) parent.set(open ? null : id); else setSolo(!open); };
  return (
    <div ref={root} className={`sg sg-${level} ${open ? 'open' : ''}`}>
      <button type="button" className="sg-head" aria-expanded={open} onClick={toggle}>
        <span className="sg-text"><span className="sg-title">{title}</span>{hint && !open && <span className="sg-hint">{hint}</span>}</span>
        {open && <span className="sg-close">Close</span>}
        <svg className="sg-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="sg-body">
          <ScopeCtx.Provider value={inner}>{children}</ScopeCtx.Provider>
          {level === 1 && <button type="button" className="sg-done" onClick={toggle}>Close {title}</button>}
        </div>
      )}
    </div>
  );
}
