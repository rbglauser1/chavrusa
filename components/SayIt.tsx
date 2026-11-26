'use client';
// Nov 26: one ✦ button at the end of the line opens all the choices: In my words (first), Pshat, Sugya chart, and the
// Go deeper ones (Kashya, Sharp kashya, Chakira, Halacha, Meforshim, Rashi vs Tosafos, My reading vs Rashi, Widen it).
// Each choice opens its own box under the line; the follow-up box answers on whatever is open.
// Nov 23: "✦ In my words?" at the end of a line (or of each sentence, in Sentence by sentence): one tap, and the
// chavrusa says what it means and what it is doing, in its own plain words (made once and kept); under it, a box to
// ask a follow-up (and another, and another), answered right there. Settings → The AI → The ✦ and its tools, and Aa.
import { useEffect, useRef, useState } from 'react';
import { isHebText } from './AiNote';
import SugyaFlow from './SugyaFlow';

type QA = { q: string; a: string | null; bad?: boolean };
// Nov 23: ✦ Go deeper, under the plain explanation: a kashya, a chakira, the halacha, the meforshim, or the wider inyan,
// each built from what Sefaria brings on this line (its meforshim and what it links to), made once and kept.
const DEEPER: [string, string][] = [['kashya', 'Kashya'], ['challenge', 'Sharp kashya'], ['chakira', 'Chakira'], ['halacha', 'Halacha'], ['meforshim', 'Meforshim'], ['rashitos', 'Rashi vs Tosafos'], ['compare', 'My reading vs Rashi'], ['widen', 'Widen it']]; // Nov 25: Rashi vs Tosafos side by side; Prepare, then compare
type Ex = { text?: string; sources?: string[]; err?: string; shown?: boolean; draft?: string; wait?: boolean };

