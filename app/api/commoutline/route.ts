import { NextRequest, NextResponse } from 'next/server';
import { keep } from '@/lib/keep';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';
import { SCOPE } from '@/lib/scope';

export const runtime = 'nodejs';
export const maxDuration = 90;

// "Outline" on a Tosafos (Nov 13: the learner wants the outline first, before Steps): a short bulleted outline of the
// piece's argument in plain English — main points with smaller points under them. Made once per piece and kept.
const PROMPT = `You make a short outline of one piece of a classic meforesh (usually Tosafos) for a yeshiva learner, to read BEFORE he works through it inside.
You get the line of the Gemara it is on (for context), then the piece itself.
Write a bulleted outline of the piece's argument, in order:
- "- " starts a main point; "  - " (two spaces) starts a smaller point under it.
- 3 to 7 main points, each with 0 to 3 smaller points. Each point is one short line, not a paragraph.
- Follow the piece's own moves: what it is asking about (quote the dibbur hamaschil in Hebrew letters), the question or difficulty, the proof, each answer, any rejection, the conclusion, and any practical difference.
- Say only what the piece itself says. Do not add opinions from elsewhere or your own chiddushim. If something is unclear, keep it general rather than guess.
- Plain English; learning terms a yeshiva learner knows may stay in Hebrew letters (kashya, teretz, ממה נפשך). Call God "Hashem".
Reply with the outline only: no title, no introduction, no closing line.

${SCOPE}`;

async function makeOutline(ref: string): Promise<{ outline: string }> {
  await needCredit();
  const approved = await approvedList();
  const c = await getText(ref, approved);
  if (!c.verdict.allowed || !c.he.length) return { outline: '' };
  const piece = c.he.map((h) => stripNikud(h.replace(/<[^>]+>/g, ''))).join(' ').replace(/\s+/g, ' ').trim();
  if (piece.length < 40 || piece.length > 12000) return { outline: '' };
  let on = '';
  const m = ref.match(/ on (.+?):(\d+)(?::[\d-]+)?$/i);
  if (m) try {
    const b = await getText(m[1], approved);
    const n = Number(m[2]);
    if (b.verdict.allowed && b.he[n - 1]) on = `The line it is on (${b.ref}:${n}):\n${stripNikud(b.he[n - 1]).slice(0, 900)}${b.en[n - 1] ? `\n${b.en[n - 1].slice(0, 900)}` : ''}\n\n`;
  } catch { /* optional */ }
  const en = c.en.length ? `\n\nSefaria's English of the piece (may be missing or loose):\n${c.en.join(' ').replace(/<[^>]+>/g, '').slice(0, 4000)}` : '';
  const model = await keptModel();
  const r = await runAnthropic({
    lang: true, model: model.id, system: PROMPT,
    history: [{ role: 'user', content: `${on}The piece (${c.ref}):\n${piece}${en}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 2000,
  });
  await logCost({ sessionId: null, kind: 'commoutline', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const outline = r.text.split('\n').filter((l) => /^\s*[-•*]\s+\S/.test(l)).map((l) => l.replace(/\s+$/, '').slice(0, 400)).slice(0, 30).join('\n');
  if (!outline) throw new Error('The outline did not come back in the right form.');
  return { outline };
}

// GET ?ref=Tosafot on Yoma 6a:3:1
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').slice(0, 200);
  if (!ref || /^Mine /.test(ref)) return NextResponse.json({ outline: '' });
  try { return NextResponse.json(await keep('commoutline-v1', ref, () => makeOutline(ref), (x) => !x.outline)); }
  catch (e) { return NextResponse.json({ outline: '', error: (e as Error).message }); }
}
