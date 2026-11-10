'use client';
// Settings → Extras → My buttons: the learner makes his own AI buttons, like his own learning style. Each has a name,
// what it should do (in his own words), where it shows (on each line, or once at the top of each amud / perek) and
// what it may read (the line, the whole amud, or the whole library). The app's rules always come first
// (app/api/mybutton). Start from an example, or from nothing.
import { useState } from 'react';
import type { MyButton } from '@/lib/config';

export const EXAMPLES: Omit<MyButton, 'id'>[] = [
  { name: 'Explain it simply', where: 'line', reach: 'line', prompt: 'Explain this line very simply, as if to a beginner, in two or three sentences.' },
  { name: 'What’s the chiddush?', where: 'line', reach: 'amud', prompt: 'What is new in this line compared with what came before it? Say it in two or three sentences.' },
  { name: 'The mussar here', where: 'line', reach: 'library', prompt: 'What lesson for life and avodas Hashem do the meforshim and the baalei mussar draw from this line? Only from sources you actually read.' },
  { name: 'In Yiddish', where: 'line', reach: 'line', prompt: 'Translate this line into simple Yiddish, phrase by phrase, the way a melamed teaches it.' },
  { name: 'Remazim and gematria', where: 'line', reach: 'library', prompt: 'Bring any remez or gematria on the words of this line that the meforshim bring. Only from sources you actually read; if there are none, say so.' },
  { name: 'Shiur outline', where: 'amud', reach: 'amud', prompt: 'Make a short outline for giving a shiur on this amud: the main questions, the answers, and one point to discuss.' },
];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function Editor({ b, onSave, onCancel }: { b: MyButton; onSave: (b: MyButton) => void; onCancel: () => void }) {
  const [x, setX] = useState<MyButton>(b);
  return (
    <div className="mb-edit">
      <label>Name<input value={x.name} maxLength={30} onChange={(e) => setX({ ...x, name: e.target.value })} placeholder="What the button says" /></label>
      <label>What it should do<textarea rows={4} dir="auto" value={x.prompt} maxLength={1500} onChange={(e) => setX({ ...x, prompt: e.target.value })} placeholder="In your own words, e.g. “Show me where this line is ruled in halacha, and how.”" /></label>
      <label>Where it shows
        <select value={x.where} onChange={(e) => setX({ ...x, where: e.target.value as MyButton['where'] })}>
          <option value="line">On each line, next to Explain</option>
          <option value="amud">Once, at the top of each amud or perek</option>
        </select>
      </label>
      <label>What it may read
        <select value={x.reach} onChange={(e) => setX({ ...x, reach: e.target.value as MyButton['reach'] })}>
          {x.where === 'line' && <option value="line">Just the line (cheapest)</option>}
          <option value="amud">The whole amud or perek</option>
          <option value="library">The whole library (it looks things up; costs more)</option>
        </select>
      </label>
      <div className="ln-btns"><button className="btn" disabled={!x.name.trim() || !x.prompt.trim()} onClick={() => onSave({ ...x, name: x.name.trim(), prompt: x.prompt.trim(), reach: x.where === 'amud' && x.reach === 'line' ? 'amud' : x.reach })}>Save</button><button className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

export default function MyButtons({ list, onChange }: { list: MyButton[]; onChange: (l: MyButton[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null); // a button's id, or 'new'
  const [draft, setDraft] = useState<MyButton | null>(null);
  const [showEx, setShowEx] = useState(false);
  const move = (i: number, d: number) => { const l = [...list]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; onChange(l); };
  const where = (b: MyButton) => `${b.where === 'line' ? 'on each line' : 'top of each amud'} · reads ${b.reach === 'line' ? 'the line' : b.reach === 'amud' ? 'the amud' : 'the library'}`;
  return (
    <div className="field mb">
      <label>My buttons</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Your own AI buttons, shown next to Explain (or at the top of the amud). Each answer is made once per place and kept; it is written by AI and may contain mistakes. The app’s rules always come first: Orthodox sources only, and never a ruling for practice.</div>
      {list.map((b, i) => (editing === b.id ? (
        <Editor key={b.id} b={b} onCancel={() => setEditing(null)} onSave={(nb) => { onChange(list.map((x) => (x.id === b.id ? nb : x))); setEditing(null); }} />
      ) : (
        <div key={b.id} className={`mb-row ${b.off ? 'off' : ''}`}>
          <div className="mb-name"><b>✦ {b.name}</b><small className="muted">{where(b)}</small></div>
          <div className="mb-acts">
            <button className="linklike" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
            <button className="linklike" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
            <button className="linklike" onClick={() => onChange(list.map((x) => (x.id === b.id ? { ...x, off: !x.off } : x)))}>{b.off ? 'Show' : 'Hide'}</button>
            <button className="linklike" onClick={() => setEditing(b.id)}>Edit</button>
            <button className="linklike" onClick={() => { if (window.confirm(`Delete “${b.name}”?`)) onChange(list.filter((x) => x.id !== b.id)); }}>Delete</button>
          </div>
        </div>
      )))}
      {editing === 'new' && draft
        ? <Editor b={draft} onCancel={() => { setEditing(null); setDraft(null); }} onSave={(nb) => { onChange([...list, nb]); setEditing(null); setDraft(null); }} />
        : (
          <div className="mb-add">
            <button className="btn ghost" onClick={() => { setDraft({ id: newId(), name: '', prompt: '', where: 'line', reach: 'line' }); setEditing('new'); }}>+ New button</button>
            <button className="linklike" onClick={() => setShowEx((v) => !v)}>{showEx ? 'Hide the examples' : 'Start from an example'}</button>
          </div>
        )}
      {showEx && editing !== 'new' && (
        <div className="mb-ex">
          {EXAMPLES.map((e) => (
            <button key={e.name} className="mb-ex-item" onClick={() => { setDraft({ ...e, id: newId() }); setEditing('new'); setShowEx(false); }}>
              <b>✦ {e.name}</b><span className="muted">{e.prompt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
