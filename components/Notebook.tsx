'use client';
// The Notebook: every note in one place, filed three ways at once, with nothing to file by hand:
//   By sefer  — like the Library (Yoma → 6a → line 4; the note on Rashi under its line); pages of their own at the end.
//   Topics    — every #word in a note (#kashya, #halacha, #chazara…), pinned topics first.
//   Newest    — newest first.
// A search covers them all. Tap "Open" to go to the note's line. Share or print what is shown (one amud, one topic…).
import { useEffect, useMemo, useState } from 'react';

type Note = { id: string; ref: string; n: number; text: string; created: string; updated?: string; on?: string; quote?: string };
type View = 'sefer' | 'topics' | 'newest';

const tagsOf = (text: string) => [...new Set((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()))];
// "Yoma 6a" → "Yoma"; "Genesis 24" → "Genesis"; "Mishnah Yoma 1" → "Mishnah Yoma"; "Rashi on Yoma 6a" → "Yoma"
const bookOf = (ref: string) => (ref ? ref.replace(/^.* on /, '').replace(/ \d+[ab]?(:\d+)?$/, '') : 'Pages of your own');
const where = (x: Note) => (x.ref ? `${x.ref}${x.n ? `, line ${x.n}` : ''}${x.on ? ` · on ${x.on}` : ''}` : 'A page of your own');

