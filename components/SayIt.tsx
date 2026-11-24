'use client';
// Nov 23: "✦ In my words?" at the end of a line (or of each sentence, in Sentence by sentence): one tap, and the
// chavrusa says what it means and what it is doing, in its own plain words (made once and kept); under it, a box to
// ask a follow-up (and another, and another), answered right there. Settings → The AI → The ✦ and its tools, and Aa.
import { useRef, useState } from 'react';
import { isHebText } from './AiNote';

type QA = { q: string; a: string | null; bad?: boolean };

export default function SayIt({ lineRef, piece, si }: { lineRef: string; piece?: string; si?: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [thread, setThread] = useState<QA[]>([]);
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement | null>(null);
  const post = (body: object) => fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: lineRef, ...body }) }).then((r) => r.json());
  const go = () => {
    setOpen((v) => !v);
    if (open || text) return;
    setErr('');
    post({ say: true, piece: piece ?? '', si: si ?? 0 })
      .then((d) => (d.text ? setText(d.text) : setErr(d.error || 'It couldn’t explain just now.')))
      .catch(() => setErr('It couldn’t explain just now.'));
  };
  const ask = () => {
    const qq = q.trim(); if (!qq || !text) return;
    const before = thread.filter((x) => x.a && !x.bad).map((x) => ({ q: x.q, a: x.a as string }));
    setThread((t) => [...t, { q: qq, a: null }]); setQ('');
    const put = (a: string, bad = false) => setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a, bad } : x)));
    post({ ask: qq, card: `${piece ? `The sentence: ${piece}\n` : ''}What you told him about it: ${text}`, thread: before })
      .then((d) => (d.text ? put(d.text) : put(d.error || 'It couldn’t answer just now.', true)))
      .catch(() => put('It couldn’t answer just now.', true));
  };
  const he = !!text && isHebText(text);
  return (
    <span className="sayit" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`sayit-btn ${open ? 'on' : ''}`} onClick={go} aria-expanded={open}>✦ {open ? 'Close' : 'In my words?'}</button>
      {open && (
        <span className="sayit-box" role="region" aria-label="In my words">
          <span className={`sayit-text ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>
            {text ?? (err || <span className="wait-dots"><span /><span /><span /></span>)}
          </span>
          {thread.map((x, i) => {
            const h = !!x.a && isHebText(x.a);
            return (
              <span key={i} className="sayit-qa">
                <span className="sayit-q" dir="auto">{x.q}</span>
                <span className={`sayit-a ${x.bad ? 'bad' : ''} ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{x.a ?? <span className="wait-dots"><span /><span /><span /></span>}</span>
              </span>
            );
          })}
          {text && (
            <form className="sayit-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={thread.length ? 'Ask another…' : 'Ask a follow-up…'} enterKeyHint="send" dir="auto" />
              <button type="submit" disabled={!q.trim()}>Ask</button>
            </form>
          )}
        </span>
      )}
    </span>
  );
}
