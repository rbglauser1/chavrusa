'use client';
// A settings group that opens and closes: its name, a short line of what it's set to now, and an arrow. Groups can sit
// inside groups (Voice → Pronunciation → …). Which ones are open is remembered on this device.
import { useState, type ReactNode } from 'react';

const KEY = (id: string) => `chavrusa-settings-open-${id}`;

// `flat`: show what's inside without the header (a page that holds only this one group).
export function Group({ id, title, hint, level = 1, flat, children }: { id: string; title: string; hint?: string; level?: 1 | 2 | 3; flat?: boolean; children?: ReactNode }) {
  const [open, setOpenRaw] = useState<boolean>(() => { try { return localStorage.getItem(KEY(id)) === '1'; } catch { return false; } });
  const setOpen = (v: boolean) => { setOpenRaw(v); try { localStorage.setItem(KEY(id), v ? '1' : '0'); } catch { /* not kept */ } };
  if (flat) return <>{children}</>;
  return (
    <div className={`sg sg-${level} ${open ? 'open' : ''}`}>
      <button type="button" className="sg-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sg-text"><span className="sg-title">{title}</span>{hint && !open && <span className="sg-hint">{hint}</span>}</span>
        <svg className="sg-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && <div className="sg-body">{children}</div>}
    </div>
  );
}
