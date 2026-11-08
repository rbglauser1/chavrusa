'use client';
// My Seforim (top of the Library): the learner's own texts. He adds a PDF, a Word file, a photo of a page, a text
// file, a web link or pasted text; the page turns it into text here (a typed English PDF or Word file is read
// directly, for free; a scanned or Hebrew page is read by Claude, about a cent or two a page), and the server keeps
// it (app/api/mine, lib/mine.ts). Then it opens and learns like any sefer, with the voice and the chavrusa.
import { useEffect, useRef, useState } from 'react';

type Entry = { id: string; title: string; kind: string; created: string; lines: number; parts: number };
type Draft = { title: string; kind: string; source: string; text: string; aiPages: number };

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
const MAX_PAGES = 80;

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => { loaded.delete(src); rej(new Error('Couldn’t load the reader. Check the connection.')); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src)!;
}

const hasHebrew = (s: string) => /[א-ת]/.test(s);
const baseName = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

async function ocr(image: string): Promise<string> {
  const r = await fetch('/api/mine/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'The page couldn’t be read.');
  return String(d.text ?? '');
}

// A picture made small enough to send (longest side 1800 px), as a JPEG.
async function imageToJpeg(src: CanvasImageSource & { width: number; height: number }): Promise<string> {
  const scale = Math.min(1, 1800 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// Runs jobs a couple at a time, in order.
async function inTurn<T>(n: number, each: (i: number) => Promise<T>, width = 2): Promise<T[]> {
  const out: T[] = new Array(n);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, n) }, async () => { while (next < n) { const i = next++; out[i] = await each(i); } }));
  return out;
}

async function readPdf(file: File, say: (s: string) => void): Promise<{ text: string; aiPages: number }> {
  await loadScript(PDFJS);
  const lib = (window as any).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  let done = 0, aiPages = 0;
  const texts = await inTurn(pages, async (i) => {
    const page = await pdf.getPage(i + 1);
    const tc = await page.getTextContent();
    let t = '';
    for (const it of tc.items as { str: string; hasEOL?: boolean }[]) t += it.str + (it.hasEOL ? '\n' : '');
    t = t.replace(/[ \t]+\n/g, '\n').trim();
    // A typed page in English is read as it is; a scanned page, or one with Hebrew (whose letters a PDF often keeps
    // in the wrong order), is read by Claude from a picture of the page.
    let out = t;
    if (t.length < 40 || hasHebrew(t)) {
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 1800 / Math.max(vp.width, vp.height));
      const v2 = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.round(v2.width); c.height = Math.round(v2.height);
      await page.render({ canvasContext: c.getContext('2d')!, viewport: v2 }).promise;
      out = await ocr(c.toDataURL('image/jpeg', 0.85));
      aiPages++;
    }
    say(`Reading page ${++done} of ${pages}…`);
    return out;
  });
  return { text: texts.filter(Boolean).join('\n\n'), aiPages };
}

async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('That picture couldn’t be opened.')); img.src = url; });
    return await ocr(await imageToJpeg(img));
  } finally { URL.revokeObjectURL(url); }
}

