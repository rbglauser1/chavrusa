'use client';
import { useEffect, useState } from 'react';

// Browse Sefaria's library inside the Sefer: category -> sefer -> perek / daf / part. Free (no AI).
type Item = { kind: 'category' | 'book'; name: string; he: string };
type Shape = { title: string; he: string; kind: 'chapters' | 'talmud' | 'parts' | 'open'; count?: number; lastDaf?: number; unit?: string; parts?: { name: string; he: string }[]; error?: string };

const UNIT_LABEL: Record<string, string> = { Chapter: 'Perek', Perek: 'Perek', Siman: 'Siman', Daf: 'Daf', Parasha: 'Parsha' };

// Where the learner was in the library, kept for the whole visit (even when the Sefer is closed and reopened).
const memory: { path: string[]; book: { title: string; part?: string } | null } = { path: [], book: null };

// The trail to where the learner is in the library (shown above the text in the Sefer, to jump back to any level).
export function libraryTrail(): string[] {
  return [...memory.path, ...(memory.book ? [memory.book.title, ...(memory.book.part ? memory.book.part.split('|') : [])] : [])];
}
export function jumpLibrary(level: number) {
  // level counts the trail above (0 = the first category).
  const n = memory.path.length;
  if (level < n) { memory.path = memory.path.slice(0, level + 1); memory.book = null; }
  else if (memory.book && level === n) memory.book = { title: memory.book.title };
  else if (memory.book?.part) memory.book = { title: memory.book.title, part: memory.book.part.split('|').slice(0, level - n).join('|') };
  window.dispatchEvent(new Event('lib-jump'));
}

// Recently opened places (kept on this device), to go back to with one tap.
type Recent = { ref: string; trail: string[] };
function loadRecent(): Recent[] { try { return JSON.parse(localStorage.getItem('lib-recent') ?? '[]'); } catch { return []; } }
function saveRecent(r: Recent) {
  try { localStorage.setItem('lib-recent', JSON.stringify([r, ...loadRecent().filter((x) => x.ref !== r.ref)].slice(0, 8))); } catch { /* optional */ }
}

