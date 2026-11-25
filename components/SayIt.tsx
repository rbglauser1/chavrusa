'use client';
// Nov 23: "✦ In my words?" at the end of a line (or of each sentence, in Sentence by sentence): one tap, and the
// chavrusa says what it means and what it is doing, in its own plain words (made once and kept); under it, a box to
// ask a follow-up (and another, and another), answered right there. Settings → The AI → The ✦ and its tools, and Aa.
import { useRef, useState } from 'react';
import { isHebText } from './AiNote';
import SugyaFlow from './SugyaFlow';

type QA = { q: string; a: string | null; bad?: boolean };
// Nov 23: ✦ Go deeper, under the plain explanation: a kashya, a chakira, the halacha, the meforshim, or the wider inyan,
// each built from what Sefaria brings on this line (its meforshim and what it links to), made once and kept.
// Nov 25: Sugya chart: the steps of the sugya this line is in, as a simple chart (SugyaFlow, from the sugya map).
const DEEPER: [string, string][] = [['chart', 'Sugya chart'], ['kashya', 'Kashya'], ['challenge', 'Sharp kashya'], ['chakira', 'Chakira'], ['halacha', 'Halacha'], ['meforshim', 'Meforshim'], ['widen', 'Widen it']];
type Ex = { text?: string; sources?: string[]; err?: string; shown?: boolean };

export default function SayIt({ lineRef, piece, si }: { lineRef: string; piece?: string; si?: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [thread, setThread] = useState<QA[]>([]);
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement | null>(null);
  const [ex, setEx] = useState<Record<string, Ex>>({});
  const [exOrder, setExOrder] = useState<string[]>([]);
  const deeper = (k: string) => {
    if (ex[k]) { setExOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k])); return; }
    if (k === 'chart') { setEx((e) => ({ ...e, chart: { text: '' } })); setExOrder((o) => [...o, k]); return; }
    setEx((e) => ({ ...e, [k]: {} })); setExOrder((o) => [...o, k]);
    post({ expand: k, piece: piece ?? '', si: si ?? 0 })
      .then((d) => setEx((e) => ({ ...e, [k]: d.text ? { text: d.text, sources: d.sources ?? [] } : { err: d.error || 'It couldn’t go deeper just now.' } })))
      .catch(() => setEx((e) => ({ ...e, [k]: { err: 'It couldn’t go deeper just now.' } })));
  };
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
    const more = exOrder.map((k) => (ex[k]?.text ? `\n${DEEPER.find((d) => d[0] === k)?.[1]}: ${ex[k]!.text}` : '')).join('');
    post({ ask: qq, card: `${piece ? `The sentence: ${piece}\n` : ''}What you told him about it: ${text}${more}`, thread: before })
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
          {text && (
            <span className="sayit-deeper">
              <span className="sayit-deeper-label">✦ Go deeper</span>
              {DEEPER.map(([k, name]) => <button key={k} type="button" className={exOrder.includes(k) ? 'on' : ''} onClick={() => deeper(k)}>{name}</button>)}
            </span>
          )}
          {exOrder.map((k) => {
            if (k === 'chart') return (
              <span key={k} className="sayit-ex">
                <span className="sayit-ex-label">Sugya chart</span>
                <SugyaFlow lineRef={lineRef} />
              </span>
            );
            const e = ex[k] ?? {};
            const h = !!e.text && isHebText(e.text);
            // Sharp kashya: the kashya first; its answer waits for a tap, so he can try first.
            const cut = k === 'challenge' && e.text ? e.text.search(/\n?\s*ANSWER:/i) : -1;
            const kq = cut >= 0 ? e.text!.slice(0, cut).trim() : null;
            const ka = cut >= 0 ? e.text!.slice(cut).replace(/^\s*ANSWER:\s*/i, '').trim() : null;
            if (kq) return (
              <span key={k} className="sayit-ex">
                <span className="sayit-ex-label">Sharp kashya</span>
                <span className={`sayit-ex-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{kq}</span>
                {e.shown
                  ? <span className="sayit-ex-ans"><b>A possible answer: </b>{ka}</span>
                  : <button type="button" className="sayit-reveal" onClick={() => setEx((x) => ({ ...x, [k]: { ...x[k], shown: true } }))}>Think it over, then tap for an answer</button>}
              </span>
            );
            return (
              <span key={k} className="sayit-ex">
                <span className="sayit-ex-label">{DEEPER.find((d) => d[0] === k)?.[1]}</span>
                <span className={`sayit-ex-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{e.text ?? e.err ?? <span className="wait-dots"><span /><span /><span /></span>}</span>
                {!!e.sources?.length && <span className="sayit-ex-src">From: {e.sources.join(' · ')}</span>}
              </span>
            );
          })}
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
