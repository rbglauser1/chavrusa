import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd, styleForChat } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText, endOfPrevious } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';
import { SCOPE } from '@/lib/scope';
import { toneNow, customBlock, AWAKE_REPLY, unlabel } from '@/lib/tone';

export const runtime = 'nodejs';
export const maxDuration = 120;

// "Learn with me" (components/LearnWithMe.tsx), Nov 15: the chavrusa leads the learner through the sefer one line at a
// time. Per line it has a question to ask him before explaining (to get him thinking), a hint, and — only where the line
// is a real turning point — a kashya with its teretz. Made once per line, ever, and kept (lib/keep), like Explain.
// POST: he answered the question; the chavrusa answers him back, short (not kept: it's his own answer).
const PROMPT = `You are a warm, sharp chavrusa leading a learner through a sefer one line at a time. You are about to learn the line marked >>> <<< with him.
You get the text with numbered lines. Return JSON only:
{"question": "...", "hint": "...", "kashya": null}
- question: ONE short question (one sentence) you ask him about this line BEFORE explaining it, to get him thinking and engaged: what is this line adding, why is it needed, what does a key word mean here, what would you have thought, how does it fit what came before. It must be answerable by thinking about this line and what came before — never trivia, never about later lines. Plain and friendly, the way a chavrusa asks across the table.
- hint: one short sentence that nudges him toward the answer without giving it away.
- kashya: only when this line is a real turning point (a question, a contradiction, a proof that seems to fail, a surprising ruling or a change of direction), an object {"q": "a sharp kashya on the line, one or two sentences", "teretz": "the answer, two or three sentences"}; otherwise null. Most lines get null.
For learning terms and words quoted from the text, write the Hebrew or Aramaic in Hebrew letters. No markdown.`;

const REPLY = `You are a warm, sharp chavrusa learning one line of a sefer with the learner. You asked him a question about the line marked >>> <<< and he answered.
Answer him in about 30 to 50 words (2 or 3 short sentences), like a chavrusa across the table: first say plainly what he got right (if anything — never false praise), then gently fix or complete what is missing, so he ends up with the right understanding of the line. If he said he doesn't know, just explain it simply and kindly. No headings, no lists, no markdown. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;

const lineText = (he: string[], en: string[], n: number) => {
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  return he.map((h, i) => {
    const near = Math.abs(i + 1 - n) <= 5;
    if (!near && i + 1 > n) return ''; // what comes later is not shown: the question is about here and before
    const mk = i + 1 === n;
    return `[${i + 1}] ${mk ? '>>> ' : ''}${clip(stripNikud(h), near ? 900 : 140)}${mk ? ' <<<' : ''}${near && en[i] ? `\n    ${clip(en[i], 900)}` : ''}`;
  }).filter(Boolean).join('\n').slice(0, 20000);
};

type Guide = { question: string; hint: string; kashya: { q: string; teretz: string } | null };

async function makeGuide(base: string, n: number): Promise<Guide> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length || n > s.he.length) return { question: '', hint: '', kashya: null };
  const model = await keptModel();
  const r = await runKept({
    lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}, line ${n}${await endOfPrevious(base, n, approved)}\n\n${lineText(s.he, s.en, n)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 700,
  });
  await logCost({ sessionId: null, kind: 'guide', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const d = parseAiJson(r.text, '{') as { question?: unknown; hint?: unknown; kashya?: { q?: unknown; teretz?: unknown } | null };
  const str = (x: unknown, m: number) => String(x ?? '').replace(/\*\*/g, '').trim().slice(0, m);
  const question = str(d.question, 400);
  if (!question) throw new Error('The question did not come back.'); // not kept: tried again next time
  const k = d.kashya && typeof d.kashya === 'object' && str(d.kashya.q, 10) ? { q: str(d.kashya.q, 500), teretz: str(d.kashya.teretz, 900) } : null;
  return { question, hint: str(d.hint, 300), kashya: k };
}

// GET ?ref=Nefesh HaChayim 2:5  (a line of a section)
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  if (!m || /^Mine /.test(ref)) return NextResponse.json({ question: '' });
  try { return NextResponse.json(await keep('guide-v1', ref, () => makeGuide(m[1], Number(m[2])), (x) => !x.question)); }
  catch (e) { return NextResponse.json({ question: '', error: (e as Error).message }); }
}

// POST { ref, question, answer }: the chavrusa answers what he said.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const ref = String(b.ref ?? '');
    const m = ref.match(/^(.*?):(\d+)$/);
    // Nov 19: "Show answer": he didn't answer and asks to be told; the chavrusa gives the answer plainly.
    const reveal = b.reveal === true;
    const answer = reveal ? '(He didn’t answer. He asks you to tell him the answer: give it plainly and briefly, then one line on why it matters here.)' : String(b.answer ?? '').trim().slice(0, 2000);
    if (!m || !answer) return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 });
    await needCredit();
    const n = Number(m[2]);
    const approved = await approvedList();
    const s = await getText(m[1], approved);
    if (!s.verdict.allowed || !s.he.length) return NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
    const settings = await getSettings();
    const model = MODELS[settings.provider][settings.tier];
    const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
    // Nov 19: his answers in Learn with me are answered in the same tone as the rest of it.
    const t = await toneNow();
    const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your replies')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
    const r = await run({
      lang: true, model: model.id, system: `${REPLY}\n\n${styleForChat(settings)}\n\n${SCOPE}${toneText}`,
      history: [{ role: 'user', content: `${s.ref}, line ${n}${await endOfPrevious(m[1], n, approved)}\n\n${lineText(s.he, s.en, n)}\n\n---\nYou asked: ${String(b.question ?? '').slice(0, 500)}\nHe answered: ${answer}` }],
      tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 500,
    });
    await logCost({ sessionId: null, kind: 'guide-reply', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, ''));
    if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
    return NextResponse.json({ text: text.slice(0, 2000) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