export default function MySeforim({ onOpen, busy }: { onOpen: (ref: string) => void; busy: boolean }) {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'file' | 'link' | 'paste'>('file');
  const [link, setLink] = useState('');
  const [paste, setPaste] = useState('');
  const [work, setWork] = useState('');
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/mine').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  async function fromFile(f: File) {
    setErr(''); setDraft(null);
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith('.pdf') || f.type === 'application/pdf') {
        setWork('Opening the PDF…');
        const r = await readPdf(f, setWork);
        setDraft({ title: baseName(f.name), kind: 'pdf', source: f.name, text: r.text, aiPages: r.aiPages });
      } else if (name.endsWith('.docx')) {
        setWork('Reading the Word file…');
        await loadScript(MAMMOTH);
        const r = await (window as any).mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
        setDraft({ title: baseName(f.name), kind: 'word', source: f.name, text: String(r.value ?? ''), aiPages: 0 });
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/.test(name)) {
        setWork('Reading the page…');
        setDraft({ title: baseName(f.name), kind: 'photo', source: f.name, text: await readImage(f), aiPages: 1 });
      } else if (/\.(txt|md|text)$/.test(name) || f.type.startsWith('text/')) {
        setDraft({ title: baseName(f.name), kind: 'text', source: f.name, text: await f.text(), aiPages: 0 });
      } else {
        throw new Error('That kind of file can’t be read yet. A PDF, a Word file (.docx), a photo or a text file works.');
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setWork(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function fromLink() {
    setErr(''); setDraft(null); setWork('Opening the page…');
    try {
      const r = await fetch('/api/mine/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'That page couldn’t be opened.');
      setDraft({ title: d.title ?? link, kind: 'link', source: link.trim(), text: d.text, aiPages: 0 });
    } catch (e) { setErr((e as Error).message); }
    finally { setWork(''); }
  }

  async function keep() {
    if (!draft) return;
    setWork('Keeping it…'); setErr('');
    try {
      const r = await fetch('/api/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'It couldn’t be kept.');
      setDraft(null); setAdding(false); setLink(''); setPaste('');
      await load();
      onOpen(`Mine ${d.item.id} 1`);
    } catch (e) { setErr((e as Error).message); }
    finally { setWork(''); }
  }

  async function remove(e: Entry) {
    if (!window.confirm(`Remove “${e.title}” from My Seforim?`)) return;
    await fetch(`/api/mine?id=${e.id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  const preview = draft ? draft.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 3) : [];

  return (
    <div className="mine">
      <div className="lib-recent-head">
        <span className="muted lib-hint">My Seforim</span>
        {!adding && <button className="clear-all" onClick={() => { setAdding(true); setErr(''); }}>+ Add</button>}
      </div>

      {items?.map((e) => (
        <div key={e.id} className="mine-row">
          <button className="lib-item book" disabled={busy} onClick={() => onOpen(`Mine ${e.id} 1`)}>
            <span className="en" dir="auto">{e.title}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{e.parts > 1 ? `${e.parts} parts` : `${e.lines} lines`}</span>
          </button>
          <button className="mine-x" onClick={() => remove(e)} aria-label={`Remove ${e.title}`}>×</button>
        </div>
      ))}
      {items && !items.length && !adding && <div className="muted mine-empty">Your own texts: a PDF, a Word file, a photo of a page, a web page. Tap “+ Add”.</div>}

      {adding && (
        <div className="mine-add">
          <div className="mine-tabs">
            {(['file', 'link', 'paste'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setDraft(null); setErr(''); }}>
                {m === 'file' ? 'A file or photo' : m === 'link' ? 'A web link' : 'Paste text'}
              </button>
            ))}
          </div>

          {!draft && mode === 'file' && (
            <>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); }} />
              <button className="btn" disabled={!!work} onClick={() => fileRef.current?.click()}>Choose a file or photo</button>
              <div className="muted mine-note">PDF, Word (.docx), a photo of a page, or a text file. A scanned page, or one in Hebrew, is read by the AI: about a cent or two a page.</div>
            </>
          )}
          {!draft && mode === 'link' && (
            <div className="mine-line">
              <input type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
              <button className="btn" disabled={!!work || !link.trim()} onClick={fromLink}>Get it</button>
            </div>
          )}
          {!draft && mode === 'paste' && (
            <>
              <textarea rows={6} dir="auto" placeholder="Paste the text here" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button className="btn" disabled={!paste.trim()} onClick={() => setDraft({ title: paste.trim().split('\n')[0].slice(0, 60), kind: 'pasted', source: 'pasted', text: paste, aiPages: 0 })}>Next</button>
            </>
          )}

          {work && <div className="muted mine-note">{work}</div>}
          {err && <div className="goto-msg">{err}</div>}

          {draft && (
            <div className="mine-draft">
              <label className="muted mine-note">Its name</label>
              <input value={draft.title} dir="auto" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <div className="mine-preview" dir="auto">{preview.map((p, i) => <p key={i}>{p.length > 220 ? `${p.slice(0, 220)}…` : p}</p>)}</div>
              <div className="muted mine-note">
                {draft.text.length.toLocaleString()} characters{draft.aiPages ? ` · ${draft.aiPages} page${draft.aiPages > 1 ? 's' : ''} read by the AI` : ''}
              </div>
              <div className="mine-line">
                <button className="btn" disabled={!!work || !draft.text.trim()} onClick={keep}>Keep it and open</button>
                <button className="btn ghost" onClick={() => setDraft(null)}>Back</button>
              </div>
            </div>
          )}

          {!draft && <button className="clear-all" style={{ marginTop: 8 }} onClick={() => { setAdding(false); setErr(''); }}>Cancel</button>}
        </div>
      )}
    </div>
  );
}
