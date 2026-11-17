import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText, endOfPrevious } from '@/lib/sefaria';
import { runAnthropic } from '@/lib/llm/anthropic';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';
import { sectionText } from '@/lib/guideText';

export const runtime = 'nodejs';
export const maxDuration = 180;

// Learn with me, line by line (Nov 15): for every line of the section, one short sentence of where we are (what this
// line is doing), and on some lines — every few, and the real turning points — one question to ask the learner. One
// call for the whole section, made once and kept.
const PROMPT = `You are a warm, sharp chavrusa leading a learner through a section of a sefer, line by line, while he reads it inside.
You get the whole section with numbered lines. Return JSON only: an array with one object per line, in order:
[{"n": 1, "where": "...", "ask": "...", "hint": "..."}, ...]
- where: ONE short sentence (under 20 words) saying what this line is doing in the flow — "The Gemara asks why the Mishnah needed both cases", "Now he brings a proof from the beraisa", "Here comes the answer: …". Guide him; do not translate the line.
- ask: only on about one line in three, and on the real turning points (a question, a contradiction, a proof that seems to fail, a surprising ruling): ONE short question to get him thinking about THIS line before he reads the explanation ("What's bothering the Gemara here?", "Why isn't the first proof enough?"). Answerable from this line and what came before. On other lines leave it "" .
- hint: when there is an ask, one short sentence nudging toward the answer without giving it; otherwise "".
Every line gets an object. Write quoted Hebrew or Aramaic words in Hebrew letters. No markdown.`;

type Row = { n: number; where: string; ask: string; hint: string };

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || /^Mine /.test(ref)) return NextResponse.json({ lines: [] });
  try {
    const out = await keep('guide-lines-v1', ref, async () => {
      await needCredit();
      const s = await getText(ref, await approvedList());
      if (!s.verdict.allowed || !s.he.length) return { lines: [] as Row[] };
      const model = await keptModel();
      const r = await runAnthropic({
        lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref} (${s.he.length} lines)${await endOfPrevious(ref, 1, await approvedList())}\n\n${sectionText(s.he, s.en, 30000)}` }],
        tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: Math.min(6000, 300 + s.he.length * 110),
      });
      await logCost({ sessionId: null, kind: 'guide-lines', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
      const arr = parseAiJson(r.text, '[') as Partial<Row>[];
      const str = (x: unknown, m: number) => String(x ?? '').replace(/\*/g, '').trim().slice(0, m);
      const lines = (Array.isArray(arr) ? arr : []).map((x, i) => ({ n: Number(x.n) || i + 1, where: str(x.where, 300), ask: str(x.ask, 400), hint: str(x.hint, 300) }))
        .filter((x) => x.n >= 1 && x.n <= s.he.length);
      if (lines.length < Math.min(3, s.he.length)) throw new Error('The guide did not come back.');
      return { lines };
    }, (x) => !x.lines.length);
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ lines: [], error: (e as Error).message }); }
}
