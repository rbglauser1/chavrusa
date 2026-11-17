import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 60;

// "Where was I?" (Nov 16, Focus help): for someone whose mind wandered off, one or two short sentences on what the
// text has been saying up to the line he is on, so he can step back in without rereading. Made once per line, kept.
const PROMPT = `A learner drifted off while learning and is coming back. You get an amud / perek with numbered lines; he is at the line marked >>> <<<.
In 1 or 2 short, plain sentences (at most 45 words), tell him where he is: what the text has been discussing up to this line, and what this line is about to do. Write it as a friend would say it ("You're in the middle of… The Gemara just asked… and now…"). No answers given away beyond this line, no sources, no headings, no lists. Learning terms he knows may stay in Hebrew letters.`;

async function makeRecap(base: string, n: number): Promise<{ text: string }> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length || n > s.he.length) return { text: '' };
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  const lines = s.he.slice(0, Math.min(s.he.length, n + 1)).map((he, i) => {
    const mark = i + 1 === n ? '>>> ' : '', end = i + 1 === n ? ' <<<' : '';
    return `[${i + 1}] ${mark}${clip(stripNikud(he), 500)}${end}${s.en[i] ? `\n    ${clip(s.en[i], 500)}` : ''}`;
  }).join('\n');
  const model = await keptModel();
  const r = await runAnthropic({ lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}, he is at line ${n}\n\n${lines.slice(-20000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 400 });
  await logCost({ sessionId: null, kind: 'recap', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__/g, '').replace(/\n+/g, ' ').trim();
  if (text.length < 20) throw new Error('The recap did not come back.');
  return { text: text.slice(0, 600) };
}

// GET ?ref=Yoma 6a:7
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || /^Mine /.test(ref)) return NextResponse.json({ text: '' });
  try { return NextResponse.json(await keep('recap-v1', ref, () => makeRecap(m[1], Number(m[2])), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ text: '', error: (e as Error).message }); }
}
