'use client';
// Nov 27: the line's ✦ menu made lighter, nothing taken away: your top 3 first (picked in Settings), then More ▾ with
// the rest under four headings (Understand, Challenge, Sources, Practice, and This page), each heading's buttons in the
// order you last used them. Every button has its icon. Any button can be hidden altogether (Settings → The AI → The ✦
// and its tools → ✦ buttons).
import { useEffect, useState } from 'react';

export const SAY_GROUPS = ['Understand', 'Challenge', 'Sources', 'Practice', 'This page'] as const;
export type SayGroup = (typeof SAY_GROUPS)[number];
export type SayItem = { id: string; icon: string; label: string; group: SayGroup };
// The fixed catalog (what Settings lists). The menu also shows your own buttons, which can be hidden from the menu too.
export const SAY_ITEMS: SayItem[] = [
  { id: 'simple', icon: '💡', label: 'Simple', group: 'Understand' },
  { id: 'words', icon: '🗣', label: 'In my words', group: 'Understand' },
  { id: 'pshat', icon: '📖', label: 'Pshat', group: 'Understand' },
  { id: 'chart', icon: '🧭', label: 'Sugya chart', group: 'Understand' },
  { id: 'bigpic', icon: '🔭', label: 'Big picture', group: 'Understand' },
  { id: 'kashya', icon: '❓', label: 'Kashya', group: 'Challenge' },
  { id: 'chakira', icon: '⚖️', label: 'Chakira', group: 'Challenge' },
  { id: 'compare', icon: '🔍', label: 'My reading vs Rashi', group: 'Challenge' },
  { id: 'meforshim', icon: '📚', label: 'Meforshim', group: 'Sources' },
  { id: 'halacha', icon: '📜', label: 'Halacha', group: 'Sources' },
  { id: 'widen', icon: '🌐', label: 'Widen it', group: 'Sources' },
  { id: 'ask', icon: '💬', label: 'Ask', group: 'Practice' },
  { id: 'l:Learn with me', icon: '👥', label: 'Learn with me', group: 'Practice' },
  { id: 'l:Where it goes', icon: '⇄', label: 'Where it goes', group: 'Practice' },
  { id: 'l:By heart', icon: '🧠', label: 'By heart', group: 'Practice' },
  { id: 'l:Where was I?', icon: '↩', label: 'Where was I?', group: 'Practice' },
  { id: 'l:Sit with me while I learn', icon: '🎙', label: 'Sit with me while I learn', group: 'Practice' },
  { id: 'p:Ask about the whole page', icon: '💬', label: 'Ask about the whole page', group: 'This page' },
  { id: 'p:Review this passage', icon: '✓', label: 'Review this passage', group: 'This page' },
  { id: 'p:Listen to this page', icon: '🎧', label: 'Listen to this page', group: 'This page' },
  { id: 'p:Source sheet', icon: '📄', label: 'Source sheet', group: 'This page' },
];
export const SAY_TOP_DEFAULT = ['simple', 'words', 'ask'];

let prefs: { top?: string[]; hide: string[] } = { hide: [] };
const EV = 'chavrusa-sayprefs';
export function setSayPrefs(top: string[] | undefined, hide: string[] | undefined) {
  const next = { top: top?.length ? top.slice(0, 3) : undefined, hide: hide ?? [] };
  if (JSON.stringify(next) === JSON.stringify(prefs)) return;
  prefs = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EV));
}
export function useSayPrefs() {
  const [, bump] = useState(0);
  useEffect(() => { const h = () => bump((x) => x + 1); window.addEventListener(EV, h); return () => window.removeEventListener(EV, h); }, []);
  return { top: prefs.top ?? SAY_TOP_DEFAULT, hide: prefs.hide };
}

// When each button was last used (this device), for the order under each heading.
const USE = 'chavrusa-sayuse';
export function lastUsed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(USE) || '{}') as Record<string, number>; } catch { return {}; }
}
export function noteUse(id: string) {
  try { const u = lastUsed(); u[id] = Date.now(); localStorage.setItem(USE, JSON.stringify(u)); } catch { /* private mode */ }
}
