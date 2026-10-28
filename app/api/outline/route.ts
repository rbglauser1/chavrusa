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

// The outline of an amud / perek: each "move" (a question, an answer, a proof, a new opinion…) summarized in one line,
// to show above the line where it begins. Made once per amud by the AI and then kept (so it costs once, not each time).
const PROMPT = `You outline a section of Gemara, Mishnah or another sefer for a learner, so that a one-line heading can be shown above the line where each step begins.
Divide the numbered lines into its moves: a statement or din, a question (kashya), an answer (teirutz), a proof, a rejection, a new opinion, a story, a conclusion. Give each move the number of the line where it begins and a summary of at most 14 words, in plain modern English, for example "The Gemara asks: why does the Mishnah begin with the evening Shema?" Several moves may begin on the same line. Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Rav Yehudah, Tosafos), say Hashem for G-d's Name, and add nothing that is not in the text.
Reply with JSON only, no other words: [{"line": 1, "summary": "..."}, ...] in order.`;

type Move = { line: number; summary: string };

async function makeOutline(ref: string): Promise<{ moves: Move[]; usd: number }> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { moves: [], usd: 0 };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  const usd = costUsd(model, r.inputTokens, r.outputTokens);
  await logCost({ sessionId: null, kind: 'outline', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: usd }).catch(() => {});
  const json = r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]';
  let moves: Move[] = [];
  try {
    moves = (JSON.parse(json) as Move[])
      .filter((m) => m && Number.isFinite(Number(m.line)) && typeof m.summary === 'string')
      .map((m) => ({ line: Math.min(Math.max(1, Math.round(Number(m.line))), s.he.length), summary: m.summary.trim().slice(0, 160) }));
  } catch { moves = []; }
  return { moves, usd };
}

// Kept for a month on the server: the same amud's outline is never paid for twice.
const cached = (ref: string) => unstable_cache(() => makeOutline(ref), ['outline-v1', ref], { revalidate: 60 * 60 * 24 * 30 })();

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
