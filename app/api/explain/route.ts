import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 120;

// The "Explain" button on a line: what this line says and where it stands in the sugya, in clear English with the
// learning terms in Hebrew letters. Made by Opus once per line, ever, and kept for good (lib/keep).
const PROMPT = `You explain one line of a sefer to a learner who is learning it now, like a good chavrusa leaning over to help.
You get the whole amud / perek with numbered lines; the line to explain is marked >>> <<<. You may also get the main meforesh on that line.
Write 4 to 7 sentences, in two short paragraphs:
1. What this line says, clearly, as he would say it over in his own words.
2. Where it stands: what question or point it answers or builds on, why it is needed here, and what comes next.
Write in plain, clear English, the way a good chavrusa explains it across the table. For the learning terms a yeshiva learner knows, and for words the text itself quotes or learns from, write the Hebrew or Aramaic in Hebrew letters, as he knows them: גזירה שוה, קל וחומר, היקש, פרישה, the word "צוה". Never put such a term into an English rendering (not "verbal analogy") and never spell Hebrew out in English letters. Names of people and books in English as usual (Rashi, Rabbi Yochanan, Moses). Call God "Hashem". Explain according to Chazal and the classic meforshim (Rashi first); do not invent sources or opinions.
Be clear above all: every sentence must make sense to someone who has not yet learned this amud. No headings, no lists, no markdown: just the two paragraphs.`;

const MAIN_COMM = (base: string) => (/^Mishnah /.test(base) ? 'Bartenura' : 'Rashi');

async function makeExplain(base: string, n: number): Promise<{ text: string }> {
  await needCredit(); // credits on and none left: nothing new is made (what was made before still opens)
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length || n > s.he.length) return { text: '' };
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  // The lines around it in full; further away, just a little of each.
  const lines = s.he.map((he, i) => {
    const near = Math.abs(i + 1 - n) <= 6;
    const mark = i + 1 === n ? '>>> ' : '';
    const end = i + 1 === n ? ' <<<' : '';
    return `[${i + 1}] ${mark}${clip(stripNikud(he), near ? 900 : 160)}${end}${near && s.en[i] ? `\n    ${clip(s.en[i], 900)}` : ''}`;
  }).join('\n');
  let comm = '';
  try {
    const c = await getText(`${MAIN_COMM(base)} on ${base}:${n}`, approved);
    if (c.verdict.allowed && c.he.length) comm = `\n\n${MAIN_COMM(base)} on line ${n}:\n${clip(c.he.map(stripNikud).join(' '), 2500)}`;
  } catch { /* optional */ }
  const model = await keptModel(); // Opus or Sonnet, by the setting (lib/keptModel)
  const r = await runAnthropic({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}, line ${n}\n\n${lines.slice(0, 26000)}${comm}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'explain', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__/g, '').trim();
  if (text.length < 60) throw new Error('The explanation did not come back.'); // not kept: tried again next time
  return { text: text.slice(0, 2500) };
}

// GET ?ref=Yoma 6a:3  (a line of an amud / perek)
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ text: '' });
  try { return NextResponse.json(await keep('explain-v1', ref, () => makeExplain(m[1], Number(m[2])), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ text: '', error: (e as Error).message }); }
}
