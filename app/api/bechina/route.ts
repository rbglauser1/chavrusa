import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';
import { SCOPE } from '@/lib/scope';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Nov 25: Bechina: a test on the Gemara he learned (one amud up to five dafim), with questions on Tosafos too if he
// wants (none / some / mostly Tosafos), multiple choice, written answers, or both, at three levels. The questions are
// made once for each choice of amudim and options and kept (a "New bechina" makes another set). Written answers are
// marked just for him: right, partly, or not yet, with what was missing.
export type BQ = { type: 'mc' | 'open'; on: 'gemara' | 'tosafos'; ref: string; line: number; dh?: string; q: string; options?: string[]; answer: number | string; why: string };

const MAKE = `You are a rosh yeshiva writing a fair, clear bechina (test) on the Gemara a learner has learned. The text of each amud is given below, line by line (Hebrew and English), and, when asked for, the Tosafos on it (each Tosafos with its דיבור המתחיל).
Write exactly COUNT questions, in the order of the text, spread over all the amudim given.
Level: LEVEL.
- basic: what the Gemara asks, answers, proves and concludes; who says what.
- standard: also why: the reasoning of each step, why a question is a question, why an answer works, what each opinion holds and why.
- iyun: also the underlying sevara, the chakira behind a machlokes, what forced a step, the נפקא מינה, how one step fits another.
Tosafos: TOSAFOS.
Kind: FORMAT.
For each question give JSON with:
"type": "mc" (multiple choice) or "open" (he writes the answer);
"on": "gemara" or "tosafos";
"ref": the amud it is on, exactly as given (e.g. "Berakhot 37b");
"line": the numbered line of the Gemara it is about (for Tosafos, the line its דיבור המתחיל is on);
"dh": for Tosafos only, the דיבור המתחיל in Hebrew letters;
"q": the question, clear and precise, at most 40 words;
for "mc": "options": exactly 4 answers, one right and three that a learner who half-learned it might pick (never silly), and "answer": the index (0 to 3) of the right one; vary where the right answer sits;
for "open": "answer": the model answer in 1 to 3 sentences (what a good answer must contain);
"why": 1 to 2 sentences explaining the answer from the text (the line, the word, the reasoning).
Only what the text given says; never invent a source or an opinion. Never ask about line numbers, page layout, or trivia (how many words, which number line). Questions about Tosafos ask about what Tosafos asks, answers, or holds, and why.
Plain clear English; learning terms and quoted words in Hebrew letters (קל וחומר, גזירה שוה, the words of the Gemara); names in English (Rashi, Rav Yosef, Abaye).
Reply with JSON only: [{...}, ...]`;

// Nov 25: a bechina in Hebrew: everything he reads (questions, answers, explanations, the marking) in לשון הקודש.
const HEB = `\n\nLANGUAGE: write the whole bechina in Hebrew (the clear yeshiva Hebrew of a written bechina, with Aramaic quotes of the Gemara as they are): every "q", every option, every "answer" and every "why". Names as in the Gemara (רב יוסף, אביי, רש"י, תוספות). Keep the JSON keys and the "type"/"on"/"ref" values in English exactly as described.`;
const HEB_GRADE = `\n\nLANGUAGE: write the "note" in Hebrew (clear yeshiva Hebrew). He may have answered in Hebrew or English: mark either the same.`;

const GRADE = `You are a fair, warm rosh yeshiva marking one written answer on a bechina. Given: the question, the model answer (what a good answer must contain), the text it is on, and his answer.
Mark it: 2 = right (the main point is there, even in other words or briefer), 1 = partly (part of it, or right idea but a real piece missing or a bit off), 0 = not yet (wrong, or missing the point).
Reply with JSON only: {"score": 0|1|2, "note": "1 to 2 sentences to him: what he got, and what was missing or off (if anything), specific to his answer"}.
Be generous with different wording; strict on substance. Never mark down for spelling or English. Hebrew and Aramaic words in Hebrew letters.`;

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
const plain = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function material(refs: string[], tos: boolean, budget: number) {
  const approved = await approvedList();
  const per = Math.floor(budget / refs.length);
  const parts = await Promise.all(refs.map(async (ref) => {
    const s = await getText(ref, approved).catch(() => null);
    if (!s || !s.verdict.allowed || !s.he.length) return null;
    const enOnly = refs.length > 4; // a long bechina: the English carries it, to keep the size sane
    const g = s.he.map((he, i) => `[${i + 1}] ${enOnly ? '' : clip(stripNikud(he), 500)}${s.en[i] ? `${enOnly ? '' : '\n    '}${clip(plain(s.en[i]), 600)}` : ''}`).join('\n');
    let t = '';
    if (tos) {
      const ts = await getText(`Tosafot on ${ref}`, approved).catch(() => null);
      if (ts && ts.verdict.allowed && ts.he.length) t = ts.he.map((h, i) => `{T${i + 1}} ${clip(stripNikud(plain(h)), 900)}`).join('\n');
    }
    const gPart = clip(g, tos ? Math.floor(per * 0.6) : per);
    return `=== ${s.ref || ref} ===\n${gPart}${t ? `\n--- Tosafos on ${s.ref || ref} ---\n${clip(t, per - gPart.length)}` : ''}`;
  }));
  return parts.filter(Boolean).join('\n\n');
}

