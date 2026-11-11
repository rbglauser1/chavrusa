'use client';
// "Chat" on a line (Settings → Extras → Chat on each line): a written chat with the AI about this one line, right
// under it. Each answer has "Save" (to the Notebook, on this line); "Save the chat" saves the whole conversation as one
// note. The chat stays on this device for the line (closing it doesn't lose it); "Clear" starts over.
import { useEffect, useRef, useState } from 'react';
import { WithSources } from './LineExtras';
import { notesChanged } from './NoteAdd';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: string[]; saved?: boolean };
const KEY = (r: string) => `chavrusa-linechat:${r}`;
const split = (r: string): [string, number] => { const m = r.match(/^(.*?):(\d+)$/); return m ? [m[1], Number(m[2])] : [r, 1]; };
const plain = (t: string) => t.replace(/⟦([^⟧]+)⟧/g, '$1');
const STARTERS = ['What is this line saying?', 'Why is this line needed here?', 'What does Rashi add?', 'Is there a halacha from this?'];

export default function LineChat({ lineRef, onClose }: { lineRef: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(KEY(lineRef)) ?? '[]'); } catch { return []; } });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedAll, setSavedAll] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { if (msgs.length) localStorage.setItem(KEY(lineRef), JSON.stringify(msgs.slice(-40))); else localStorage.removeItem(KEY(lineRef)); } catch { /* optional */ } }, [msgs, lineRef]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msgs.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setDraft(''); setBusy(true); setErr(''); setSavedAll(false);
    try {
      const r = await fetch('/api/linechat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: lineRef, messages: next.map(({ role, content }) => ({ role, content })) }) });
      const d = await r.json();
      if (!d.text) throw new Error(d.error || 'No answer came back.');
      setMsgs((m) => [...m, { role: 'assistant', content: d.text, sources: Array.isArray(d.sources) ? d.sources : [] }]);
    } catch (e) { setErr((e as Error).message || 'Couldn’t answer just now.'); }
    finally { setBusy(false); }
  }
  async function save(text: string, quote?: string) {
    const [ref, n] = split(lineRef);
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, n, text, on: 'a chat with the AI', ...(quote ? { quote } : {}) }) });
    if (r.ok) notesChanged();
    return r.ok;
  }
  async function saveOne(k: number) {
    const a = msgs[k], q = [...msgs.slice(0, k)].reverse().find((m) => m.role === 'user');
    if (await save(plain(a.content), q?.content.slice(0, 160))) setMsgs((m) => m.map((x, j) => (j === k ? { ...x, saved: true } : x)));
  }
  async function saveAll() {
    const text = msgs.map((m) => `${m.role === 'user' ? 'Me' : 'AI'}: ${plain(m.content)}`).join('\n\n');
    if (await save(text)) setSavedAll(true);
  }

  return (
    <div className="comm line-x lchat" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">✦ Chat about this line
        {msgs.some((m) => m.role === 'assistant') && <button className="lchat-save" onClick={() => void saveAll()} disabled={savedAll}>{savedAll ? '✓ Saved to Notebook' : 'Save the chat'}</button>}
        <button className="comm-x" aria-label="Close the chat" onClick={onClose}>✕</button>
      </div>
      <div className="ai-note left">Written by AI · may contain mistakes · ask your rav for halacha</div>
      {!msgs.length && (
        <div className="lchat-starters">{STARTERS.map((s) => <button key={s} onClick={() => void send(s)}>{s}</button>)}</div>
      )}
      <div className="lchat-list">
        {msgs.map((m, k) => m.role === 'user'
          ? <div key={k} className="lchat-me">{m.content}</div>
          : (
            <div key={k} className="lchat-ai">
              <WithSources text={m.content} sources={m.sources ?? []} />
              <button className="lchat-keep" onClick={() => void saveOne(k)} disabled={m.saved}>{m.saved ? '✓ Saved' : '✎ Save to Notebook'}</button>
            </div>
          ))}
        {busy && <div className="muted lchat-wait">Thinking…</div>}
        {err && <div className="muted">{err} <button className="linklike" onClick={() => { const last = msgs[msgs.length - 1]; if (last?.role === 'user') { setMsgs(msgs.slice(0, -1)); void send(last.content); } }}>Try again</button></div>}
        <div ref={endRef} />
      </div>
      <form className="lchat-form" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <textarea value={draft} rows={1} placeholder="Ask about this line…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }} />
        <button type="submit" className="btn primary" disabled={busy || !draft.trim()}>Send</button>
      </form>
      {msgs.length > 0 && <button className="linklike lchat-clear" onClick={() => { setMsgs([]); setErr(''); setSavedAll(false); }}>Clear this chat</button>}
    </div>
  );
}
