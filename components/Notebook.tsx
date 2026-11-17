'use client';
import { VoiceRecord, VoicePlay } from './VoiceNote';
// The Notebook: every note in one place, filed three ways at once, with nothing to file by hand:
//   By sefer  — like the Library (Yoma → 6a → line 4; the note on Rashi under its line); pages of their own at the end.
//   Topics    — every #word in a note (#kashya, #halacha, #chazara…), pinned topics first.
//   Newest    — newest first.
// A search covers them all. Tap "Open" to go to the note's line. Share or print what is shown (one amud, one topic…).
import Clamp from './Clamp';
import { useEffect, useMemo, useState } from 'react';
import { SandIcon } from './SandTeal';
import { printHtml } from '@/lib/printHtml';

type Note = { id: string; ref: string; n: number; text: string; created: string; updated?: string; on?: string; quote?: string; audio?: string };
type View = 'sefer' | 'topics' | 'newest';

const tagsOf = (text: string) => [...new Set((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()))];
// "Yoma 6a" → "Yoma"; "Genesis 24" → "Genesis"; "Mishnah Yoma 1" → "Mishnah Yoma"; "Rashi on Yoma 6a" → "Yoma"
const bookOf = (ref: string) => (ref ? ref.replace(/^.* on /, '').replace(/ \d+[ab]?(:\d+)?$/, '') : 'Pages of your own');
// Notes whose words the AI wrote (What we learned, a saved chat): they say so first.
const aiNote = (x: Note) => /^what we learned|^a chat with the AI/.test(x.on ?? '');
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
  const [pageAudio, setPageAudio] = useState<string | null>(null); // a voice note recorded for a new page
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
    if (!newPage?.trim() && !pageAudio) return;
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: newPage ?? '', ...(pageAudio ? { audio: pageAudio } : {}) }) }).catch(() => null);
    setNewPage(null); setPageAudio(null); void load();
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
  // The notes as a page: for Print, and for Download as a Word file (it opens in Word, Pages and Google Docs, Hebrew
  // right to left). Notes are kept in the order shown, grouped by sefer with a heading for each.
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const pageOf = (title: string, list: Note[]) => {
    const groups = new Map<string, Note[]>();
    for (const x of list) { const b = x.ref ? bookOf(x.ref) : 'Pages of my own'; groups.set(b, [...(groups.get(b) ?? []), x]); }
    const body = [...groups].map(([b, xs]) => `<h2>${esc(b)}</h2>${xs.map((x) => `<p class="w">${esc(where(x))} · ${new Date(x.updated ?? x.created).toLocaleDateString()}</p>${aiNote(x) ? '<p class="w">Written by AI · AI makes mistakes</p>' : ''}${x.quote ? `<p class="q" dir="auto">“${esc(x.quote)}”</p>` : ''}<p class="n" dir="auto">${esc(x.text).replace(/\n/g, '<br>')}</p>`).join('')}`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12pt/1.5 Georgia,serif;max-width:680px;margin:32px auto;padding:0 16px}h1{font-weight:400}h2{font:600 14pt Georgia,serif;margin:24px 0 8px;border-bottom:1px solid #ccc}.w{color:#777;font:10pt Arial,sans-serif;margin:14px 0 2px}.q{font-style:italic;color:#555;margin:0 0 2px}.n{margin:0 0 12px}</style></head><body><h1>${esc(title)}</h1><p class="w">${list.length} notes · ${new Date().toLocaleDateString()}</p>${body}</body></html>`;
  };
  const print = () => printHtml(pageOf(titleOfShown, shown));
  const download = (all: boolean) => {
    const list = all ? (notes ?? []) : shown, title = all ? 'My Notebook' : titleOfShown;
    const blob = new Blob(['\ufeff', pageOf(title, list)], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'Notebook'} ${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const Card = ({ x }: { x: Note }) => (
    <div className="nb-note">
      <div className="nb-where">{where(x)}<span>{new Date(x.updated ?? x.created).toLocaleDateString()}</span></div>
      {aiNote(x) && <div className="ai-note left">Written by AI · AI makes mistakes</div>}
      {x.quote && <div className="nb-quote" dir="auto">“{x.quote}”</div>}
      {edit?.id === x.id ? (
        <div className="ln-edit">
          <textarea autoFocus rows={4} dir="auto" value={edit.text} onChange={(e) => setEdit({ id: x.id, text: e.target.value })} />
          <div className="ln-btns"><button className="btn" disabled={!edit.text.trim()} onClick={() => void save(x.id, edit.text)}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      ) : <Clamp text={x.text} lines={6}><Text text={x.text} onTag={(t) => { setTag(t); setView('topics'); }} /></Clamp>}
      {x.audio && <VoicePlay path={x.audio} />}
      <div className="nb-actions">
        {x.ref && <button className="linklike" onClick={() => onOpen(x.ref, x.n || 1)}>Open ↗</button>}
        <button className="linklike" onClick={() => setEdit({ id: x.id, text: x.text })}>Edit</button>
        <button className="linklike" onClick={() => void drop(x.id)}>Delete</button>
      </div>
    </div>
  );

  return (
    <div className="nb" role="dialog" aria-modal="true" aria-label="Notebook">
      <div className="nb-head nb-head2">
        <button className="nb-back" onClick={onClose} aria-label="Back"><SandIcon name="back" /></button>
        <div className="nb-title"><h1>Notebook</h1><span>{notes ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''}</span></div>
        <span className="nb-spacer" />
      </div>
      <div className="nb-tabs">
        {([['sefer', 'By sefer'], ['topics', 'Topics'], ['newest', 'Newest']] as [View, string][]).map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => { setView(v); if (v !== 'topics') setTag(null); }}>{l}</button>)}
      </div>
      <input className="notes-search" placeholder="Search all your notes" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="nb-bar">
        {newPage === null ? <button className="nb-new" onClick={() => setNewPage('')}>+ New page</button> : null}
        {shown.length > 0 && <span className="nb-acts"><button onClick={() => void share()}>Share</button><button onClick={print}>Print</button><button onClick={() => download(false)}>{notes && shown.length < notes.length ? 'Download these' : 'Download'}</button>{notes && notes.length > 0 && shown.length < notes.length && <button onClick={() => download(true)}>Download all</button>}</span>}
      </div>
      {newPage !== null && (
        <div className="ln-edit">
          <textarea autoFocus rows={4} dir="auto" placeholder="A page of your own: a thought, a question for your rebbi, a chiddush… (#topic to file it)" value={newPage} onChange={(e) => setNewPage(e.target.value)} />
          <div className="ln-btns"><button className="btn" disabled={!newPage.trim() && !pageAudio} onClick={() => void addPage()}>Save</button><VoiceRecord onDone={(a, t) => { setPageAudio(a); setNewPage((x) => ((x ?? '').trim() ? `${(x ?? '').trim()}\n` : '') + t); }} />{pageAudio && <span className="muted vn-on">🎙 Recording attached</span>}<button className="btn ghost" onClick={() => { setNewPage(null); setPageAudio(null); }}>Cancel</button></div>
        </div>
      )}
      <div className="nb-body">
        {!notes ? <div className="muted">Loading…</div>
          : !notes.length ? <div className="muted nb-empty">No notes yet. Tap a line in the Sefer and “✎ Add a note”, or ✎ on any Rashi, explanation or step of the map. In a call, say “make a note: …”. Put #topic in a note to file it under that topic.</div>
          : view === 'sefer' ? books.map(([b, secs]) => (
            <div key={b} className="nb-book">
              <button className="nb-book-head" onClick={() => setOpenBook(openBook === b ? null : b)}>
                <b>{b.replace('Berakhot', 'Berachos')}</b><span className="nb-count">{[...secs.values()].reduce((k, l) => k + l.length, 0)}<span className={`nb-chev ${openBook === b ? 'on' : ''}`} aria-hidden="true">›</span></span>
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
