import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { LIBRARY_TOOLS, libraryExecutor, sourcesNamed } from '@/lib/libraryTools';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 180; // it may read several sources first

// The "Explain" button on a line: what this line says and where it stands in the sugya, in clear English with the
// learning terms in Hebrew letters. The AI has the whole library (lib/libraryTools): it reads Rashi and Tosafos on the
// line, and whatever else it needs (other Rishonim, the parallel sugya, where the halacha is ruled), and names each
// source it used as ⟦reference⟧ so the app can make it tappable. Made once per line, ever, and kept (lib/keep), by
// Opus or Sonnet (Settings → Made once and kept).
const PROMPT = `You explain one line of a sefer to a learner who is learning it now, like a good chavrusa leaning over to help.
You get the whole amud / perek with numbered lines; the line to explain is marked >>> <<<, followed by the main meforesh on it.
You also have the whole library: "links" shows what is linked to the line (meforshim, where the halacha is ruled, parallels), "read" opens any of them, "search" and "find" look further. Before writing, read what matters for this line: Tosafos on it when there is one, and another Rishon, the parallel sugya or the Rambam / Shulchan Aruch only when they really help explain it. A few reads are enough; do not read for the sake of reading.
Then write 4 to 8 sentences, in two or three short paragraphs:
1. What this line says, clearly, as he would say it over in his own words.
2. Where it stands: what question or point it answers or builds on, why it is needed here, and what comes next.
3. Only if the sources you read add something real: what they add (Tosafos' question, how the Rambam rules…).
Name every source you draw on, and write its exact reference right after it inside ⟦ ⟧, the reference exactly as you opened it: "Tosafos (⟦Tosafot on Yoma 6a:3:1⟧) asks…", "the Rambam rules (⟦Mishneh Torah, Service on the Day of Atonement 1:3⟧)…". Only sources you actually read; never one you did not open.
Write in plain, clear English, the way a good chavrusa explains it across the table. For the learning terms a yeshiva learner knows, and for words the text itself quotes or learns from, write the Hebrew or Aramaic in Hebrew letters, as he knows them: גזירה שוה, קל וחומר, היקש, פרישה, the word "צוה". Never put such a term into an English rendering (not "verbal analogy") and never spell Hebrew out in English letters. Names of people and books in English as usual (Rashi, Tosafos, Rabbi Yochanan, Moses). Call God "Hashem". Explain according to Chazal and the classic meforshim; do not invent sources or opinions. On halacha: say what the sefer rules; this is learning, not a ruling for practice.
Be clear above all: every sentence must make sense to someone who has not yet learned this amud. No headings, no lists, no markdown: just the paragraphs.`;

const MAIN_COMM = (base: string) => (/^Mishnah /.test(base) ? 'Bartenura' : 'Rashi');

async function makeExplain(base: string, n: number): Promise<{ text: string; sources: string[] }> {
  await needCredit(); // credits on and none left: nothing new is made (what was made before still opens)
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length || n > s.he.length) return { text: '', sources: [] };
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  // The lines around it in full; further away, just a little of each.
  const lines = s.he.map((he, i) => {
    const near = Math.abs(i + 1 - n) <= 6;
    const mark = i + 1 === n ? '>>> ' : '';
    const end = i + 1 === n ? ' <<<' : '';
    return `[${i + 1}] ${mark}${clip(stripNikud(he), near ? 900 : 160)}${end}${near && s.en[i] ? `\n    ${clip(s.en[i], 900)}` : ''}`;
  }).join('\n');
  const used = new Set<string>();
  let comm = '';
  try {
    const c = await getText(`${MAIN_COMM(base)} on ${base}:${n}`, approved);
    if (c.verdict.allowed && c.he.length) { comm = `\n\n${MAIN_COMM(base)} on line ${n} (${c.ref}):\n${clip(c.he.map(stripNikud).join(' '), 2500)}`; used.add(c.ref); }
  } catch { /* optional */ }
  const model = await keptModel(); // Opus or Sonnet, by the setting (lib/keptModel)
  const r = await runAnthropic({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}, line ${n} (the line's own reference: ${s.ref}:${n})\n\n${lines.slice(0, 26000)}${comm}` }],
    tools: LIBRARY_TOOLS, execute: libraryExecutor(approved, used), effort: model.effort, thinking: 'disabled', maxSteps: 6,
  });
  await logCost({ sessionId: null, kind: 'explain', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__/g, '').trim();
  if (text.length < 60) throw new Error('The explanation did not come back.'); // not kept: tried again next time
  return { text: text.slice(0, 3500), sources: sourcesNamed(text, used) };
}

// GET ?ref=Yoma 6a:3  (a line of an amud / perek)
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ text: '' });
  try { return NextResponse.json(await keep('explain-v2', ref, () => makeExplain(m[1], Number(m[2])), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ text: '', error: (e as Error).message }); }
}
