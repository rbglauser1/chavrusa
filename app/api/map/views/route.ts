import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { clipWords } from '@/lib/clip';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 120;

// "Who holds what" in the sugya map: each machlokes of the amud / perek as a small table: what the dispute is about,
// and for each side who it is, what he holds, his reason, and the verse or source he learns it from. Made once per
// amud by the AI when the learner first taps it, then kept (lib/keep). Only what the text itself says.
const PROMPT = `You lay out the disputes (machlokes) in a section of Gemara, Mishnah or another sefer for a learner, as tables of who holds what.
You get the text with numbered lines. Find each real dispute in it: two or more opinions on the same question (Tannaim, Amoraim, Beis Shammai and Beis Hillel, two versions, two answers that argue). Not a question and its answer; not a statement nobody argues with. Usually 0 to 4 in an amud.
For each dispute give:
- "question": what they argue about, as one clear question (at most 20 words).
- "line": the numbered line where the dispute begins.
- "sides": each opinion (2 to 4): "who" (as the text names him: "Rabbi Yehudah", "the Sages", "the first Tanna", "Rav", "the first version"), "holds" (what he says, one short sentence), "reason" (his reason as the text or Rashi gives it, one short sentence; empty if the text gives none), "source" (the verse or teaching he learns it from, a few words; empty if none).
- "halacha": if this text itself says whom the halacha follows, one short sentence; otherwise empty. Do not rule from your own knowledge.
Only what this text says and its plain meaning according to Rashi; never invent an opinion, a reason or a source. Write in plain, clear English; learning terms a yeshiva learner knows and words the text learns from in Hebrew letters (גזירה שוה, קל וחומר); names in English (Rabbi Yochanan, Rav Pappa). Call God "Hashem".
Reply with JSON only: {"disputes": [{"question": "...", "line": 1, "sides": [{"who": "...", "holds": "...", "reason": "...", "source": "..."}], "halacha": ""}]}. No dispute in the text: {"disputes": []}.`;

type Side = { who: string; holds: string; reason: string; source: string };
type Dispute = { question: string; line: number; sides: Side[]; halacha: string };

async function makeViews(ref: string): Promise<{ disputes: Dispute[]; made: boolean }> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { disputes: [], made: false };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = await keptModel();
  const r = await runAnthropic({ lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'mapviews', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const str = (x: unknown, max: number) => clipWords(x, max);
  let d: { disputes?: unknown };
  try { d = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch { throw new Error('The table did not come back in the right form.'); }
  if (!Array.isArray(d.disputes)) throw new Error('The table did not come back in the right form.');
  const n = s.he.length;
  const disputes: Dispute[] = d.disputes.filter((x) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({
    question: str(x.question, 200), line: Math.min(Math.max(1, Math.round(Number(x.line) || 1)), n), halacha: str(x.halacha, 240),
    sides: (Array.isArray(x.sides) ? x.sides : []).filter((y) => y && typeof y === 'object').map((y: Record<string, unknown>) => ({ who: str(y.who, 60), holds: str(y.holds, 260), reason: str(y.reason, 260), source: str(y.source, 160) })).filter((y) => y.who && y.holds).slice(0, 5),
  })).filter((x) => x.question && x.sides.length >= 2).slice(0, 6);
  return { disputes, made: true };
}

// GET ?ref=Yoma 6a
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ disputes: [] });
  // "No dispute here" is a real answer and is kept; only a text that couldn't be read is not.
  try { return NextResponse.json(await keep('map-views-v1', ref, () => makeViews(ref), (x) => !x.made)); }
  catch (e) { return NextResponse.json({ disputes: [], error: (e as Error).message }); }
}
