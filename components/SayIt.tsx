'use client';
// Nov 26: one ✦ button at the end of the line opens all the choices: In my words (first), Pshat, Sugya chart, and the
// Go deeper ones (Kashya, Sharp kashya, Chakira, Halacha, Meforshim, Rashi vs Tosafos, My reading vs Rashi, Widen it).
// Each choice opens its own box under the line; the follow-up box answers on whatever is open.
// Nov 23: "✦ In my words?" at the end of a line (or of each sentence, in Sentence by sentence): one tap, and the
// chavrusa says what it means and what it is doing, in its own plain words (made once and kept); under it, a box to
// ask a follow-up (and another, and another), answered right there. Settings → The AI → The ✦ and its tools, and Aa.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isHebText } from './AiNote';
import SugyaFlow from './SugyaFlow';
import { useKept, wasKept } from '@/lib/uiKeep';
import { SAY_GROUPS, SAY_ITEMS, lastUsed, noteUse, useSayPrefs, type SayGroup } from '@/lib/sayPrefs';

type QA = { q: string; a: string | null; bad?: boolean };
// Nov 27: a choice that opens a box elsewhere on the line (Where it goes, By heart…): the box is brought to the place he
// tapped, so it opens right there and he doesn't scroll for it.
function runHere(ev: { currentTarget: HTMLElement }, run: () => void) {
  const btn = ev.currentTarget, line = btn.closest<HTMLElement>('[data-line]');
  const y0 = btn.getBoundingClientRect().bottom;
  const before = new Set<Element>(line ? Array.from(line.querySelectorAll('*')) : []);
  run();
  if (!line) return;
  const scroller = (el: HTMLElement | null): HTMLElement => {
    for (let p = el?.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; }
    return (document.scrollingElement as HTMLElement) ?? document.documentElement;
  };
  const bring = () => {
    const fresh = Array.from(line.querySelectorAll<HTMLElement>('*')).find((e) => !before.has(e) && (!e.parentElement || before.has(e.parentElement)) && e.getBoundingClientRect().height > 20);
    if (!fresh) return;
    const d = fresh.getBoundingClientRect().top - (y0 + 8);
    if (Math.abs(d) > 12) scroller(line).scrollBy({ top: d, behavior: 'smooth' });
  };
  window.setTimeout(bring, 220); window.setTimeout(bring, 650);
}
const MAPRE = /Sugya map|Perek map/;
// Nov 23: ✦ Go deeper, under the plain explanation: a kashya, a chakira, the halacha, the meforshim, or the wider inyan,
// each built from what Sefaria brings on this line (its meforshim and what it links to), made once and kept.
const DEEPER: [string, string][] = [['kashya', 'Kashya'], ['challenge', 'Sharp kashya'], ['chakira', 'Chakira'], ['halacha', 'Halacha'], ['meforshim', 'Meforshim'], ['rashitos', 'Rashi vs Tosafos'], ['compare', 'My reading vs Rashi'], ['widen', 'Widen it']]; // Nov 25: Rashi vs Tosafos side by side; Prepare, then compare
type Ex = { text?: string; sources?: string[]; err?: string; shown?: boolean; draft?: string; wait?: boolean };

