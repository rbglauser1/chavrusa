import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { runAnthropic } from '@/lib/llm/anthropic';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';
import { sectionText } from '@/lib/guideText';

export const runtime = 'nodejs';
export const maxDuration = 90;

// Learn with me, the opening (Nov 15): a short hook that gets the learner into the sugya or the sefer — the puzzle or
// big question this section deals with, why it matters, and one thing to watch for as he reads. Made once, kept.
const PROMPT = `You are a warm, brilliant chavrusa about to learn a section of a sefer with the learner. Before reading a word, you get him into it: a short opening that excites his mind and curiosity, the way a great maggid shiur opens a sugya.
You get the whole section with numbered lines. Return JSON only:
{"hook": "...", "watch": "..."}
- hook: 3 or 4 short sentences (never more than 4). Open with the puzzle, the tension or the big question this section is wrestling with (often a question the learner would never have thought to ask, or something that seems obvious and isn't). Say in a sentence why it matters. Do NOT give away the answer or summarize the section — leave him wanting to find out. Plain, lively, no clichés ("fascinating", "delve", "journey"), no headings.
- watch: one sentence: one specific thing to watch for as he reads (a word, a move, a proof), phrased to make him look for it.
Write the Hebrew or Aramaic of a quoted word in Hebrew letters. No markdown.`;

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || /^Mine /.test(ref)) return NextResponse.json({ hook: '' });
  try {
    const out = await keep('guide-intro-v1', ref, async () => {
      await needCredit();
      const s = await getText(ref, await approvedList());
      if (!s.verdict.allowed || !s.he.length) return { hook: '', watch: '' };
      const model = await keptModel();
      const r = await runAnthropic({
        lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${sectionText(s.he, s.en)}` }],
        tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 700,
      });
      await logCost({ sessionId: null, kind: 'guide-intro', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
      const d = parseAiJson(r.text, '{') as { hook?: unknown; watch?: unknown };
      const hook = String(d.hook ?? '').replace(/\*\*/g, '').trim().slice(0, 1400);
      if (!hook) throw new Error('The opening did not come back.');
      return { hook, watch: String(d.watch ?? '').replace(/\*\*/g, '').trim().slice(0, 500) };
    }, (x) => !x.hook);
    const clean = (t: string) => t.replace(/\*+([^*]+)\*+/g, '$1').replace(/\*/g, '');
    return NextResponse.json({ hook: clean(out.hook), watch: clean(out.watch) });
  } catch (e) { return NextResponse.json({ hook: '', error: (e as Error).message }); }
}
