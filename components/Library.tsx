'use client';
import { useEffect, useState } from 'react';

// Browse Sefaria's library inside the Sefer: category -> sefer -> perek / daf / part. Free (no AI).
type Item = { kind: 'category' | 'book'; name: string; he: string };
type Shape = { title: string; he: string; kind: 'chapters' | 'talmud' | 'parts' | 'open'; count?: number; lastDaf?: number; unit?: string; parts?: { name: string; he: string }[]; error?: string };

const UNIT_LABEL: Record<string, string> = { Chapter: 'Perek', Perek: 'Perek', Siman: 'Siman', Daf: 'Daf', Parasha: 'Parsha' };

export default function Library({ onOpen, onClose }: { onOpen: (ref: string) => Promise<string | null>; onClose: () => void }) {
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [book, setBook] = useState<{ title: string; part?: string } | null>(null);
  const [shape, setShape] = useState<Shape | null>(null);
  const [msg, setMsg] = useState('');
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
    setBusy(true); setMsg('');
    const err = await onOpen(ref);
    setBusy(false);
    if (err) setMsg(err); else onClose();
  }

  const crumbs = ['Library', ...path, ...(book ? [book.title, ...(book.part ? [book.part] : [])] : [])];
  function goCrumb(i: number) {
    if (i === 0) { setBook(null); setPath([]); return; }
    if (i <= path.length) { setBook(null); setPath(path.slice(0, i)); return; }
    if (book && i === path.length + 1) setBook({ title: book.title });
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
                <button key={p.name} className="lib-item category" onClick={() => setBook({ title: book.title, part: p.name })}>
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
