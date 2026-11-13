import { clipWords } from '@/lib/clip';
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
export const maxDuration = 60;

// Review questions (Settings → Extras): questions on an amud or perek for the learner to test himself, each with a
// short answer (hidden until he taps) and the line it is about. Made by the AI once per amud / perek and kept for good.
const PROMPT = `You write review questions on a text a learner has learned, so he can test himself.
Write 5 to 8 questions, in the order of the text, that check he understood it: what is asked and why, how it is answered, what each opinion holds and its reason, what is proven, and where it ends up. Not trivia.
Write in plain, clear English, the way a good chavrusa explains it across the table. For the learning terms a yeshiva learner knows, and for words the text itself quotes or learns from, write the Hebrew or Aramaic in Hebrew letters, as he knows them: גזירה שוה, קל וחומר, היקש, פרישה, the word "צוה", "וכפר". Never put such a term into an English rendering (not "verbal analogy", not "a fortiori") and never spell Hebrew out in English letters. Names of people and books in English as usual (Rashi, Rabbi Yochanan, Rav Pappa, Moses, Aaron). Call God "Hashem". Explain according to Chazal and the classic meforshim.
Be clear above all: every sentence must make sense to a learner who has not yet learned this amud. Say what is learned from where, and why it matters; spell out what a question is really asking and what the answer means. Never vague words like "linking" or "connecting".
For each: "q" (the question, at most 25 words), "a" (its answer, 1 to 2 sentences), "line" (the numbered line it is about).
Reply with JSON only: [{"q": "...", "a": "...", "line": 1}, ...]`;

export type Question = { q: string; a: string; line: number };

async function makeReview(ref: string): Promise<{ questions: Question[] }> {
  await needCredit(); // credits on and none left: nothing new is made (what was made before still opens)
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { questions: [] };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = await keptModel(); // Opus or Sonnet, by the setting (lib/keptModel)
  const run = runAnthropic;
  const r = await run({
    lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'review', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  let questions: Question[] = [];
  try {
    const arr = JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    questions = (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string').map((x) => ({
      q: clipWords(x.q, 400), a: clipWords(x.a, 900),
      line: Math.min(Math.max(1, Math.round(Number(x.line) || 1)), s.he.length),
    })).slice(0, 10);
  } catch { questions = []; }
  if (!questions.length) throw new Error('The questions did not come back in the right form.'); // not kept: tried again next time
  return { questions };
}

const cached = (ref: string) => keep('review-v2-opus', ref, () => makeReview(ref), (r) => !r.questions.length);

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ questions: [] });
  try { return NextResponse.json(await cached(ref)); }
  catch (e) { return NextResponse.json({ questions: [], error: (e as Error).message }); }
}
