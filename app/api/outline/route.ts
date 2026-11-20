import { clipWords } from '@/lib/clip';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { keep } from '@/lib/keep';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';
import { aiLang, parseAiJson } from '@/lib/aiLang';
import { AWAKE_STEPS, customBlock, toneNow, toneTail } from '@/lib/tone';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The outline of an amud / perek: each "move" (a question, an answer, a proof, a new opinion…) summarized in one line,
// to show above the line where it begins. Made once per amud by the AI and then kept (so it costs once, not each time).
const PROMPT = `You outline a section of Gemara, Mishnah or another sefer for a learner, so that a one-line heading can be shown above the line where each step begins.
Divide the numbered lines into its moves: a statement or din, a question (kashya), an answer (teirutz), a proof, a rejection, a new opinion, a story, a conclusion. Give each move the number of the line where it begins and a summary of at most 14 words, in plain modern English, for example "The Gemara asks: why does the Mishnah begin with the evening Shema?" Several moves may begin on the same line. Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Rav Yehudah, Tosafos), say Hashem for G-d's Name, and add nothing that is not in the text.
Reply with JSON only, no other words: [{"line": 1, "summary": "..."}, ...] in order.`;

type Move = { line: number; summary: string };

async function makeOutline(ref: string, awake = false, custom: string | null = null): Promise<{ moves: Move[]; usd: number }> {
  await needCredit(); // credits on and none left: nothing new is made (what was made before still opens)
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { moves: [], usd: 0 };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = await keptModel(); // Opus or Sonnet, by the setting (lib/keptModel)
  const run = runKept;
  const r = await run({
    lang: true, model: model.id, system: custom ? `${PROMPT}\n\n${customBlock(custom, 'the step headings (still short, one line each)')}` : awake ? `${PROMPT}\n\n${AWAKE_STEPS}` : PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}${toneTail({ awake, custom })}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  const usd = costUsd(model, r.inputTokens, r.outputTokens);
  await logCost({ sessionId: null, kind: 'outline', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: usd }).catch(() => {});
  // (Nov 18: parsed the forgiving way, ר"ש-style quotes inside the Hebrew included, and an object holding the list too.)
  const list = (): Move[] => {
    try { return parseAiJson<Move[]>(r.text, '['); } catch { /* */ }
    const o = parseAiJson<Record<string, unknown>>(r.text, '{');
    return (Object.values(o).find(Array.isArray) as Move[] | undefined) ?? [];
  };
  let moves: Move[] = [];
  try {
    moves = list()
      .filter((m) => m && Number.isFinite(Number(m.line)) && typeof m.summary === 'string')
      .map((m) => ({ line: Math.min(Math.max(1, Math.round(Number(m.line))), s.he.length), summary: clipWords(m.summary, 220) }));
  } catch { moves = []; }
  if (!moves.length) throw new Error('The summary did not come back in the right form.'); // not kept: tried again next time
  return { moves, usd };
}

// Kept for good (lib/keep): the same amud's outline is never paid for twice. Inside, the server's month cache, so a
// copy made before is moved into the store for free.
// (Nov 17: the server's month cache is kept per language too, or a Hebrew outline came back when English was asked.)
const cached = async (ref: string): Promise<Awaited<ReturnType<typeof makeOutline>>> => { const lang = await aiLang(); const t = await toneNow(); const kind = t.custom ? `outline-${t.tag}` : t.awake ? 'outline-awake-v2' : 'outline-v3-opus'; return keep(kind, ref, () => unstable_cache(() => makeOutline(ref, t.awake, t.custom), [kind, lang, ref], { revalidate: 60 * 60 * 24 * 30 })()); };

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
