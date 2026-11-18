import { clipWords } from '@/lib/clip';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { keep } from '@/lib/keep';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Pshat (Nov 17): the AI says over each move of the Gemara (or the sefer) in its own words, plainly, to show right
// after the line where the move ends. Made once per amud by the AI and then kept (so it costs once, not each time).
const PROMPT = `You are a chavrusa saying over a section of Gemara, Mishnah or another sefer to a learner, plainly, in your own words: the pshat, what the text says and means, so that after reading the words he hears it said over simply.
Divide the numbered lines into its moves (a statement or din, a question, an answer, a proof, a rejection, a new opinion, a story, a conclusion). For each move give the number of the LAST line of the move and the pshat of that move in 1 to 3 short sentences (at most 60 words): what is being said, who says it, and what it means, the way a good rebbi says over a Gemara, for example "Rav Yehudah answers that the Mishnah is talking about a case where..." Fill in what the terse text leaves unsaid only as the standard commentaries (Rashi) explain it. Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Rav Yehudah, Tosafos), say Hashem for G-d's Name, and add no opinions or ideas that are not the pshat.
Reply with JSON only, no other words: [{"line": 3, "pshat": "..."}, ...] in order.`;

type Move = { line: number; pshat: string };

async function makePshat(ref: string): Promise<{ moves: Move[]; usd: number }> {
  await needCredit(); // credits on and none left: nothing new is made (what was made before still opens)
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { moves: [], usd: 0 };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = await keptModel(); // Opus or Sonnet, by the setting (lib/keptModel)
  const run = runAnthropic;
  const r = await run({
    lang: true, model: model.id, system: PROMPT, maxTokens: 8000, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  const usd = costUsd(model, r.inputTokens, r.outputTokens);
  await logCost({ sessionId: null, kind: 'pshat', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: usd }).catch(() => {});
  const json = r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]';
  let moves: Move[] = [];
  try {
    moves = (JSON.parse(json) as Move[])
      .filter((m) => m && Number.isFinite(Number(m.line)) && typeof m.pshat === 'string')
      .map((m) => ({ line: Math.min(Math.max(1, Math.round(Number(m.line))), s.he.length), pshat: clipWords(m.pshat, 600) }));
  } catch { moves = []; }
  if (!moves.length) throw new Error('The pshat did not come back in the right form.'); // not kept: tried again next time
  return { moves, usd };
}

// Kept for good (lib/keep): the same amud's pshat is never paid for twice. Inside, the server's month cache, so a
// copy made before is moved into the store for free.
const cached = (ref: string) => keep('pshat-v1', ref, () => unstable_cache(() => makePshat(ref), ['pshat-v1', ref], { revalidate: 60 * 60 * 24 * 30 })());

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref)) return NextResponse.json({ moves: [] });
  try {
    const { moves } = await cached(ref);
    return NextResponse.json({ moves });
  } catch (e) {
    return NextResponse.json({ moves: [], error: (e as Error).message });
  }
}
