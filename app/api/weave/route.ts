import { NextRequest, NextResponse } from 'next/server';
import { costUsd, styleForChat } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { pairPhrases, voicePhrases } from '@/lib/interlinear';
import { runAnthropic } from '@/lib/llm/anthropic';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';
import { SCOPE } from '@/lib/scope';

export const runtime = 'nodejs';
export const maxDuration = 120;

// "Learn with me", woven (Nov 18, rebuilt at the learner's request): a panel rising to 3/4 of the screen brings the
// line phrase by phrase, each with its English and a short explanation woven in; "Go deeper" on a phrase opens more
// (Rashi, Tosafos, the sevara); now and then, at a real turning point, one question with a hint.
// GET ?ref=Yoma 6b&n=3 → { phrases: [{ he, en, note, ask?, hint? }] }, made once per line and kept.
// POST { ref, n, k } → { text }: "Go deeper" on phrase k, made once per phrase and kept.
const PROMPT = `You are a warm, sharp chavrusa learning a sefer with the learner, one line at a time, phrase by phrase, the way a rebbi learns inside: read a few words, translate, explain, go on.
You get the text with numbered lines; the line you are learning now is marked >>> <<<, and under it its phrases, numbered. For EACH phrase, in order, return:
- "en": a short literal translation of the phrase (keep the given one if it is good);
- "note": the explanation woven in, 1 or 2 short sentences (at most 40 words): what this phrase means and is doing, filling in what the terse words leave unsaid the way Rashi and the standard meforshim explain. Do not just repeat the translation. A phrase that is only a connector or a name may get a very short note.
- At most ONE phrase in the whole line, and only if the line has a real turning point (a question, a contradiction, a proof, a surprising ruling or a turn), may also have "ask": one short question to get him thinking at that point, and "hint": one short sentence nudging toward the answer without giving it. Most lines have none.
Reply with JSON only: {"phrases": [{"en": "...", "note": "...", "ask": "...", "hint": "..."}, ...]}, exactly one entry per phrase, in order. For learning terms and quoted words write the Hebrew or Aramaic in Hebrew letters. Use yeshivish Ashkenazi transliteration for names (Rav Yehudah, Tosafos). No markdown.`;

const DEEP = `You are a warm, sharp chavrusa. The learner asked to go deeper on one phrase of the line marked >>> <<<. In 3 to 6 sentences (at most 120 words) go deeper on that phrase: what Rashi or Tosafos (or the standard meforshim on this sefer) say on it, the sevara behind it, and what question it answers or raises. Only what is truly there; plain prose, no markdown, no lists. Hebrew terms in Hebrew letters; yeshivish Ashkenazi names.`;

const context = (he: string[], en: string[], n: number) => {
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  return he.map((h, i) => {
    if (Math.abs(i + 1 - n) > 4) return '';
    const mk = i + 1 === n;
    return `[${i + 1}] ${mk ? '>>> ' : ''}${clip(stripNikud(h), 900)}${mk ? ' <<<' : ''}${en[i] ? `\n    ${clip(en[i], 700)}` : ''}`;
  }).filter(Boolean).join('\n');
};

type Phrase = { he: string; en: string; note: string; ask?: string; hint?: string };

async function phrasesOf(ref: string, n: number) {
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he[n - 1]) return null;
  const he = s.he[n - 1], en = s.en[n - 1] ?? '';
  const pairs = pairPhrases(he, (s as { enB?: string[] }).enB?.[n - 1], en);
  const list = pairs?.length ? pairs.map((p) => ({ he: p.he, en: p.en.replace(/[\u0002\u0003]/g, '') })) : voicePhrases(he).map((h) => ({ he: h, en: '' }));
  return { s, list: list.length ? list : [{ he, en }] };
}

async function makeWeave(ref: string, n: number): Promise<{ phrases: Phrase[] }> {
  await needCredit();
  const got = await phrasesOf(ref, n);
  if (!got) return { phrases: [] };
  const { s, list } = got;
  const st = await getSettings();
  const model = await keptModel();
  const ask = `${s.ref}, line ${n}\n\n${context(s.he, s.en, n)}\n\nThe phrases of line ${n}:\n${list.map((p, i) => `(${i + 1}) ${stripNikud(p.he)}${p.en ? `  —  ${p.en}` : ''}`).join('\n')}`;
  const r = await runAnthropic({ lang: true, model: model.id, system: `${PROMPT}\n\n${styleForChat(st)}\n\n${SCOPE}`, history: [{ role: 'user', content: ask }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 6000 });
  await logCost({ sessionId: null, kind: 'weave', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const j = (() => { try { return parseAiJson<{ phrases?: { en?: string; note?: string; ask?: string; hint?: string }[] }>(r.text, '{'); } catch { return null; } })();
  const out = j?.phrases ?? [];
  if (!out.length) throw new Error('The learning did not come back in the right form.');
  return {
    phrases: list.map((p, i) => {
      const o = out[i] ?? {};
      return { he: p.he, en: (o.en || p.en || '').trim(), note: (o.note ?? '').trim(), ...(o.ask ? { ask: o.ask.trim(), hint: (o.hint ?? '').trim() } : {}) };
    }),
  };
}

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? ''), n = Number(req.nextUrl.searchParams.get('n'));
  if (!ref || !n || / on /i.test(ref)) return NextResponse.json({ error: 'Nothing to learn here.' }, { status: 400 });
  try { return NextResponse.json(await keep('weave-v1', `${ref}:${n}`, () => makeWeave(ref, n), (x) => !x.phrases.length)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

async function makeDeep(ref: string, n: number, k: number): Promise<{ text: string }> {
  await needCredit();
  const got = await phrasesOf(ref, n);
  if (!got || !got.list[k]) return { text: '' };
  const model = await keptModel();
  const ask = `${got.s.ref}, line ${n}\n\n${context(got.s.he, got.s.en, n)}\n\nGo deeper on this phrase of line ${n}: ${stripNikud(got.list[k].he)}`;
  const r = await runAnthropic({ lang: true, model: model.id, system: `${DEEP}\n\n${SCOPE}`, history: [{ role: 'user', content: ask }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'weave-deep', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/\*\*|__/g, '').trim();
  if (text.length < 40) throw new Error('It did not come back.');
  return { text };
}

export async function POST(req: NextRequest) {
  const { ref, n, k } = await req.json().catch(() => ({}));
  if (!ref || !n || k == null) return NextResponse.json({ error: 'Nothing to go deeper on.' }, { status: 400 });
  try { return NextResponse.json(await keep('weave-deep-v1', `${ref}:${n}:${k}`, () => makeDeep(String(ref), Number(n), Number(k)), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
