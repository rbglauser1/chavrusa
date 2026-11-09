import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The sugya map (Settings → Extras): the amud laid out as steps, each with its kind (Mishnah, kashya, teirutz…), who
// says it, and one line on what it says, and the line it begins on. Made once per amud by the AI, then kept a month.
const PROMPT = `You map a section of Gemara, Mishnah or another sefer for a learner as the steps of its argument, so he can see the whole sugya at a glance and where each step begins.
For each step give: "line" (the numbered line where it begins), "kind" (exactly one of: Mishnah, Braisa, Statement, Question, Answer, Proof, Rejection, Opinion, Machlokes, Story, Conclusion, Halacha), "who" (the speaker or source, like "Rav Pappa", "Rabbi Akiva", "the Gemara", "a braisa"; empty if none), and "summary" (one plain English line, at most 14 words, saying what this step says or asks).
Keep the steps at the level of the argument (usually 5 to 15 for an amud); every Question should be followed by its Answer or Rejection when the text gives one. Use yeshivish English (Shabbos, Toirah, kashya, teirutz, braisa).
Reply with JSON only: [{"line": 1, "kind": "Mishnah", "who": "", "summary": "..."}, ...] in order.`;

export type Step = { line: number; kind: string; who: string; summary: string };
const KINDS = ['Mishnah', 'Braisa', 'Statement', 'Question', 'Answer', 'Proof', 'Rejection', 'Opinion', 'Machlokes', 'Story', 'Conclusion', 'Halacha'];

async function makeMap(ref: string): Promise<{ steps: Step[] }> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { steps: [] };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'map', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  let steps: Step[] = [];
  try {
    steps = (JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as Step[])
      .filter((x) => x && Number.isFinite(Number(x.line)) && typeof x.summary === 'string')
      .map((x) => ({
        line: Math.min(Math.max(1, Math.round(Number(x.line))), s.he.length),
        kind: KINDS.includes(String(x.kind)) ? String(x.kind) : 'Statement',
        who: String(x.who ?? '').slice(0, 40),
        summary: x.summary.trim().slice(0, 160),
      }));
  } catch { steps = []; }
  if (!steps.length) throw new Error('The map did not come back in the right form.'); // not kept: tried again next time
  return { steps };
}

const cached = (ref: string) => unstable_cache(() => makeMap(ref), ['sugya-map-v1', ref], { revalidate: 60 * 60 * 24 * 30 })();

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref)) return NextResponse.json({ steps: [] });
  try { return NextResponse.json(await cached(ref)); }
  catch (e) { return NextResponse.json({ steps: [], error: (e as Error).message }); }
}