function Text({ text, onTag }: { text: string; onTag: (t: string) => void }) {
  const parts = text.split(/(#[\p{L}\p{N}_-]+)/u);
  return <div className="nb-text" dir="auto">{parts.map((p, i) => (p.startsWith('#') ? <button key={i} className="nb-tag" onClick={() => onTag(p.slice(1).toLowerCase())}>{p}</button> : <span key={i}>{p}</span>))}</div>;
}

export default function Notebook({ onClose, onOpen }: { onClose: () => void; onOpen: (ref: string, n: number) => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('chavrusa-nb-view') as View) || 'sefer'; } catch { return 'sefer'; } });
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [newPage, setNewPage] = useState<string | null>(null);
  const load = () => fetch('/api/notes').then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => setNotes([]));
  useEffect(() => { void load(); }, []);
  useEffect(() => { try { localStorage.setItem('chavrusa-nb-view', view); } catch { /* optional */ } }, [view]);

  const hits = useMemo(() => {
    const all = notes ?? [];
    const s = q.trim().toLowerCase();
    return all.filter((x) => (!tag || tagsOf(x.text).includes(tag)) && (!s || `${x.text} ${x.ref} ${x.on ?? ''} ${x.quote ?? ''}`.toLowerCase().includes(s)));
  }, [notes, q, tag]);
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of notes ?? []) for (const t of tagsOf(x.text)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes]);
  const books = useMemo(() => {
    const m = new Map<string, Map<string, Note[]>>();
    for (const x of hits) {
      const b = bookOf(x.ref), sec = x.ref || '';
      if (!m.has(b)) m.set(b, new Map());
      const bm = m.get(b)!;
      if (!bm.has(sec)) bm.set(sec, []);
      bm.get(sec)!.push(x);
    }
    for (const bm of m.values()) for (const list of bm.values()) list.sort((a, b) => a.n - b.n || a.created.localeCompare(b.created));
    return [...m.entries()].sort((a, b) => (a[0] === 'Pages of your own' ? 1 : b[0] === 'Pages of your own' ? -1 : a[0].localeCompare(b[0])));
  }, [hits]);

  const save = async (id: string, text: string) => {
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, text }) }).catch(() => null);
    setEdit(null); void load();
  };
  const drop = async (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    await fetch(`/api/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    void load();
  };
  const addPage = async () => {
    if (!newPage?.trim()) return;
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: newPage }) }).catch(() => null);
    setNewPage(null); void load();
  };
  // Share or print what is shown now.
  const asText = (list: Note[]) => list.map((x) => `${where(x)}${x.quote ? `\n  “${x.quote}”` : ''}\n${x.text}`).join('\n\n');
  const shown = view === 'sefer' && openBook ? hits.filter((x) => bookOf(x.ref) === openBook) : hits;
  const titleOfShown = tag ? `#${tag}` : view === 'sefer' && openBook ? openBook : 'My notes';
  const share = async () => {
    const text = `${titleOfShown}\n\n${asText(shown)}`;
    try { if (navigator.share) { await navigator.share({ title: titleOfShown, text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); window.alert('Copied. Paste it wherever you like.'); } catch { /* ignore */ }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(titleOfShown)}</title><style>body{font:16px/1.5 Georgia,serif;max-width:680px;margin:32px auto;padding:0 16px}h1{font-weight:400}.w{color:#777;font:13px sans-serif}.q{font-style:italic;color:#555}.n{margin:0 0 22px;white-space:pre-wrap}</style><h1>${esc(titleOfShown)}</h1>${shown.map((x) => `<div class="w">${esc(where(x))}</div>${x.quote ? `<div class="q">“${esc(x.quote)}”</div>` : ''}<div class="n" dir="auto">${esc(x.text)}</div>`).join('')}`);
    w.document.close(); w.focus(); w.print();
  };

  const Card = ({ x }: { x: Note }) => (
    <div className="nb-note">
      <div className="nb-where">{where(x)}<span>{new Date(x.updated ?? x.created).toLocaleDateString()}</span></div>
      {x.quote && <div className="nb-quote" dir="auto">“{x.quote}”</div>}
      {edit?.id === x.id ? (
        <div className="ln-edit">
          <textarea autoFocus rows={4} dir="auto" value={edit.text} onChange={(e) => setEdit({ id: x.id, text: e.target.value })} />
          <div className="ln-btns"><button className="btn" disabled={!edit.text.trim()} onClick={() => void save(x.id, edit.text)}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      ) : <Text text={x.text} onTag={(t) => { setTag(t); setView('topics'); }} />}
      <div className="nb-actions">
        {x.ref && <button className="linklike" onClick={() => onOpen(x.ref, x.n || 1)}>Open ↗</button>}
        <button className="linklike" onClick={() => setEdit({ id: x.id, text: x.text })}>Edit</button>
        <button className="linklike" onClick={() => void drop(x.id)}>Delete</button>
      </div>
    </div>
  );

  return (
    <div className="nb" role="dialog" aria-modal="true" aria-label="Notebook">
      <div className="nb-head">
        <button className="linklike" onClick={onClose}>‹ Back</button>
        <h1>Notebook</h1>
        <span className="muted">{notes ? `${notes.length} notes` : ''}</span>
      </div>
      <div className="nb-tabs">
        {([['sefer', 'By sefer'], ['topics', 'Topics'], ['newest', 'Newest']] as [View, string][]).map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => { setView(v); if (v !== 'topics') setTag(null); }}>{l}</button>)}
      </div>
      <input className="notes-search" placeholder="Search all your notes" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="nb-bar">
        {newPage === null ? <button className="btn ghost" onClick={() => setNewPage('')}>+ New page</button> : null}
        {shown.length > 0 && <><button className="linklike" onClick={() => void share()}>Share</button><button className="linklike" onClick={print}>Print</button></>}
      </div>
      {newPage !== null && (
        <div className="ln-edit">
          <textarea autoFocus rows={4} dir="auto" placeholder="A page of your own: a thought, a question for your rebbi, a chiddush… (#topic to file it)" value={newPage} onChange={(e) => setNewPage(e.target.value)} />
          <div className="ln-btns"><button className="btn" disabled={!newPage.trim()} onClick={() => void addPage()}>Save</button><button className="btn ghost" onClick={() => setNewPage(null)}>Cancel</button></div>
        </div>
      )}
      <div className="nb-body">
        {!notes ? <div className="muted">Loading…</div>
          : !notes.length ? <div className="muted nb-empty">No notes yet. Tap a line in the Sefer and “✎ Add a note”, or ✎ on any Rashi, explanation or step of the map. In a call, say “make a note: …”. Put #topic in a note to file it under that topic.</div>
          : view === 'sefer' ? books.map(([b, secs]) => (
            <div key={b} className="nb-book">
              <button className="nb-book-head" onClick={() => setOpenBook(openBook === b ? null : b)}>
                <b>{b}</b><span className="muted">{[...secs.values()].reduce((k, l) => k + l.length, 0)} {openBook === b ? '▴' : '▾'}</span>
              </button>
              {(openBook === b || q.trim() || books.length === 1) && [...secs.entries()].map(([sec, list]) => (
                <div key={sec} className="nb-sec">
                  {sec && <div className="nb-sec-head">{sec}</div>}
                  {list.map((x) => <Card key={x.id} x={x} />)}
                </div>
              ))}
            </div>
          ))
          : view === 'topics' ? (
            <>
              <div className="nb-topics">
                {topics.length ? topics.map(([t, k]) => <button key={t} className={`nb-tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t} <small>{k}</small></button>)
                  : <span className="muted">No topics yet: put #topic in a note (#kashya, #halacha, #chazara…).</span>}
              </div>
              {tag ? hits.map((x) => <Card key={x.id} x={x} />) : topics.length > 0 && <div className="muted">Choose a topic.</div>}
            </>
          )
          : [...hits].sort((a, b) => (b.updated ?? b.created).localeCompare(a.updated ?? a.created)).map((x) => <Card key={x.id} x={x} />)}
        {notes && notes.length > 0 && !hits.length && <div className="muted">No notes match.</div>}
      </div>
    </div>
  );
}