export default function SayIt({ lineRef, piece, si, noChart, pshat, shown, wholeToo }: { lineRef: string; piece?: string; si?: number; noChart?: boolean; pshat?: string[]; shown?: boolean; wholeToo?: boolean }) {
  // Nov 26: in Sentence by sentence, the last sentence also offers the whole line's In my words: the same one made
  // (and kept) when the English is shown alone, so switching views shows what was already made.
  const [whole, setWhole] = useState<string | null | 'wait' | 'err'>(null);
  const [wholeOpen, setWholeOpen] = useState(false);
  const [menu, setMenu] = useState(!!shown); // Nov 26: shown already when Aa → ✦ choices is Always shown
  useEffect(() => setMenu(!!shown), [shown]); // Nov 26: the ✦ that opens the choices
  const [showPshat, setShowPshat] = useState(false);
  const [open, setOpen] = useState(false);
  const [chart, setChart] = useState(false); // Nov 25: ✦ Sugya chart, beside In my words
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [thread, setThread] = useState<QA[]>([]);
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement | null>(null);
  const [ex, setEx] = useState<Record<string, Ex>>({});
  const [exOrder, setExOrder] = useState<string[]>([]);
  const deeper = (k: string) => {
    if (ex[k]) { setExOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k])); return; }
    if (k === 'compare') { setEx((e) => ({ ...e, compare: { draft: '' } })); setExOrder((o) => [...o, k]); return; } // he writes his reading first
    setEx((e) => ({ ...e, [k]: {} })); setExOrder((o) => [...o, k]);
    post({ expand: k, piece: piece ?? '', si: si ?? 0 })
      .then((d) => setEx((e) => ({ ...e, [k]: d.text ? { text: d.text, sources: d.sources ?? [] } : { err: d.error || 'It couldn’t go deeper just now.' } })))
      .catch(() => setEx((e) => ({ ...e, [k]: { err: 'It couldn’t go deeper just now.' } })));
  };
  const compareNow = () => {
    const mine = ex.compare?.draft?.trim(); if (!mine) return;
    setEx((e) => ({ ...e, compare: { ...e.compare, wait: true } }));
    post({ compare: mine })
      .then((d) => setEx((e) => ({ ...e, compare: d.text ? { text: d.text, draft: mine } : { err: d.error || 'It couldn’t compare just now.', draft: mine } })))
      .catch(() => setEx((e) => ({ ...e, compare: { err: 'It couldn’t compare just now.', draft: mine } })));
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
  const anyText = (open && !!text) || exOrder.some((k) => !!ex[k]?.text);
  const goWhole = () => {
    setWholeOpen((v) => !v);
    if (whole && whole !== 'err') return;
    setWhole('wait');
    post({ say: true, piece: '', si: 0 }).then((d) => setWhole(d.text || 'err')).catch(() => setWhole('err'));
  };
  const ask = () => {
    const qq = q.trim(); if (!qq || !anyText) return;
    const before = thread.filter((x) => x.a && !x.bad).map((x) => ({ q: x.q, a: x.a as string }));
    setThread((t) => [...t, { q: qq, a: null }]); setQ('');
    const put = (a: string, bad = false) => setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a, bad } : x)));
    const more = exOrder.map((k) => (ex[k]?.text ? `\n${DEEPER.find((d) => d[0] === k)?.[1]}: ${ex[k]!.text}` : '')).join('');
    post({ ask: qq, card: `${piece ? `The sentence: ${piece}\n` : ''}${text ? `What you told him about it: ${text}` : ''}${more}`, thread: before })
      .then((d) => (d.text ? put(d.text) : put(d.error || 'It couldn’t answer just now.', true)))
      .catch(() => put('It couldn’t answer just now.', true));
  };
  const he = !!text && isHebText(text);
  return (
    <span className="sayit" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`sayit-btn sayit-main ${menu ? 'on' : ''}`} onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="AI help on this line">✦{menu ? ' ▴' : ' ▾'}</button>
      {menu && (
        <span className="sayit-menu">
          <button type="button" className={open ? 'on' : ''} onClick={go}>In my words</button>
          {wholeToo && <button type="button" className={wholeOpen ? 'on' : ''} onClick={goWhole}>Whole line in my words</button>}
          {!!pshat?.length && <button type="button" className={showPshat ? 'on' : ''} onClick={() => setShowPshat((v) => !v)}>Pshat</button>}
          {!noChart && <button type="button" className={chart ? 'on' : ''} onClick={() => setChart((v) => !v)}>Sugya chart</button>}
          {DEEPER.map(([k, name]) => <button key={k} type="button" className={exOrder.includes(k) ? 'on' : ''} onClick={() => deeper(k)}>{name}</button>)}
        </span>
      )}
      {open && (
        <span className="sayit-box" role="region" aria-label="In my words">
          <span className="sayit-ex-label">In my words</span>
          <span className={`sayit-text ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>
            {text ?? (err || <span className="wait-dots"><span /><span /><span /></span>)}
          </span>
        </span>
      )}
      {wholeOpen && whole && (
        <span className="sayit-box" role="region" aria-label="The whole line in my words">
          <span className="sayit-ex-label">The whole line in my words</span>
          {(() => { const h = typeof whole === 'string' && whole !== 'wait' && whole !== 'err' && isHebText(whole); return <span className={`sayit-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{whole === 'wait' ? <span className="wait-dots"><span /><span /><span /></span> : whole === 'err' ? 'It couldn’t explain just now.' : whole}</span>; })()}
        </span>
      )}
      {showPshat && !!pshat?.length && (
        <span className="sayit-box" role="region" aria-label="Pshat">
          <span className="sayit-ex-label">Pshat</span>
          {pshat.map((t, k) => { const h = isHebText(t); return <span key={k} className={`pshat ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{t}</span>; })}
        </span>
      )}
      {chart && (
        <span className="sayit-box" role="region" aria-label="Sugya chart">
          <SugyaFlow lineRef={lineRef} />
        </span>
      )}
      {(exOrder.length > 0 || thread.length > 0 || anyText) && (
        <span className="sayit-box sayit-more" role="region" aria-label="Go deeper">
          {exOrder.map((k) => {
            const e = ex[k] ?? {};
            if (k === 'compare' && !e.text && !e.err) return (
              <span key={k} className="sayit-ex">
                <span className="sayit-ex-label">My reading vs Rashi</span>
                <form className="sayit-ask sayit-mine" onSubmit={(ev) => { ev.preventDefault(); compareNow(); }}>
                  <textarea value={e.draft ?? ''} onChange={(ev) => setEx((x) => ({ ...x, compare: { ...x.compare, draft: ev.target.value } }))} placeholder="How do you read this line? Work it out yourself, then compare with Rashi." rows={3} dir="auto" disabled={e.wait} />
                  <button type="submit" disabled={!e.draft?.trim() || e.wait}>{e.wait ? '…' : 'Compare'}</button>
                </form>
              </span>
            );
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
                <span className={`sayit-ex-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{e.text
                  ? (k === 'rashitos' ? e.text.split('\n').filter((l) => l.trim()).map((l, i) => { const mm = l.match(/^([^:]{2,30}):\s*(.*)$/); return <span key={i} className="sayit-rt">{mm ? <><b>{mm[1]}</b>{mm[2]}</> : l}</span>; }) : e.text)
                  : e.err ?? <span className="wait-dots"><span /><span /><span /></span>}</span>
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
          {anyText && (
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
