import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { keep } from '@/lib/keep';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Review questions (Settings → Extras): questions on an amud or perek for the learner to test himself, each with a
// short answer (hidden until he taps) and the line it is about. Made by the AI once per amud / perek and kept for good.
const PROMPT = `You write review questions on a text a learner has learned, so he can test himself.
Write 5 to 8 questions in plain, clear English, in the order of the text, that check he understood it: what is asked and why, how it is answered, what each opinion holds and its reason, what is proven, and where it ends up. Not trivia. No Hebrew or Aramaic words spelled out in English letters, except names of people and books (Rashi, Rav Pappa, Moses); call God "Hashem". Explain according to Chazal and the classic meforshim.
For each: "q" (the question, at most 25 words), "a" (its answer, 1 to 2 sentences), "line" (the numbered line it is about).
Reply with JSON only: [{"q": "...", "a": "...", "line": 1}, ...]`;

export type Question = { q: string; a: string; line: number };

async function makeReview(ref: string): Promise<{ questions: Question[] }> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { questions: [] };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'review', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  let questions: Question[] = [];
  try {
    const arr = JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    questions = (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string').map((x) => ({
      q: String(x.q).trim().slice(0, 300), a: String(x.a).trim().slice(0, 600),
      line: Math.min(Math.max(1, Math.round(Number(x.line) || 1)), s.he.length),
    })).slice(0, 10);
  } catch { questions = []; }
  if (!questions.length) throw new Error('The questions did not come back in the right form.'); // not kept: tried again next time
  return { questions };
}

const cached = (ref: string) => unstable_cache(() => keep('review-v1', ref, () => makeReview(ref)), ['review-v1', ref], { revalidate: 60 * 60 * 24 * 30 })();

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ questions: [] });
  try { return NextResponse.json(await cached(ref)); }
  catch (e) { return NextResponse.json({ questions: [], error: (e as Error).message }); }
}
