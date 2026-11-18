'use client';
// The section's map on the device (Nov 15): fetched once per section and shared by the line map (MapPeek) and
// Learn with me, so a second look opens at once. The server keeps every map for good (app/api/map).
export type MapStep = { line: number; kind: string; who: string; summary: string };
export type MapTopic = { title: string; line: number; intro: string; background: string[]; steps: MapStep[]; takeaway: string };
export type MapData = { overview: string; topics: MapTopic[] };

const got = new Map<string, Promise<MapData>>();

export function getMap(ref: string): Promise<MapData> {
  const key = `${typeof document !== 'undefined' ? document.documentElement.dataset.ailang ?? 'en' : 'en'}|${ref}`; // per language
  const had = got.get(key);
  if (had) return had;
  const p = fetch(`/api/map?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
    const topics: MapTopic[] = d.topics?.length ? d.topics
      : d.steps?.length ? [{ title: '', line: d.steps[0].line, intro: '', background: [], steps: d.steps, takeaway: '' }] : [];
    if (!topics.length) throw new Error(d.error || 'No map');
    return { overview: String(d.overview ?? ''), topics };
  });
  got.set(key, p);
  p.catch(() => got.delete(key)); // a failure is tried again next time
  return p;
}

const topicStart = (t: MapTopic) => Math.min(t.line, ...t.steps.map((x) => x.line));

/** Where line n stands: its topic (the last one starting at or before it) and its step. */
export function placeOf(m: MapData, n: number): { ti: number; topic: MapTopic | null; step: MapStep | null } {
  let ti = -1;
  m.topics.forEach((t, i) => { if (topicStart(t) <= n) ti = i; });
  if (ti < 0 && m.topics.length) ti = 0;
  const topic = ti >= 0 ? m.topics[ti] : null;
  const all = m.topics.flatMap((t) => t.steps);
  const step = all.reduce<MapStep | null>((k, s) => (s.line <= n ? s : k), null);
  return { ti, topic, step };
}

/** Does a new topic begin on line n? Then its background is shown there. */
export const topicBeginsAt = (m: MapData, n: number) => m.topics.findIndex((t) => topicStart(t) === n);
/** Is n the last line of topic ti (the next topic starts after it, or the text ends)? */
export function topicEndsAt(m: MapData, ti: number, n: number, total: number) {
  const nx = m.topics[ti + 1];
  return nx ? topicStart(nx) - 1 === n : n === total;
}

// "The Gemara asks", "Rav Pappa answers": a step's label as the flow of the text.
const VERB: Record<string, string> = { Question: 'asks', Answer: 'answers', Proof: 'brings a proof', Rejection: 'pushes it off', Statement: 'says', Opinion: 'holds', Reason: 'explains', Speech: 'speaks', Prayer: 'prays' };
export const stepLabel = (s: { kind: string; who: string }) => (s.who && VERB[s.kind] ? `${s.who} ${VERB[s.kind]}` : `${s.kind}${s.who ? ` · ${s.who}` : ''}`);
