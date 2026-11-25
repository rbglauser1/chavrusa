'use client';
// Nov 25: ✦ Go deeper → Sugya chart, under "In my words?": a simple chart of the sugya this line is in, step by step
// down the page (who says what, a question and its answer), "You are here" on this line's step, and the bottom line.
// Where the sugya begins and ends comes from the sugya map (app/api/map, made once per amud and kept): the map cuts
// the amud into topics, and the chart is the topic this line falls in. A topic that opens the amud may have begun on
// the amud before, and one that closes it may go on to the next: a tap brings in that part too.
// "From here on" starts the chart at this line's step (like "from Rav Yosef and on").
import { useEffect, useState } from 'react';
import { loadChart, topicStartOf, labelOf, MARK, TONE, INSIDE, type ChartStep, type ChartTopic } from './SugyaChart';
import { nextSection, prevSection } from '@/lib/refs';

type Part = { ref: string; topic: ChartTopic };

export default function SugyaFlow({ lineRef }: { lineRef: string }) {
  const m = lineRef.match(/^(.*?):(\d+)/);
  const ref = m ? m[1] : lineRef, n = m ? Number(m[2]) : 1;
  const [main, setMain] = useState<{ topic: ChartTopic; first: boolean; last: boolean } | null>(null);
  const [err, setErr] = useState(false);
  const [before, setBefore] = useState<Part | null | 'loading' | 'none'>(null);
  const [after, setAfter] = useState<Part | null | 'loading' | 'none'>(null);
  const [fromHere, setFromHere] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false; setErr(false);
    loadChart(ref).then((d) => {
      if (gone) return;
      const ti = d.topics.reduce((k, t, i) => (topicStartOf(t) <= n ? i : k), 0);
      setMain({ topic: d.topics[ti], first: ti === 0, last: ti === d.topics.length - 1 });
    }).catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [ref, n, tick]);
  const prev = prevSection(ref), next = nextSection(ref);
  const bring = (which: 'before' | 'after') => {
    const r = which === 'before' ? prev : next; if (!r) return;
    const set = which === 'before' ? setBefore : setAfter;
    set('loading');
    loadChart(r).then((d) => {
      const t = which === 'before' ? d.topics[d.topics.length - 1] : d.topics[0];
      set(t ? { ref: r, topic: t } : 'none');
    }).catch(() => set('none'));
  };

  if (err) return <span className="sf-wait">The chart couldn’t be made just now. <button type="button" className="linklike" onClick={() => setTick((k) => k + 1)}>Try again</button></span>;
  if (!main) return <span className="sf-wait"><span className="wait-dots"><span /><span /><span /></span> Drawing the sugya (the first time on this amud takes a moment)</span>;

  const steps = [...main.topic.steps].sort((a, b) => a.line - b.line);
  const here = steps.reduce<ChartStep | null>((k, s) => (s.line <= n ? s : k), null) ?? steps[0];
  const shown = fromHere ? steps.slice(Math.max(0, steps.indexOf(here))) : steps;
  const short = (r: string) => r.replace(/^.* (\d+[ab]?)$/, '$1');
  const track = (list: ChartStep[], at: string, mark?: ChartStep) => (
    <ol className="sf-track">
      {list.map((s, i) => {
        const p = list[i - 1];
        const inside = !!p && INSIDE.has(s.kind) && (p.kind === 'Question' || INSIDE.has(p.kind));
        return (
          <li key={i} className={`sf-step t-${TONE[s.kind] ?? 'base'} ${inside ? 'in' : ''} ${s === mark ? 'here' : ''}`}>
            <span className="sf-dot" aria-hidden="true">{MARK[s.kind] ?? '•'}</span>
            <span className="sf-body">
              <span className="sf-kind">{labelOf(s)}{s === mark && <em>You are here</em>}<small>{at} · {s.line}</small></span>
              <span className="sf-sum">{s.summary}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
  const part = (p: Part) => (
    <>
      {p.topic.title && <span className="sf-sub">{short(p.ref)}: {p.topic.title}</span>}
      {track([...p.topic.steps].sort((a, b) => a.line - b.line), short(p.ref))}
    </>
  );
  return (
    <span className="sf">
      <span className="sf-top">
        <b>{main.topic.title || 'This sugya'}</b>
        <span className="sf-seg" role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={!fromHere} className={!fromHere ? 'on' : ''} onClick={() => setFromHere(false)}>Whole sugya</button>
          <button type="button" role="radio" aria-checked={fromHere} className={fromHere ? 'on' : ''} onClick={() => setFromHere(true)}>From here on</button>
        </span>
      </span>
      {!fromHere && main.first && prev && (
        before && typeof before === 'object' ? part(before)
          : <button type="button" className="sf-more" disabled={before === 'loading'} onClick={() => bring('before')}>{before === 'loading' ? 'Bringing it…' : before === 'none' ? `Nothing found on ${short(prev)}` : `‹ Did it begin on ${short(prev)}? Show that part`}</button>
      )}
      {!fromHere && main.topic.intro && <span className="sf-intro">{main.topic.intro.replace(/^[-•*]\s*/gm, '').replace(/\n+/g, ' ')}</span>}
      {track(shown, short(ref), here)}
      {main.last && next && (
        after && typeof after === 'object' ? part(after)
          : <button type="button" className="sf-more" disabled={after === 'loading'} onClick={() => bring('after')}>{after === 'loading' ? 'Bringing it…' : after === 'none' ? `Nothing found on ${short(next)}` : `Does it go on to ${short(next)}? Show it ›`}</button>
      )}
      {main.topic.takeaway && <span className="sf-take"><b>Bottom line</b>{main.topic.takeaway}</span>}
      {after && typeof after === 'object' && after.topic.takeaway && <span className="sf-take"><b>Bottom line on {short(after.ref)}</b>{after.topic.takeaway}</span>}
      <span className="sf-note">From the sugya map, made by AI · check it inside</span>
    </span>
  );
}
