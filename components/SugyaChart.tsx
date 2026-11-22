'use client';
// Nov 21: the sugya chart, opened from Learn with me (the 🗺 button). The same map as Settings → Extras → Sugya map
// (app/api/map: made once per amud or perek and kept), drawn as a chart to see at a glance where we are and what's going
// on: the topics as a strip on top, then each topic as a track of its steps, the give and take indented (a question,
// and under it its answer or rejection), colored by kind. What we've learned is solid, the step we're on is lit with
// "You are here", what's ahead is faint. Tap a step to learn from there.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSwipeDown } from '@/lib/swipeDown';

export type ChartStep = { line: number; kind: string; who: string; summary: string };
export type ChartTopic = { title: string; line: number; intro: string; steps: ChartStep[]; takeaway: string };
export type ChartData = { overview: string; topics: ChartTopic[] };

// Made once per text for the session, so the chart opens instantly the second time and Learn with me can tell when a
// new topic begins.
const asked = new Map<string, Promise<ChartData>>();
export const chartKept = new Map<string, ChartData>();
export function loadChart(ref: string): Promise<ChartData> {
  if (!asked.has(ref)) {
    const p = fetch(`/api/map?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
      const topics: ChartTopic[] = (d.topics?.length ? d.topics : d.steps?.length ? [{ title: '', line: d.steps[0].line, intro: '', steps: d.steps, takeaway: '' }] : [])
        .map((t: ChartTopic) => ({ title: t.title ?? '', line: t.line, intro: t.intro ?? '', takeaway: t.takeaway ?? '', steps: Array.isArray(t.steps) ? t.steps : [] }));
      if (!topics.length) throw new Error(d.error || 'none');
      const data = { overview: String(d.overview ?? ''), topics };
      chartKept.set(ref, data);
      return data;
    });
    asked.set(ref, p);
    p.catch(() => asked.delete(ref));
  }
  return asked.get(ref)!;
}
export const topicStartOf = (t: ChartTopic) => Math.min(t.line, ...t.steps.map((s) => s.line));

const VERB: Record<string, string> = { Question: 'asks', Answer: 'answers', Proof: 'brings a proof', Rejection: 'pushes it off', Statement: 'says', Opinion: 'holds', Reason: 'explains', Speech: 'speaks', Prayer: 'prays', Teaching: 'teaches', Ruling: 'rules' };
const labelOf = (s: ChartStep) => (s.who && VERB[s.kind] ? `${s.who} ${VERB[s.kind]}` : `${s.kind}${s.who ? ` · ${s.who}` : ''}`);
const MARK: Record<string, string> = {
  Question: '?', Rejection: '✕', Answer: '✓', Proof: '✓', Conclusion: '★', Ruling: '★', Principle: '★',
  Mishnah: '❝', Teaching: '❝', Source: '❝', Dispute: '⚖', Opinion: '◆', Statement: '•', Reason: '∴', Exception: '!', Case: '•', Story: '•',
};
const TONE: Record<string, 'ask' | 'ans' | 'base'> = { Question: 'ask', Rejection: 'ask', Dispute: 'ask', Rebuke: 'ask', Answer: 'ans', Proof: 'ans', Conclusion: 'ans', Ruling: 'ans', Comfort: 'ans', Song: 'ans', Prayer: 'ans' };
const INSIDE = new Set(['Answer', 'Rejection', 'Proof']); // these answer the step before them

export default function SugyaChart({ refText, title, here, total, onGo, onClose }: {
  refText: string; title: string; here: number; total: number; onGo: (line: number) => void; onClose: () => void;
}) {
  const [data, setData] = useState<ChartData | null>(chartKept.get(refText) ?? null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [bigOpen, setBigOpen] = useState(false);
  useEffect(() => {
    let gone = false;
    if (!chartKept.has(refText)) { setData(null); setErr(false); }
    loadChart(refText).then((d) => { if (!gone) setData(d); }).catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [refText, tick]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const sheet = useSwipeDown<HTMLDivElement>(onClose);

  const all = data ? data.topics.flatMap((t) => t.steps) : [];
  const atStep = all.reduce<ChartStep | null>((k, s) => (s.line <= here ? s : k), null);
  const atTopic = data ? data.topics.reduce((k, t, i) => (topicStartOf(t) <= here ? i : k), 0) : 0;
  const hereEl = useRef<HTMLLIElement | null>(null);
  const topicEls = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => { // open on the step we're on
    if (!data) return;
    const t = window.setTimeout(() => hereEl.current?.scrollIntoView({ block: 'center' }), 60);
    return () => window.clearTimeout(t);
  }, [data]);

  return createPortal(
    <div className="sch-back" onClick={onClose}>
      <div ref={sheet} className="sch" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sch-head">
          <span className="sch-title">{title}<small>{refText} · line {Math.min(here, total)} of {total}</small></span>
          <button className="sch-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!data && !err && <div className="muted sch-wait"><span className="wait-dots"><span /><span /><span /></span> Drawing the chart… (the first time on this {/\d[ab]$/.test(refText) ? 'amud' : 'perek'} takes a moment)</div>}
        {err && <div className="muted sch-wait">The chart couldn’t be made just now. <button className="linklike" onClick={() => setTick((k) => k + 1)}>Try again</button></div>}
        {data && (
          <>
            {data.topics.length > 1 && (
              <div className="sch-strip" role="list">
                {data.topics.map((t, i) => (
                  <button key={i} role="listitem" className={`sch-seg ${i < atTopic ? 'done' : i === atTopic ? 'here' : ''}`}
                    onClick={() => topicEls.current[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
                    <b>{i + 1}</b><span>{t.title || `Part ${i + 1}`}</span>
                  </button>
                ))}
              </div>
            )}
            {data.overview && (
              <button className={`sch-big ${bigOpen ? 'open' : ''}`} onClick={() => setBigOpen((v) => !v)}>
                <span className="sch-label">The big picture {bigOpen ? '▴' : '▾'}</span>
                <span className="sch-big-text">{data.overview.replace(/^[-•*]\s*/gm, '').replace(/\n+/g, ' ')}</span>
              </button>
            )}
            <div className="sch-key" aria-hidden="true"><span className="ask">? asks</span><span className="ans">✓ answers</span><span>• says</span><span className="me">● you</span></div>
            {data.topics.map((t, ti) => {
              const state = ti < atTopic ? 'done' : ti === atTopic ? 'here' : 'ahead';
              return (
                <section key={ti} ref={(el) => { topicEls.current[ti] = el; }} className={`sch-topic ${state}`}>
                  {t.title && (
                    <button className="sch-topic-head" onClick={() => onGo(topicStartOf(t))}>
                      <span className="sch-topic-n">{ti + 1}</span>
                      <span className="sch-topic-title">{t.title}</span>
                      <span className="sch-line">line {topicStartOf(t)}</span>
                    </button>
                  )}
                  {t.intro && state === 'here' && <p className="sch-intro">{t.intro.replace(/^[-•*]\s*/gm, '').replace(/\n+/g, ' ')}</p>}
                  <ol className="sch-track">
                    {t.steps.map((s, i) => {
                      const prev = t.steps[i - 1];
                      const inside = !!prev && INSIDE.has(s.kind) && (prev.kind === 'Question' || INSIDE.has(prev.kind));
                      const isHere = s === atStep;
                      const st = isHere ? 'here' : atStep && all.indexOf(s) < all.indexOf(atStep) ? 'done' : 'ahead';
                      return (
                        <li key={i} ref={isHere ? hereEl : undefined} className={`sch-step ${st} t-${TONE[s.kind] ?? 'base'} ${inside ? 'in' : ''}`}>
                          <button onClick={() => onGo(s.line)}>
                            <span className="sch-dot" aria-hidden="true">{MARK[s.kind] ?? '•'}</span>
                            <span className="sch-body">
                              <span className="sch-kind">{labelOf(s)}{isHere && <em className="sch-you">You are here</em>}</span>
                              <span className="sch-sum">{s.summary}</span>
                            </span>
                            <span className="sch-line">{s.line}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {t.takeaway && <p className="sch-take"><span className="sch-label">Where it ends up</span>{t.takeaway}</p>}
                </section>
              );
            })}
            <div className="ai-note left">Made by AI · AI makes mistakes · check it inside · tap a step to learn from there</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