// Nov 27: the terracotta ✦ is gone; what it had that the line's ✦ didn't comes here: for the line (Learn with me from
// here, Where it goes, By heart, Where was I?, Sit with me) and for the page (Sugya map, Ask about the whole page,
// Review, Listen, Source sheet, your own buttons). Given by the reader (SeferPanel), only on the line's last ✦.
export type MoreActs = { line: { label: string; run: () => void }[]; page: { label: string; run: () => void }[] };
export default function SayIt({ lineRef, piece, si, pshat, shown, wholeToo, more: acts, bp }: { lineRef: string; piece?: string; si?: number; noChart?: boolean; pshat?: string[]; shown?: boolean; wholeToo?: boolean; more?: () => MoreActs; bp?: () => ReactNode }) {
  // Nov 27: every choice on every ✦, and the repeats folded together: Whole line is inside In my words; Sharp kashya
  // inside Kashya; Rashi vs Tosafos inside Meforshim; the Sugya map inside the Sugya chart; one Big picture (read,
  // hear, talk) instead of two buttons under the line.
  const [bpOpen, setBpOpen] = useKept(`say:${lineRef}:${si ?? 0}:bp`, false);
  // Nov 26: in Sentence by sentence, the last sentence also offers the whole line's In my words: the same one made
  // (and kept) when the English is shown alone, so switching views shows what was already made.
  const K = `say:${lineRef}:${si ?? 0}`; // Nov 26: what's open here, and what came back, stays when he goes to Settings and back
  const [whole, setWhole] = useKept<string | null | 'wait' | 'err'>(`${K}:whole`, null);
  const [wholeOpen, setWholeOpen] = useKept(`${K}:wholeOpen`, false);
  // Nov 26: ✦ Simple: the move at its most basic, in the larger picture of the sugya (made once and kept).
  const [simple, setSimple] = useKept<string | null | 'wait' | 'err'>(`${K}:simple`, null);
  const [simpleOpen, setSimpleOpen] = useKept(`${K}:simpleOpen`, false);
  const [menu, setMenu] = useKept(`${K}:menu`, !!shown); // Nov 26: shown already when Aa → ✦ choices is Always shown
  const shownBefore = useRef(shown);
  useEffect(() => { if (shownBefore.current !== shown) { shownBefore.current = shown; setMenu(!!shown); } else if (!wasKept(`${K}:menu`) && shown) setMenu(true); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps // Nov 26: the ✦ that opens the choices
  const [showPshat, setShowPshat] = useKept(`${K}:showPshat`, false);
  const prefs = useSayPrefs();
  const usedAt = useRef<Record<string, number>>({}); // the order under each heading, read when the menu opens (so nothing jumps under the finger)
  useEffect(() => { if (menu) usedAt.current = lastUsed(); }, [menu]);
  const [open, setOpen] = useKept(`${K}:open`, false);
  const [askOpen, setAskOpen] = useKept(`${K}:ask`, false); // Nov 26: ✦ Ask: his own question on the line, in his own words
  const [chart, setChart] = useKept(`${K}:chart`, false); // Nov 25: ✦ Sugya chart, beside In my words
  const [text, setText] = useKept<string | null>(`${K}:text`, null);
  const [err, setErr] = useState('');
  const [thread, setThread] = useKept<QA[]>(`${K}:thread`, []);
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement | null>(null);
  const [ex, setEx] = useKept<Record<string, Ex>>(`${K}:ex`, {});
  const [exOrder, setExOrder] = useKept<string[]>(`${K}:exOrder`, []);
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
  const anyText = (open && !!text) || (simpleOpen && !!simple && simple !== 'wait' && simple !== 'err') || exOrder.some((k) => !!ex[k]?.text);
  // Nov 26: coming back (from Settings, or a redraw): anything that was still on its way when he left is asked for again
  // (it was kept on the server, so it comes right back).
  useEffect(() => {
    if (open && !text) post({ say: true, piece: piece ?? '', si: si ?? 0 }).then((d) => (d.text ? setText(d.text) : setErr(d.error || 'It couldn’t explain just now.'))).catch(() => setErr('It couldn’t explain just now.'));
    if (simpleOpen && (simple === 'wait' || simple === null)) { setSimple('wait'); post({ simple: true, piece: piece ?? '', si: si ?? 0 }).then((d) => setSimple(d.text || 'err')).catch(() => setSimple('err')); }
    if (wholeOpen && (whole === 'wait' || whole === null)) { setWhole('wait'); post({ say: true, piece: '', si: 0 }).then((d) => setWhole(d.text || 'err')).catch(() => setWhole('err')); }
    exOrder.forEach((k) => {
      const e = ex[k];
      if (!e || e.text || e.err || k === 'compare') return;
      post({ expand: k, piece: piece ?? '', si: si ?? 0 })
        .then((d) => setEx((x) => ({ ...x, [k]: d.text ? { text: d.text, sources: d.sources ?? [] } : { err: d.error || 'It couldn’t go deeper just now.' } })))
        .catch(() => setEx((x) => ({ ...x, [k]: { err: 'It couldn’t go deeper just now.' } })));
    });
    if (ex.compare?.wait) setEx((x) => ({ ...x, compare: { ...x.compare, wait: false } }));
    if (thread.some((x) => x.a === null)) setThread((t) => t.map((x) => (x.a === null ? { ...x, a: 'This was cut off when you left. Ask it again.', bad: true } : x)));
  }, [K]); // eslint-disable-line react-hooks/exhaustive-deps
  const goSimple = () => {
    setSimpleOpen((v) => !v);
    if (simple && simple !== 'err' && simple !== 'wait') return;
    setSimple('wait');
    post({ simple: true, piece: piece ?? '', si: si ?? 0 }).then((d) => setSimple(d.text || 'err')).catch(() => setSimple('err'));
  };
  const goWhole = () => {
    setWholeOpen((v) => !v);
    if (whole && whole !== 'err') return;
    setWhole('wait');
    post({ say: true, piece: '', si: 0 }).then((d) => setWhole(d.text || 'err')).catch(() => setWhole('err'));
  };
  const ask = () => {
    const qq = q.trim(); if (!qq || (!anyText && !askOpen)) return;
    const before = thread.filter((x) => x.a && !x.bad).map((x) => ({ q: x.q, a: x.a as string }));
    setThread((t) => [...t, { q: qq, a: null }]); setQ('');
    const put = (a: string, bad = false) => setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a, bad } : x)));
    const more = exOrder.map((k) => (ex[k]?.text ? `\n${DEEPER.find((d) => d[0] === k)?.[1]}: ${ex[k]!.text}` : '')).join('');
    post({ ask: qq, card: `${piece ? `The sentence: ${piece}\n` : ''}${simpleOpen && simple && simple !== 'wait' && simple !== 'err' ? `In simple words you told him: ${simple}\n` : ''}${text && open ? `What you told him about it: ${text}` : ''}${more}` || '(He asks about this line.)', thread: before })
      .then((d) => (d.text ? put(d.text) : put(d.error || 'It couldn’t answer just now.', true)))
      .catch(() => put('It couldn’t answer just now.', true));
  };
  const he = !!text && isHebText(text);
  // Nov 27: every button under its heading (Understand, Challenge, Sources, Practice, This page), each heading in the
  // order last used; icons; hidden ones left out altogether (Settings → The AI → The ✦ and its tools → ✦ buttons).
  type It = { id: string; icon: string; label: string; group: SayGroup; on?: boolean; act?: boolean; run: (ev: { currentTarget: HTMLElement }) => void };
  const cat = (id: string) => SAY_ITEMS.find((x) => x.id === id);
  const core = (id: string, on: boolean, run: It['run'], label?: string): It => { const c = cat(id)!; return { id, icon: c.icon, label: label ?? c.label, group: c.group, on, run }; };
  const menuBody = () => {
    const items: It[] = [
      core('simple', simpleOpen, goSimple),
      core('words', open, go),
      ...(pshat?.length ? [core('pshat', showPshat, () => setShowPshat((v) => !v))] : []),
      core('chart', chart, () => setChart((v) => !v)),
      ...(bp ? [core('bigpic', bpOpen, () => setBpOpen((v) => !v))] : []),
      ...DEEPER.filter(([k]) => k !== 'challenge' && k !== 'rashitos').map(([k]) => core(k, exOrder.includes(k), () => deeper(k))),
      core('ask', askOpen, () => { setAskOpen((v) => !v); window.setTimeout(() => inp.current?.focus(), 60); }),
    ];
    const m = acts?.();
    if (m) {
      const split = (l: string) => { const mm = l.match(/^([^A-Za-z\s]+)\s+(.+)$/); const name = (mm ? mm[2] : l).replace(/\s*\((I’ll lead|you lead)\)$/, ''); return { icon: mm ? mm[1] : '✦', name }; };
      for (const x of m.line) { const { icon, name } = split(x.label), id = `l:${name}`, c = cat(id); items.push({ id, icon: c?.icon ?? icon, label: name, group: 'Practice', act: true, run: (ev) => (/Learn with me/.test(x.label) ? x.run() : runHere(ev, x.run)) }); }
      for (const x of m.page.filter((y) => !MAPRE.test(y.label))) { const { icon, name } = split(x.label), id = `p:${name}`, c = cat(id); items.push({ id, icon: c?.icon ?? icon, label: name, group: 'This page', act: true, run: () => x.run() }); }
    }
    const shownItems = items.filter((x) => !prefs.hide.includes(x.id));
    const used = usedAt.current;
    const btn = (x: It) => <button key={x.id} type="button" className={`${x.on ? 'on' : ''}${x.act ? ' sayit-act' : ''}`} onClick={(ev) => { noteUse(x.id); x.run(ev); }}><span className="sayit-ic" aria-hidden="true">{x.icon}</span>{x.label}</button>;
    return (
      <span className="sayit-menu">
        {SAY_GROUPS.map((g) => {
          const inG = shownItems.filter((x) => x.group === g).map((x, i) => ({ x, i })).sort((a, b) => (used[b.x.id] ?? 0) - (used[a.x.id] ?? 0) || a.i - b.i).map((y) => y.x);
          return inG.length ? <span key={g} className="sayit-group"><span className="sayit-menu-sub">{g}</span>{inG.map(btn)}</span> : null;
        })}
      </span>
    );
  };
  return (
    <span className="sayit" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`sayit-btn sayit-main ${menu ? 'on' : ''}`} onClick={() => { if (!menu) usedAt.current = lastUsed(); setMenu((v) => !v); }} aria-expanded={menu} aria-label="AI help on this line">✦</button>
      {menu && menuBody()}
      {open && (
        <span className="sayit-box" role="region" aria-label="In my words">
          <span className="sayit-ex-label">In my words</span>
          {wholeToo && (
            <span className="sf-seg sayit-seg" role="radiogroup" aria-label="Explain">
              <button type="button" role="radio" aria-checked={!wholeOpen} className={!wholeOpen ? 'on' : ''} onClick={() => { if (wholeOpen) setWholeOpen(false); }}>This sentence</button>
              <button type="button" role="radio" aria-checked={wholeOpen} className={wholeOpen ? 'on' : ''} onClick={() => { if (!wholeOpen) goWhole(); }}>Whole line</button>
            </span>
          )}
          {wholeToo && wholeOpen
            ? (() => { const h = typeof whole === 'string' && whole !== 'wait' && whole !== 'err' && isHebText(whole); return <span className={`sayit-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{!whole || whole === 'wait' ? <span className="wait-dots"><span /><span /><span /></span> : whole === 'err' ? 'It couldn’t explain just now.' : whole}</span>; })()
            : <span className={`sayit-text ${he ? 'he-note' : ''}`} dir={he ? 'rtl' : 'ltr'}>{text ?? (err || <span className="wait-dots"><span /><span /><span /></span>)}</span>}
        </span>
      )}
      {simpleOpen && simple && (
        <span className="sayit-box" role="region" aria-label="Simple">
          <span className="sayit-ex-label">Simple</span>
          {(() => { const h = simple !== 'wait' && simple !== 'err' && isHebText(simple); return <span className={`sayit-text ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{simple === 'wait' ? <span className="wait-dots"><span /><span /><span /></span> : simple === 'err' ? 'It couldn’t explain just now.' : simple}</span>; })()}
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
          {(() => { const mp = acts?.().page.find((x) => MAPRE.test(x.label)); return mp ? <button type="button" className="sayit-inner" onClick={mp.run}>🗺 The whole sugya map</button> : null; })()}
        </span>
      )}
      {bp && bpOpen && <span className="sayit-box" role="region" aria-label="Big picture">{bp()}</span>}
      {(exOrder.length > 0 || anyText || askOpen) && (
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
                {k === 'kashya' && !exOrder.includes('challenge') && <button type="button" className="sayit-inner" onClick={() => deeper('challenge')}>＋ A sharp kashya of its own</button>}
                {k === 'meforshim' && !exOrder.includes('rashitos') && <button type="button" className="sayit-inner" onClick={() => deeper('rashitos')}>＋ Rashi and Tosafos side by side</button>}
              </span>
            );
          })}
          {(askOpen || anyText) && thread.map((x, i) => { // Nov 26: tapping Ask again folds the questions away (kept for next time)
            const h = !!x.a && isHebText(x.a);
            return (
              <span key={i} className="sayit-qa">
                <span className="sayit-q" dir="auto">{x.q}</span>
                <span className={`sayit-a ${x.bad ? 'bad' : ''} ${h ? 'he-note' : ''}`} dir={h ? 'rtl' : 'ltr'}>{x.a ?? <span className="wait-dots"><span /><span /><span /></span>}</span>
              </span>
            );
          })}
          {askOpen && !anyText && !thread.length && <span className="sayit-ex-label">Ask</span>}
          {(anyText || askOpen) && (
            <form className="sayit-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={thread.length ? 'Ask another…' : anyText ? 'Ask a follow-up…' : 'Ask about this line, in your own words…'} enterKeyHint="send" dir="auto" />
              <button type="submit" disabled={!q.trim()}>Ask</button>
            </form>
          )}
        </span>
      )}
    </span>
  );
}
