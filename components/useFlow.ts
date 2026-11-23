'use client';
// Nov 23: color the give and take (Settings → The AI → The ✦ and its tools, and the Aa panel): each line of the amud
// colored by what it is doing: a question (or a rejection, a dispute) red, an answer green, a proof blue, a statement
// amber, with a small label where a new step begins and who says it.
// Two sources, both made once per amud and kept: the sentence-by-sentence marks (app/api/flow: what each sentence does,
// so in Sentence by sentence each label sits on its own sentence), and until they come, the sugya map (the line where
// each step begins).
import { useEffect, useMemo, useState } from 'react';
import { chartKept, loadChart, type ChartData, type ChartStep } from './SugyaChart';

export type FlowTone = 'q' | 'a' | 'p' | 's';
const TONE: Record<string, FlowTone> = {
  Question: 'q', Rejection: 'q', Dispute: 'q', Rebuke: 'q', Exception: 'q', Challenge: 'q', Objection: 'q', Difficulty: 'q',
  Answer: 'a', Conclusion: 'a', Ruling: 'a', Principle: 'a', Resolution: 'a',
  Proof: 'p', Source: 'p', Support: 'p',
};
export const toneOf = (kind: string): FlowTone => TONE[kind] ?? 's';
export const MARK: Record<FlowTone, string> = { q: '?', a: '✓', p: '§', s: '•' };
export type FlowSent = { kind: string; who: string; tone: FlowTone; change: boolean };
export type FlowAt = { tone: FlowTone; starts: ChartStep[]; sents: FlowSent[] | null };

type Sents = Record<number, { kind: string; who: string }[]>;
const sentAsked = new Map<string, Promise<Sents>>();
const sentKept = new Map<string, Sents>();
function loadSents(ref: string): Promise<Sents> {
  if (!sentAsked.has(ref)) {
    const p = fetch(`/api/flow?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
      const lines = (d && typeof d.lines === 'object' ? d.lines : {}) as Sents;
      if (!Object.keys(lines).length) throw new Error(d?.error || 'none');
      sentKept.set(ref, lines);
      return lines;
    });
    sentAsked.set(ref, p);
    p.catch(() => sentAsked.delete(ref));
  }
  return sentAsked.get(ref)!;
}

export function useFlow(ref: string | undefined, on: boolean): ((n: number) => FlowAt | null) | null {
  const [data, setData] = useState<ChartData | null>(ref ? chartKept.get(ref) ?? null : null);
  const [sents, setSents] = useState<Sents | null>(ref ? sentKept.get(ref) ?? null : null);
  useEffect(() => {
    if (!on || !ref) { setData(null); setSents(null); return; }
    let gone = false;
    setData(chartKept.get(ref) ?? null);
    setSents(sentKept.get(ref) ?? null);
    loadChart(ref).then((d) => { if (!gone) setData(d); }).catch(() => {});
    loadSents(ref).then((d) => { if (!gone) setSents(d); }).catch(() => {});
    return () => { gone = true; };
  }, [ref, on]);
  return useMemo(() => {
    if (!on || (!data && !sents)) return null;
    const steps = data ? data.topics.flatMap((t) => t.steps).filter((s) => s.line > 0).sort((a, b) => a.line - b.line) : [];
    // The sentences in order, each marked where a new step begins (its kind or its speaker changes).
    const marked: Record<number, FlowSent[]> = {};
    if (sents) {
      let prev: { kind: string; who: string } | null = null;
      for (const n of Object.keys(sents).map(Number).sort((a, b) => a - b)) {
        marked[n] = sents[n].map((x) => {
          const change: boolean = !prev || x.kind !== prev.kind || (!!x.who && !!prev.who && x.who !== prev.who);
          prev = x;
          return { kind: x.kind, who: x.who, tone: toneOf(x.kind), change };
        });
      }
    }
    return (n: number) => {
      const ss = marked[n] ?? null;
      let cur: ChartStep | null = null;
      for (const s of steps) { if (s.line <= n) cur = s; else break; }
      if (!ss && !cur) return null;
      return { tone: ss ? ss[ss.length - 1].tone : toneOf(cur!.kind), starts: ss ? [] : steps.filter((s) => s.line === n), sents: ss };
    };
  }, [data, sents, on]);
}

/** The labels to show above a line: the sentences where a new step begins, or (until those come) the map's steps. */
export function flowTags(fl: FlowAt): { tone: FlowTone; text: string }[] {
  if (fl.sents) return fl.sents.filter((x) => x.change).map((x) => ({ tone: x.tone, text: `${MARK[x.tone]} ${x.kind}${x.who ? ` · ${x.who}` : ''}` }));
  return fl.starts.map((s) => ({ tone: toneOf(s.kind), text: `${MARK[toneOf(s.kind)]} ${s.kind}${s.who ? ` · ${s.who}` : ''}` }));
}
