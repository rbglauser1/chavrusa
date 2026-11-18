import { NextRequest, NextResponse } from 'next/server';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 90;

// Teasers (Nov 17, Focus help): small pop-ups that draw the learner into the exact text, the way a chavrusa would.
// One AI call per amud / perek / chapter makes all of them, kept, so every later visit is free. The page shows them
// one at a time, only at natural moments (opening the page, reaching a line), never more than one every few minutes.
const PROMPT = `You prepare a few short "teasers" for a learner about to learn this text, the way a good chavrusa draws someone in. Orthodox perspective only. You get the text with numbered lines.
Answer in JSON only, exactly this shape:
{"hook": "...", "items": [{"line": 3, "kind": "guess", "text": "...", "answer": "...", "answerLine": 4, "words": "..."}]}
- "hook": ONE intriguing question or idea (at most 18 words) about what this page is about, to make him want to start. No answer.
- "items": MANY teasers: about one for every two or three lines (at least 8, up to 16 on a long page), each tied to ONE line, in line order, spread evenly through the whole text, with a good mix of kinds. Kinds:
  - "guess": the line ASKS a question that a later line answers. "text": invite him to answer it himself (at most 22 words). "answer": the answer in at most 30 words. "answerLine": the line with the answer.
  - "notice": a surprising word, a repetition, or a tension with an earlier line, as a question (at most 22 words).
  - "rishon": a well-known question of Rashi, Tosafos or another Rishon on this line, as a teaser question, without the answer (at most 22 words). Only one you are sure of.
  - "practice": only where the line leads to a halacha practiced today: one sentence on how it plays out, from accepted Orthodox halacha (at most 30 words).
  - "change": only in a Mishnah with two similar cases: which detail changed between them? (at most 22 words).
  - "rashi": only in Chumash, on a pasuk that Rashi comments on: what in the wording caught Rashi's attention? (at most 22 words).
- "words": 2 to 5 words copied EXACTLY, letter for letter, from that line's Hebrew/Aramaic, without vowels: the words the teaser is about.
Write every "hook", "text" and "answer" in plain ENGLISH (unless the instructions at the end ask for another language), even though the text is Hebrew and Aramaic; only the quoted words and well-known learning terms stay in Hebrew letters. Never invent sources or quotes.`;

type Item = { line: number; kind: string; text: string; answer?: string; answerLine?: number; words?: string };
type Teasers = { hook: string; items: Item[] };
const KINDS = new Set(['guess', 'notice', 'rishon', 'practice', 'change', 'rashi']);

async function make(ref: string): Promise<Teasers> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { hook: '', items: [] };
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 600)}${s.en[i] ? `\n    ${clip(s.en[i], 600)}` : ''}`).join('\n');
  const model = await keptModel();
  const r = await runKept({ lang: true, model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 40000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 4000 });
  await logCost({ sessionId: null, kind: 'teasers', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const raw = r.text.trim();
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const n = s.he.length;
  const items: Item[] = (Array.isArray(j.items) ? j.items : [])
    .filter((x: Item) => KINDS.has(String(x?.kind)) && Number(x?.line) >= 1 && Number(x?.line) <= n && typeof x?.text === 'string' && x.text.trim())
    .slice(0, 18)
    .map((x: Item) => ({
      line: Number(x.line), kind: String(x.kind), text: String(x.text).trim().slice(0, 240),
      ...(x.kind === 'guess' && x.answer ? { answer: String(x.answer).trim().slice(0, 300), answerLine: Math.min(n, Math.max(Number(x.line), Number(x.answerLine) || Number(x.line) + 1)) } : {}),
      ...(x.words ? { words: String(x.words).trim().slice(0, 60) } : {}),
    }));
  const out = { hook: String(j.hook ?? '').trim().slice(0, 200), items };
  if (!out.hook && !items.length) throw new Error('No teasers came back.');
  return out;
}

// GET ?ref=Yoma 6a
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').replace(/:\d+(-\d+)?$/, '').trim();
  if (!ref || /^Mine /.test(ref)) return NextResponse.json({ hook: '', items: [] });
  try { return NextResponse.json(await keep('teasers-v3', ref, () => make(ref), (x) => !x.hook && !x.items.length)); }
  catch (e) { return NextResponse.json({ hook: '', items: [], error: (e as Error).message }); }
}
