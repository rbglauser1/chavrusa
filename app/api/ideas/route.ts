import { NextRequest, NextResponse } from 'next/server';
import { costUsd, KEPT_MODEL } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { relatedLines, type Item } from '@/lib/related';

export const runtime = 'nodejs';
export const maxDuration = 120;

// "Ideas from these sources" (in a line's Sources box): Opus reads the seforim Sefaria links to the line (the halacha,
// Midrash, machshava, mussar, chassidus, and the same in Shas) and writes 2 to 4 short points, each naming the
// source(s) it comes from, so he can open them. Nothing that is not in those seforim. Made once per line and kept.
const PROMPT = `A learner is on one line of a sefer. Below are the line and the seforim that are linked to it (each with its reference).
Write 2 to 4 short points, each 1 to 3 sentences, that bring out what these seforim add to this line: how the halacha is ruled (from the Rambam, Shulchan Aruch, Tur or Mishnah Berurah given), and any notable idea, lesson or insight from the Midrash, machshava, mussar or chassidus sources given, or what the same discussion elsewhere in Shas adds.
Use ONLY what is written in the seforim given. Do not add sources, opinions or ideas that are not in them; if a sefer only repeats the line, skip it. Each point names its sefer in the sentence (like "The Rambam rules…", "The Sfas Emes explains…").
Write in plain, clear English. For the learning terms a yeshiva learner knows, and for words the text quotes, write the Hebrew or Aramaic in Hebrew letters (גזירה שוה, נדה, טהרות); never spell Hebrew out in English letters. Names of people and books in English as usual. Call God "Hashem". On halacha: say what the sefer rules; this is learning, not a ruling for practice.
Reply with JSON only: [{"text": "...", "refs": ["exact reference(s) from the list"]}]`;

async function makeIdeas(base: string, n: number): Promise<{ points: { text: string; refs: string[] }[] }> {
  const approved = await approvedList();
  const g = (await relatedLines(base))[String(n)];
  if (!g) return { points: [] };
  // The ones worth reading, the codes and the ideas first; at most 10.
  const pick: Item[] = [...g.halacha.slice(0, 3), ...g.thought.slice(0, 4), ...g.midrash.slice(0, 3), ...g.parallels.slice(0, 2)].slice(0, 10);
  if (!pick.length) return { points: [] };
  const [line, ...texts] = await Promise.all([
    getText(base, approved).catch(() => null),
    ...pick.map((x) => getText(x.ref, approved).catch(() => null)),
  ]);
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  const he = line?.he[n - 1] ? stripNikud(line.he[n - 1]) : '', en = line?.en[n - 1] ?? '';
  const srcs = pick.map((x, i) => {
    const t = texts[i];
    if (!t || !t.verdict.allowed || !t.he.length) return '';
    const body = clip(t.he.map(stripNikud).join(' '), 1800) + (t.en.length ? `\n(English: ${clip(t.en.join(' '), 1200)})` : '');
    return `### ${x.ref}\n${body}`;
  }).filter(Boolean);
  if (!srcs.length) return { points: [] };
  const model = KEPT_MODEL;
  const r = await runAnthropic({
    model: model.id, system: PROMPT,
    history: [{ role: 'user', content: `The line: ${base}, line ${n}\n${he}\n${en}\n\nThe linked seforim:\n\n${srcs.join('\n\n')}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'ideas', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const known = new Set(pick.map((x) => x.ref));
  let points: { text: string; refs: string[] }[] = [];
  try {
    const arr = JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    points = (Array.isArray(arr) ? arr : []).filter((p) => p && typeof p.text === 'string').map((p) => ({
      text: String(p.text).trim().slice(0, 700),
      refs: (Array.isArray(p.refs) ? p.refs : []).map(String).filter((x: string) => known.has(x)).slice(0, 3),
    })).filter((p) => p.text && p.refs.length).slice(0, 4);
  } catch { points = []; }
  if (!points.length) throw new Error('The ideas did not come back in the right form.'); // not kept: tried again next time
  return { points };
}

// GET ?ref=Yoma 6a:3
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ points: [] });
  try { return NextResponse.json(await keep('ideas-v1', ref, () => makeIdeas(m[1], Number(m[2])))); }
  catch (e) { return NextResponse.json({ points: [], error: (e as Error).message }); }
}