async function make(b: { refs: string[]; tosafos: string; format: string; count: number; level: string; set: number; he: boolean }) {
  await needCredit();
  const tos = b.tosafos !== 'none';
  const body = await material(b.refs, tos, 70000);
  if (!body) return { questions: [] as BQ[] };
  const system = MAKE
    .replace('COUNT', String(b.count))
    .replace('LEVEL', b.level === 'basic' ? 'basic' : b.level === 'iyun' ? 'iyun' : 'standard')
    .replace('TOSAFOS', b.tosafos === 'focus' ? 'about two thirds of the questions on Tosafos (the rest on the Gemara).' : b.tosafos === 'some' ? 'about a quarter of the questions on Tosafos (the rest on the Gemara).' : 'none: only the Gemara.')
    .replace('FORMAT', b.format === 'mc' ? 'all "mc".' : b.format === 'open' ? 'all "open".' : 'about half "mc" and half "open", mixed.');
  const model = await keptModel();
  const r = await runKept({
    lang: !b.he, model: model.id, system: `${system}${b.he ? HEB : ''}${b.set > 1 ? `\n\nThis is set ${b.set}: ask about different points than an earlier set would (vary which steps and which Tosafos you ask on).` : ''}\n\n${SCOPE}`,
    history: [{ role: 'user', content: body }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: b.he ? 10000 : 6000,
  });
  await logCost({ sessionId: null, kind: 'bechina', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const arr = parseAiJson(r.text, '[');
  const questions: BQ[] = (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x.q === 'string').map((x) => {
    const mc = x.type === 'mc' && Array.isArray(x.options) && x.options.length >= 2;
    return {
      type: mc ? 'mc' : 'open', on: x.on === 'tosafos' ? 'tosafos' : 'gemara',
      ref: b.refs.includes(String(x.ref)) ? String(x.ref) : b.refs.find((rf) => String(x.ref ?? '').endsWith(rf.split(' ').pop() ?? '')) ?? b.refs[0],
      line: Math.max(1, Math.round(Number(x.line) || 1)), dh: x.dh ? String(x.dh).slice(0, 80) : undefined,
      q: String(x.q).slice(0, 500), options: mc ? x.options.slice(0, 4).map((o: unknown) => String(o).slice(0, 300)) : undefined,
      answer: mc ? Math.min(Math.max(0, Math.round(Number(x.answer) || 0)), Math.min(3, x.options.length - 1)) : String(x.answer ?? '').slice(0, 800),
      why: String(x.why ?? '').slice(0, 600),
    } as BQ;
  }).slice(0, b.count);
  if (!questions.length) throw new Error('The bechina did not come back in the right form.'); // not kept: tried again next time
  return { questions };
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.grade) {
      const g = b.grade as { q?: string; answer?: string; his?: string; ref?: string; line?: number; dh?: string; he?: boolean };
      const his = String(g.his ?? '').trim().slice(0, 2000);
      if (!his) return NextResponse.json({ error: 'Write an answer first.' }, { status: 400 });
      await needCredit();
      const settings = await getSettings();
      const model = MODELS[settings.provider][settings.tier];
      const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
      const s = await getText(String(g.ref ?? ''), await approvedList()).catch(() => null);
      const n = Math.round(Number(g.line) || 1);
      const near = s?.he.length ? s.he.map((h, i) => (Math.abs(i + 1 - n) <= 2 ? `[${i + 1}] ${clip(stripNikud(h), 500)}${s.en[i] ? `\n    ${clip(plain(s.en[i]), 600)}` : ''}` : '')).filter(Boolean).join('\n') : '';
      const r = await run({
        lang: !g.he, model: model.id, system: `${GRADE}${g.he ? HEB_GRADE : ''}\n\n${SCOPE}`,
        history: [{ role: 'user', content: `${g.ref ?? ''}${g.dh ? `, Tosafos ד"ה ${g.dh}` : ''}\n${near}\n\nQuestion: ${String(g.q ?? '').slice(0, 600)}\nModel answer: ${String(g.answer ?? '').slice(0, 900)}\n\nHis answer: ${his}` }],
        tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 400,
      });
      await logCost({ sessionId: null, kind: 'bechina-grade', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
      const d = parseAiJson(r.text, '{') as { score?: unknown; note?: unknown } | null;
      const score = Math.min(2, Math.max(0, Math.round(Number(d?.score) || 0)));
      return NextResponse.json({ score, note: String(d?.note ?? '').slice(0, 600) });
    }
    const refs: string[] = (Array.isArray(b.refs) ? b.refs : []).map((x: unknown) => String(x).replace(/:\d+(-\d+)?$/, '')).filter(Boolean).slice(0, 10);
    if (!refs.length) return NextResponse.json({ error: 'Choose what to be tested on.' }, { status: 400 });
    const opts = {
      refs, tosafos: ['none', 'some', 'focus'].includes(b.tosafos) ? b.tosafos : 'none', format: ['mc', 'open', 'mix'].includes(b.format) ? b.format : 'mix',
      count: [5, 10, 15, 20].includes(Number(b.count)) ? Number(b.count) : 10, level: ['basic', 'standard', 'iyun'].includes(b.level) ? b.level : 'standard',
      set: Math.min(20, Math.max(1, Math.round(Number(b.set) || 1))), he: b.lang === 'he',
    };
    const key = `${refs.join('|')}:${opts.tosafos}:${opts.format}:${opts.count}:${opts.level}:${opts.set}`;
    const out = await keep(opts.he ? 'bechina-he1' : 'bechina1', key, () => make(opts), (x) => !x.questions.length);
    if (!out.questions.length) return NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ error: (e as Error).message || 'The bechina couldn’t be made just now.' }, { status: 502 }); }
}
