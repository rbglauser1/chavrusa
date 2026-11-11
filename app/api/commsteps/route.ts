import { NextRequest, NextResponse } from 'next/server';
import { keep } from '@/lib/keep';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 120;

// A meforesh broken into its steps ("Steps" on a Tosafos; with the Steps setting on, on any long meforesh): the same
// words, cut where each step begins (the words it quotes, a question, an answer, a proof, a second answer…), with
// punctuation added, a short label and one line of English for each step. Made once per piece by the AI and kept.
// The words are checked letter by letter against the original: the AI may add punctuation and breaks, never change,
// add or drop a word. If anything differs it is thrown out (and tried once more); nothing wrong is ever kept.
const PROMPT = `You prepare one piece of a classic meforesh (Tosafos, Ramban, Rashba, Ritva, Maharsha, Rashi…) for a learner, so that he sees its structure.
You get the line of the text it is on (for context), then the piece itself.
Divide the piece into its steps, in order, covering every word of it from the first to the last: the words it quotes from the text (the dibbur hamaschil), an explanation, a question, an answer, a proof, a difficulty, a rejection, a second answer, another opinion, a conclusion. A short piece may be 2 steps; a long Tosafos 5 to 10. Do not cut in the middle of a thought.
For each step give:
- "label": 1 to 3 words in English: Quote, Explanation, Question, Answer, Proof, Difficulty, Rejection, Second answer, Another opinion, Conclusion, or the like.
- "he": the words of the step EXACTLY as they stand in the piece: every word, in order, spelled as it is; nothing changed, added, dropped, moved or written out (abbreviations stay abbreviations; no nikud). Add only punctuation between the words: commas, periods, question marks, colons, quotation marks around a quotation.
- "en": one sentence of plain English saying what the step does and says ("He asks: but the Mishnah in Shabbos says the opposite"). Not a word-for-word translation. Learning terms a yeshiva learner knows may be in Hebrew letters. Call God "Hashem".
Reply with JSON only, no other words: [{"label": "...", "he": "...", "en": "..."}, ...]`;

type Step = { label: string; he: string; en: string };
const letters = (s: string) => stripNikud(s.replace(/<[^>]+>/g, '')).replace(/[^א-ת]/g, '');

async function makeSteps(ref: string): Promise<{ steps: Step[] }> {
  await needCredit();
  const approved = await approvedList();
  const c = await getText(ref, approved);
  if (!c.verdict.allowed || !c.he.length) return { steps: [] };
  const piece = c.he.map((h) => stripNikud(h.replace(/<[^>]+>/g, ''))).join(' ').replace(/\s+/g, ' ').trim();
  if (letters(piece).length < 60 || piece.length > 9000) return { steps: [] };
  // The line it is on: "Tosafot on Yoma 6a:3:1" → Yoma 6a, line 3.
  let on = '';
  const m = ref.match(/ on (.+?):(\d+)(?::[\d-]+)?$/i);
  if (m) try {
    const b = await getText(m[1], approved);
    const n = Number(m[2]);
    if (b.verdict.allowed && b.he[n - 1]) on = `The line it is on (${b.ref}:${n}):\n${stripNikud(b.he[n - 1]).slice(0, 900)}${b.en[n - 1] ? `\n${b.en[n - 1].slice(0, 900)}` : ''}\n\n`;
  } catch { /* optional */ }
  const model = await keptModel();
  const want = letters(piece);
  let lastErr = 'The steps did not come back in the right form.';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await runAnthropic({
      model: model.id, system: PROMPT,
      history: [{ role: 'user', content: `${on}The piece (${c.ref}):\n${piece}${attempt ? '\n\n(Your last reply changed, added or dropped words. Copy every word exactly, in order.)' : ''}` }],
      tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
    });
    await logCost({ sessionId: null, kind: 'commsteps', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    let arr: unknown = [];
    try { arr = JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch { arr = []; }
    const steps: Step[] = (Array.isArray(arr) ? arr : [])
      .map((x) => ({ label: String(x?.label ?? '').trim().slice(0, 30), he: String(x?.he ?? '').replace(/\s+/g, ' ').trim(), en: String(x?.en ?? '').trim().slice(0, 400) }))
      .filter((x) => x.he);
    if (steps.length < 2) { lastErr = 'This piece is one step.'; continue; }
    // Letter by letter: the same words, in the same order.
    if (letters(steps.map((x) => x.he).join(' ')) !== want) { lastErr = 'The words did not match the original.'; continue; }
    return { steps };
  }
  throw new Error(lastErr); // not kept: tried again next time
}

// GET ?ref=Tosafot on Yoma 6a:3:1
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').slice(0, 200);
  if (!ref || /^Mine /.test(ref)) return NextResponse.json({ steps: [] });
  try { return NextResponse.json(await keep('commsteps-v1', ref, () => makeSteps(ref), (x) => !x.steps.length)); }
  catch (e) { return NextResponse.json({ steps: [], error: (e as Error).message }); }
}
