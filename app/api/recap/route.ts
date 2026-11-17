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

// "Where was I?" (Nov 16; upgraded Nov 17 to "I lost the thread"): for someone whose mind wandered off. In two or three
// plain sentences: the question on the table, whose position the current line gives and how it fits; the few words
// in the text it is about (the app lights them up); and one short question to get him thinking again. Kept per line.
const PROMPT = `A learner drifted off while learning and is coming back. You get an amud / perek with numbered lines; he is at the line marked >>> <<<.
Answer in JSON only, exactly this shape:
{"where": "...", "words": [{"line": 7, "phrase": "..."}], "ask": "..."}
- "where": 2 or 3 short, plain sentences (at most 60 words), as a friend would say it: what question is on the table here, whose position or step the marked line gives (the Gemara asks, Rav Chisda answers, a braisa is brought as a proof…), and how it fits. Don't give away what comes after this line. Learning terms he knows may stay in Hebrew letters.
- "words": 1 to 3 short phrases (2 to 6 words each) copied EXACTLY, letter for letter, from the Hebrew/Aramaic of the marked line or the line or two before it, without vowels: the words your "where" is about (the question, the name of who says it). "line" is that line's number.
- "ask": ONE short question (at most 15 words) that gets him thinking about the marked line again, without the answer.`;

type Recap = { text: string; words?: { line: number; phrase: string }[]; ask?: string };
async function makeRecap(base: string, n: number): Promise<Recap> {
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
  const r = await runAnthropic({ lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}, he is at line ${n}\n\n${lines.slice(-20000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 700 });
  await logCost({ sessionId: null, kind: 'recap', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const raw = r.text.trim();
  let out: Recap = { text: '' };
  try {
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const words = Array.isArray(j.words) ? j.words.filter((w: { line: unknown; phrase: unknown }) => Number(w?.line) >= 1 && Number(w?.line) <= n && typeof w?.phrase === 'string' && w.phrase.trim()).slice(0, 3).map((w: { line: number; phrase: string }) => ({ line: Number(w.line), phrase: String(w.phrase).trim().slice(0, 80) })) : [];
    out = { text: String(j.where ?? '').replace(/\s+/g, ' ').trim().slice(0, 600), words, ask: String(j.ask ?? '').trim().slice(0, 160) || undefined };
  } catch { out = { text: raw.replace(/\s+/g, ' ').slice(0, 600) }; }
  if (out.text.length < 20) throw new Error('The recap did not come back.');
  return out;
}

// GET ?ref=Yoma 6a:7
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || /^Mine /.test(ref)) return NextResponse.json({ text: '' });
  try { return NextResponse.json(await keep('recap-v2', ref, () => makeRecap(m[1], Number(m[2])), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ text: '', error: (e as Error).message }); }
}
