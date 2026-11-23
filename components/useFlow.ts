'use client';
// Nov 23: color the give and take (Settings → Extras, and the Aa panel): each line of the amud colored by what it is
// doing, from the sugya map (made once per amud and kept, the same map as the sugya chart): a question (or a
// rejection) red, an answer green, a proof blue, a statement amber. Where a step begins, a small label names it and
// who says it; the lines that carry on that step keep its color.
import { useEffect, useMemo, useState } from 'react';
import { chartKept, loadChart, type ChartData, type ChartStep } from './SugyaChart';

export type FlowTone = 'q' | 'a' | 'p' | 's';
const TONE: Record<string, FlowTone> = {
  Question: 'q', Rejection: 'q', Dispute: 'q', Rebuke: 'q', Exception: 'q', Challenge: 'q', Objection: 'q', Difficulty: 'q',
  Answer: 'a', Conclusion: 'a', Ruling: 'a', Principle: 'a', Resolution: 'a',
  Proof: 'p', Source: 'p', Support: 'p',
};
export const toneOf = (kind: string): FlowTone => TONE[kind] ?? 's';
export type FlowAt = { tone: FlowTone; starts: ChartStep[] };

export function useFlow(ref: string | undefined, on: boolean): ((n: number) => FlowAt | null) | null {
  const [data, setData] = useState<ChartData | null>(ref ? chartKept.get(ref) ?? null : null);
  useEffect(() => {
    if (!on || !ref) { setData(null); return; }
    let gone = false;
    setData(chartKept.get(ref) ?? null);
    loadChart(ref).then((d) => { if (!gone) setData(d); }).catch(() => {});
    return () => { gone = true; };
  }, [ref, on]);
  return useMemo(() => {
    if (!on || !data) return null;
    const steps = data.topics.flatMap((t) => t.steps).filter((s) => s.line > 0).sort((a, b) => a.line - b.line);
    if (!steps.length) return null;
    return (n: number) => {
      let cur: ChartStep | null = null;
      for (const s of steps) { if (s.line <= n) cur = s; else break; }
      if (!cur) return null;
      return { tone: toneOf(cur.kind), starts: steps.filter((s) => s.line === n) };
    };
  }, [data, on]);
}
