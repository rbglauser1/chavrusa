'use client';
// Color marks inside the text (Settings → Extras → Color marks): select words in a line (press and drag), and a small
// bar offers Question (blue), Answer (green), Key (yellow), or Unmark. Each mark is kept as a note ("on a mark"), so it
// shows in the Notebook with its words; on the page it is drawn with the browser's highlight layer, without changing
// the text (CSS Custom Highlight API: iPhone iOS 17.2 and later; where it isn't there, the marks are still kept).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { notesChanged } from './NoteAdd';

type Note = { id: string; ref: string; n: number; text: string; on?: string; quote?: string };
export const MARKS = [
  { key: 'q', label: 'Question', color: 'blue' },
  { key: 'a', label: 'Answer', color: 'green' },
  { key: 'k', label: 'Key', color: 'yellow' },
] as const;
const ON = 'a mark';
const colorOf = (text: string) => MARKS.find((m) => text.includes(m.label))?.color ?? 'yellow';
const NIK = /[֑-ׇ]/;

/** The ranges in `root` whose text (vowels and trop ignored) is `needle`. */
function rangesOf(root: Element, needle: string): Range[] {
  const want = [...needle].filter((c) => !NIK.test(c) && !/\s/.test(c)).join('');
  if (!want) return [];
  const chars: { node: Text; i: number }[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
    const s = t.data;
    for (let i = 0; i < s.length; i++) if (!NIK.test(s[i]) && !/\s/.test(s[i])) chars.push({ node: t, i });
  }
  const hay = chars.map((c) => c.node.data[c.i]).join('');
  const out: Range[] = [];
  for (let at = hay.indexOf(want); at >= 0; at = hay.indexOf(want, at + want.length)) {
    const a = chars[at], b = chars[at + want.length - 1];
    const r = document.createRange();
    r.setStart(a.node, a.i);
    // Through the last letter and any vowels on it.
    let end = b.i + 1;
    while (end < b.node.data.length && NIK.test(b.node.data[end])) end++;
    r.setEnd(b.node, end);
    out.push(r);
  }
  return out;
}

export default function Marks({ refText, box }: { refText: string; box: () => HTMLElement | null }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [bar, setBar] = useState<{ x: number; y: number; n: number; text: string } | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/notes?ref=${encodeURIComponent(refText)}`).then((r) => r.json())
      .then((d) => setNotes((Array.isArray(d.notes) ? d.notes : []).filter((x: Note) => x.on === ON && x.quote)))
      .catch(() => {});
  }, [refText]);
  useEffect(() => { load(); const f = () => load(); window.addEventListener('chavrusa-notes', f); return () => window.removeEventListener('chavrusa-notes', f); }, [load]);

  // Draw the marks; again whenever the page's text changes (lines open, nikud on or off, the next amud).
  useEffect(() => {
    const H = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...r: Range[]) => unknown });
    if (!H.CSS?.highlights || !H.Highlight) return;
    const draw = () => {
      const root = box();
      const by: Record<string, Range[]> = { blue: [], green: [], yellow: [] };
      if (root) for (const x of notes) {
        const line = root.querySelector(`[data-line="${x.n}"]`);
        const he = line?.querySelectorAll('.he');
        he?.forEach((el) => by[colorOf(x.text)].push(...rangesOf(el, x.quote ?? '')));
        if (!he?.length || !by[colorOf(x.text)].length) { const en = line?.querySelectorAll('.en'); en?.forEach((el) => by[colorOf(x.text)].push(...rangesOf(el, x.quote ?? ''))); }
      }
      for (const c of Object.keys(by)) H.CSS!.highlights!.set(`mark-${c}`, new H.Highlight!(...by[c]));
    };
    draw();
    const root = box();
    const mo = root ? new MutationObserver(() => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(draw, 150); }) : null;
    if (root && mo) mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo?.disconnect(); for (const c of ['blue', 'green', 'yellow']) H.CSS!.highlights!.delete(`mark-${c}`); };
  }, [notes, box]);

  // A selection inside one line of the text: show the bar above it.
  useEffect(() => {
    let t: number | null = null;
    const on = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const sel = window.getSelection();
        const root = box();
        if (!sel || sel.isCollapsed || !sel.rangeCount || !root) { setBar(null); return; }
        const r = sel.getRangeAt(0);
        const el = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement) as Element | null;
        const line = el?.closest('[data-line]');
        const text = sel.toString().replace(/\s+/g, ' ').trim();
        const n = Number(line?.getAttribute('data-line'));
        if (!line || !root.contains(line) || !n || !text || text.length > 240) { setBar(null); return; }
        const rect = r.getBoundingClientRect();
        setBar({ x: rect.left + rect.width / 2, y: rect.bottom, n, text });
      }, 250);
    };
    document.addEventListener('selectionchange', on);
    return () => { document.removeEventListener('selectionchange', on); if (t) window.clearTimeout(t); };
  }, [box]);

  const mark = async (label: string) => {
    if (!bar) return;
    const b = bar; setBar(null); window.getSelection()?.removeAllRanges();
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refText, n: b.n, text: `Marked: ${label}`, on: ON, quote: b.text }) });
    if (r.ok) { notesChanged(); load(); }
  };
  const unmark = async () => {
    if (!bar) return;
    const b = bar; setBar(null); window.getSelection()?.removeAllRanges();
    const flat = (s: string) => [...s].filter((c) => !NIK.test(c) && !/\s/.test(c)).join('');
    const sel = flat(b.text);
    const gone = notes.filter((x) => x.n === b.n && (flat(x.quote ?? '').includes(sel) || sel.includes(flat(x.quote ?? ''))));
    await Promise.all(gone.map((x) => fetch(`/api/notes?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' })));
    if (gone.length) { notesChanged(); load(); }
  };

  if (!bar) return null;
  return createPortal(
    <div className="mk-bar" style={{ top: Math.min(bar.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 60) }} onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.stopPropagation()}>
      {MARKS.map((m) => <button key={m.key} className={`mk-${m.color}`} onClick={() => void mark(m.label)}><i />{m.label}</button>)}
      <button className="mk-un" onClick={() => void unmark()}>Unmark</button>
    </div>,
    document.body,
  );
}