export default function Library({ onOpen, onClose }: { onOpen: (ref: string) => Promise<string | { message: string; approvable?: string } | null>; onClose: () => void }) {
  const [path, setPathState] = useState<string[]>(memory.path);
  const setPath = (p: string[]) => { memory.path = p; setPathState(p); };
  const [items, setItems] = useState<Item[] | null>(null);
  const [book, setBookState] = useState<{ title: string; part?: string } | null>(memory.book);
  const setBook = (b: { title: string; part?: string } | null) => { memory.book = b; setBookState(b); };
  const [shape, setShape] = useState<Shape | null>(null);
  const [msg, setMsg] = useState('');
  const [approvable, setApprovable] = useState<{ work: string; ref: string } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => { setRecent(loadRecent()); }, [path, book]);
  // Jumps from the trail shown in the Sefer.
  useEffect(() => {
    const on = () => { setPathState(memory.path); setBookState(memory.book); };
    window.addEventListener('lib-jump', on);
    return () => window.removeEventListener('lib-jump', on);
  }, []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (book) return;
    setItems(null); setMsg('');
    fetch(`/api/library?path=${encodeURIComponent(path.join('|'))}`).then((r) => r.json())
      .then((d) => { if (d.error) setMsg(d.error); setItems(d.items ?? []); })
      .catch(() => setMsg("Couldn't reach Sefaria's library."));
  }, [path, book]);

  useEffect(() => {
    if (!book) return;
    setShape(null); setMsg('');
    const q = new URLSearchParams({ book: book.title, ...(book.part ? { part: book.part } : {}) });
    fetch(`/api/library?${q}`).then((r) => r.json()).then((d) => { if (d.error) setMsg(d.error); else setShape(d); })
      .catch(() => setMsg("Couldn't load this sefer."));
  }, [book]);

  async function open(ref: string) {
    setBusy(true); setMsg(''); setApprovable(null);
    const err = await onOpen(ref);
    setBusy(false);
    if (!err) { saveRecent({ ref, trail: libraryTrail() }); onClose(); return; }
    if (typeof err === 'string') { setMsg(err); return; }
    setMsg(err.message);
    if (err.approvable) setApprovable({ work: err.approvable, ref });
  }
  async function approveAndOpen() {
    if (!approvable) return;
    setBusy(true);
    await fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work: approvable.work }) }).catch(() => {});
    setBusy(false);
    await open(approvable.ref);
  }

  const partPath = book?.part ? book.part.split('|') : [];
  const crumbs = ['Library', ...path, ...(book ? [book.title, ...partPath] : [])];
  function goCrumb(i: number) {
    if (i === 0) { setBook(null); setPath([]); return; }
    if (i <= path.length) { setBook(null); setPath(path.slice(0, i)); return; }
    if (book && i === path.length + 1) { setBook({ title: book.title }); return; }
    if (book && i > path.length + 1) setBook({ title: book.title, part: partPath.slice(0, i - path.length - 1).join('|') });
  }

  return (
    <div className="lib">
      <div className="lib-crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>{i > 0 && <span className="sep">›</span>}<button onClick={() => goCrumb(i)} disabled={i === crumbs.length - 1}>{c}</button></span>
        ))}
        <button className="lib-close" onClick={onClose} aria-label="Close library">✕</button>
      </div>
      {msg && <div className="goto-msg">{msg}</div>}
      {approvable && <button className="btn" disabled={busy} onClick={approveAndOpen}>Approve this sefer and open it</button>}

      {!book && !path.length && recent.length > 0 && (
        <div className="lib-recent">
          <div className="lib-recent-head">
            <span className="muted lib-hint">Recent</span>
            <button className="clear-all" onClick={() => { try { localStorage.removeItem('lib-recent'); } catch { /* optional */ } setRecent([]); }}>Clear</button>
          </div>
          {recent.map((r) => (
            <button key={r.ref} className="lib-item book" disabled={busy} onClick={() => open(r.ref)}>
              <span className="en">{r.ref}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{r.trail.slice(0, -1).join(' › ')}</span>
            </button>
          ))}
          <div className="muted lib-hint" style={{ marginTop: 14 }}>All seforim</div>
        </div>
      )}
      {!book && (
        <div className="lib-list">
          {!items && !msg && <div className="muted">Opening the library…</div>}
          {items?.map((it) => (
            <button key={`${it.kind}-${it.name}`} className={`lib-item ${it.kind}`} onClick={() => (it.kind === 'category' ? setPath([...path, it.name]) : setBook({ title: it.name }))}>
              <span className="en">{it.name}</span>
              {it.he && <span className="he" dir="rtl">{it.he}</span>}
              <span className="chev" aria-hidden="true">{it.kind === 'category' ? '›' : ''}</span>
            </button>
          ))}
          {items && !items.length && !msg && <div className="muted">Nothing here.</div>}
        </div>
      )}

      {book && (
        <div className="lib-book">
          {!shape && !msg && <div className="muted">Opening…</div>}
          {shape && <div className="lib-title"><span>{shape.title}</span>{shape.he && <span className="he" dir="rtl">{shape.he}</span>}</div>}
          {shape?.kind === 'chapters' && (
            <>
              <div className="muted lib-hint">{UNIT_LABEL[shape.unit ?? ''] ?? shape.unit}</div>
              <div className="lib-grid">
                {Array.from({ length: shape.count ?? 0 }, (_, i) => i + 1).map((n) => (
                  <button key={n} disabled={busy} onClick={() => open(`${shape.title} ${n}`)}>{n}</button>
                ))}
              </div>
            </>
          )}
          {shape?.kind === 'talmud' && (
            <>
              <div className="muted lib-hint">Daf (amud a / b)</div>
              <div className="lib-grid daf">
                {Array.from({ length: Math.max(0, (shape.lastDaf ?? 0) - 1) }, (_, i) => i + 2).map((d) => (
                  <span key={d} className="daf-cell">
                    <b>{d}</b>
                    <button disabled={busy} onClick={() => open(`${shape.title} ${d}a`)}>a</button>
                    <button disabled={busy} onClick={() => open(`${shape.title} ${d}b`)}>b</button>
                  </span>
                ))}
              </div>
            </>
          )}
          {shape?.kind === 'parts' && (
            <div className="lib-list">
              {shape.parts?.map((p) => (
                <button key={p.name} className="lib-item category" onClick={() => setBook({ title: book.title, part: book.part ? `${book.part}|${p.name}` : p.name })}>
                  <span className="en">{p.name}</span>{p.he && <span className="he" dir="rtl">{p.he}</span>}<span className="chev">›</span>
                </button>
              ))}
            </div>
          )}
          {shape?.kind === 'open' && (
            <button className="btn primary" disabled={busy} onClick={() => open(shape.title)}>{busy ? 'Opening…' : 'Open'}</button>
          )}
        </div>
      )}
    </div>
  );
}
