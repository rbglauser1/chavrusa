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
import { AWAKE_STEPS, customBlock, toneNow, toneTail, unlabel } from '@/lib/tone';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The outline of an amud / perek: each "move" (a question, an answer, a proof, a new opinion…) summarized in one line,
// to show above the line where it begins. Made once per amud by the AI and then kept (so it costs once, not each time).
// Nov 23, at his request: a Step is a PREVIEW of what is coming up, shown above the line where the move begins, so he
// reads the lines knowing what to look for: what the Gemara is about to do (and to whom), the case, and why it matters.
// It does not give away how it is resolved (the text, and Pshat after it, do that). (It was a 14-word heading.)
const PROMPT = `You prepare a learner for each move of a section of Gemara, Mishnah or another sefer: above the line where each move begins, a short PREVIEW of what is coming up, so he reads the lines knowing what to look for.
Divide the numbered lines into its moves: a statement or din, a question (kashya), an answer (teirutz), a proof, a rejection, a new opinion, a story, a conclusion. Several moves may begin on the same line.
For each move write the preview in two or three short sentences, at most 60 words, in plain modern English, the way a chavrusa says "now watch what happens":
1. What is coming up: what the Gemara (or the Tanna, or the pasuk) is about to do, and to whom or to what ("The Gemara now brings a braisa to challenge Rav Nachman's shita that tumah is only pushed aside for a tzibbur.").
2. The case or the content, in a few words ("The braisa describes a kohen who…").
3. Why it matters here: why it is a difficulty, what it proves, or what is at stake ("This is a difficulty because, according to Rav Nachman, …").
Set him up; do NOT give away how it is resolved: the text itself, and the Pshat after it, do that. For a simple move (a plain statement), one or two sentences are enough.
Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Rav Yehudah, Tosafos), write learning terms and quoted words in Hebrew letters (shita, kashya, braisa may stay in English letters), say Hashem for G-d's Name, and add nothing that is not in the text and the standard meforshim.
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
    lang: true, model: model.id, system: custom ? `${PROMPT}\n\n${customBlock(custom, 'the step previews (still short: two or three sentences each, setting him up for what is coming)')}` : awake ? `${PROMPT}\n\n${AWAKE_STEPS}` : PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}${toneTail({ awake, custom })}` }],
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
      .map((m) => ({ line: Math.min(Math.max(1, Math.round(Number(m.line))), s.he.length), summary: clipWords(unlabel(m.summary), 600) }));
  } catch { moves = []; }
  if (!moves.length) throw new Error('The summary did not come back in the right form.'); // not kept: tried again next time
  return { moves, usd };
}

// Kept for good (lib/keep): the same amud's outline is never paid for twice. Inside, the server's month cache, so a
// copy made before is moved into the store for free.
// (Nov 17: the server's month cache is kept per language too, or a Hebrew outline came back when English was asked.)
const cached = async (ref: string): Promise<Awaited<ReturnType<typeof makeOutline>>> => { const lang = await aiLang(); const t = await toneNow(); const kind = t.custom ? `outline4-${t.tag}` : t.awake ? 'outline-awake-v4' : 'outline-v4-opus'; /* v4: previews (Nov 23) */ return keep(kind, ref, () => unstable_cache(() => makeOutline(ref, t.awake, t.custom), [kind, lang, ref], { revalidate: 60 * 60 * 24 * 30 })()); };

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
