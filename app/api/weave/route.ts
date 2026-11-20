import { NextRequest, NextResponse } from 'next/server';
import { costUsd, styleForChat } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { pairPhrases, voicePhrases } from '@/lib/interlinear';
import { parseAiJson } from '@/lib/aiLang';
import { keep } from '@/lib/keep';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';
import { SCOPE } from '@/lib/scope';
import { AWAKE_DEEP, AWAKE_CHECK, customBlock, toneNow, toneTail } from '@/lib/tone';

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
- "note": the explanation woven in, 1 or 2 short sentences (at most 40 words): what this phrase means and is doing, filling in what the terse words leave unsaid the way the standard meforshim explain (on the Gemara: Rashi; on a Mishnah: the Bartenura; on Chumash: Rashi). Name a meforesh only when you are sure he says it. Do not just repeat the translation. A phrase that is only a connector or a name may get a very short note.
- At most ONE phrase in the whole line, and only if the line has a real turning point (a question, a contradiction, a proof, a surprising ruling or a turn), may also have "ask": one short question to get him thinking at that point, and "hint": one short sentence nudging toward the answer without giving it. Most lines have none.
- Sometimes, where the sugya calls for it, put something BEFORE the text of a phrase, to keep him on his toes and thinking before he reads it: "before": {"kind": "think" | "chakira" | "kashya" | "setup", "text": "..."}. For example: the Gemara could go two ways here, which would you expect? (think); a chakira that this phrase is about to decide; a kashya to hold in mind that the phrase will answer; or, at the start of a new topic, the scene or the question in a sentence or two (setup). At most 40 words, ending with a question or a challenge, and never giving away what the phrase says. Use it on the phrases where it really fits: in most lines one, sometimes two, sometimes none; never on every phrase.
Reply with JSON only: {"phrases": [{"before": {"kind": "...", "text": "..."}, "en": "...", "note": "...", "ask": "...", "hint": "..."}, ...]} ("before", "ask" and "hint" only where used), exactly one entry per phrase, in order. For learning terms and quoted words write the Hebrew or Aramaic in Hebrew letters. Use yeshivish Ashkenazi transliteration for names (Rav Yehudah, Tosafos). No markdown.`;

// Nov 18: "Wake me up" (Settings → The AI → Learn with me's tone): the notes are written to pull him into the text.
const AWAKE = `TONE, WAKE HIM UP: the learner wants to be pulled into the text, not lulled. Write each note with energy, and vary the voice from phrase to phrase, whichever fits that phrase best:
- the rebbi who won't let him coast: loud and loving ("Stop! Read that word again. PERMITTED, not pushed aside!"), urgency in words only;
- the detective: point at the exact word that matters ("Exhibit A: …"), and who is going to pounce on it;
- the sports commentator: the give and take as a match ("Rav Nachman comes out swinging… Rav Sheshes is warming up");
- the storyteller: paint the scene in one or two vivid strokes (the courtyard, the kohen, the crowd);
- dry humor: one light, clever line.
Every note still says what the phrase means and is doing, and ends with a hook: a word to watch, a question hanging in the air, or a cliffhanger into what comes next, so he wants to go on. At most 50 words a note. Always derech eretz: never insult him, never make light of the Tannaim, Amoraim, Hashem or the Torah; the energy is about the learning. In this tone the question ("ask") may come a little more often, but still at most one per line.
Make it unmistakable: most notes should clearly sound like one of these voices, not like a textbook, and use at least two different voices in a line of several phrases. For example, on דְּכׇל טוּמְאַת מֵת בְּצִיבּוּר רַחֲמָנָא שַׁרְיֵיהּ:
- "Stop! Read שַׁרְיֵיהּ again. PERMITTED! Not 'pushed aside': the Torah opened the door. So why would anyone go looking for a tahor kohen? Think before you go on!"
- "Exhibit A: one word, שַׁרְיֵיהּ. Somebody in this sugya is about to pounce on it."
- "And Rav Nachman comes out swinging! Rav Sheshes is on the bench, warming up… you can feel the kashya coming."
- "Picture it: the whole nation in the courtyard, the korban ready, every kohen tamei. Send everyone home? Rav Nachman: 'The Torah said go ahead.'"
- "Rav Nachman just saved the entire avodah with one word. Don't get attached."
${AWAKE_CHECK}`;

const DEEP = `You are a warm, sharp chavrusa. The learner asked to go deeper on one phrase of the line marked >>> <<<. In 3 to 6 sentences (at most 120 words) go deeper on that phrase: what the standard meforshim on this sefer say on it (on the Gemara: Rashi and Tosafos; on a Mishnah: the Bartenura and Tosafos Yom Tov; on Chumash: Rashi and the Ramban), naming one only when you are sure he says it, the sevara behind it, and what question it answers or raises. Only what is truly there; plain prose, no markdown, no lists. Hebrew terms in Hebrew letters; yeshivish Ashkenazi names.`;

const context = (he: string[], en: string[], n: number) => {
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  return he.map((h, i) => {
    if (Math.abs(i + 1 - n) > 4) return '';
    const mk = i + 1 === n;
    return `[${i + 1}] ${mk ? '>>> ' : ''}${clip(stripNikud(h), 900)}${mk ? ' <<<' : ''}${en[i] ? `\n    ${clip(en[i], 700)}` : ''}`;
  }).filter(Boolean).join('\n');
};

type Phrase = { he: string; en: string; note: string; ask?: string; hint?: string; before?: { kind: string; text: string } };

async function phrasesOf(ref: string, n: number) {
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he[n - 1]) return null;
  const he = s.he[n - 1], en = s.en[n - 1] ?? '';
  const pairs = pairPhrases(he, (s as { enB?: string[] }).enB?.[n - 1], en);
  const list = pairs?.length ? pairs.map((p) => ({ he: p.he, en: p.en.replace(/[\u0002\u0003]/g, '') })) : voicePhrases(he).map((h) => ({ he: h, en: '' }));
  return { s, list: list.length ? list : [{ he, en }] };
}

async function makeWeave(ref: string, n: number, awake = false, custom: string | null = null): Promise<{ phrases: Phrase[] }> {
  await needCredit();
  const got = await phrasesOf(ref, n);
  if (!got) return { phrases: [] };
  const { s, list } = got;
  const st = await getSettings();
  const model = await keptModel();
  const ask = `${s.ref}, line ${n}\n\n${context(s.he, s.en, n)}\n\nThe phrases of line ${n}:\n${list.map((p, i) => `(${i + 1}) ${stripNikud(p.he)}${p.en ? `  —  ${p.en}` : ''}`).join('\n')}`;
  // Nov 19: his own tone is said again at the end of the request, where it weighs most.
  const askT = `${ask}${toneTail({ awake, custom })}`;
  const r = await runKept({ lang: true, model: model.id, system: `${PROMPT}\n\n${styleForChat(st)}\n\n${SCOPE}${custom ? `\n\n${customBlock(custom, 'these notes (and anything before the text, and the questions)')}` : awake ? `\n\n${AWAKE}\nThis tone comes last and wins over any quieter tone asked for above; the content and accuracy rules above still hold.` : ''}`, history: [{ role: 'user', content: askT }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 6000 });
  await logCost({ sessionId: null, kind: 'weave', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const j = (() => { try { return parseAiJson<{ phrases?: { en?: string; note?: string; ask?: string; hint?: string; before?: { kind?: string; text?: string } }[] }>(r.text, '{'); } catch { return null; } })();
  const out = j?.phrases ?? [];
  if (!out.length) throw new Error('The learning did not come back in the right form.');
  return {
    phrases: list.map((p, i) => {
      const o = out[i] ?? {};
      return { he: p.he, en: (o.en || p.en || '').trim(), note: (o.note ?? '').trim(), ...(o.ask ? { ask: o.ask.trim(), hint: (o.hint ?? '').trim() } : {}), ...(o.before?.text ? { before: { kind: String(o.before.kind ?? 'think'), text: o.before.text.trim() } } : {}) };
    }),
  };
}

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? ''), n = Number(req.nextUrl.searchParams.get('n'));
  if (!ref || !n || / on /i.test(ref)) return NextResponse.json({ error: 'Nothing to learn here.' }, { status: 400 });
  const t = await toneNow(); // "Wake me up" unless Calm, or his own tone, is chosen (Nov 18)
  const kind = t.custom ? `weave-${t.tag}` : t.awake ? 'weave-awake-v5' : 'weave-v3';
  try { return NextResponse.json(await keep(kind, `${ref}:${n}`, () => makeWeave(ref, n, t.awake, t.custom), (x) => !x.phrases.length)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

async function makeDeep(ref: string, n: number, k: number, awake = false, custom: string | null = null): Promise<{ text: string }> {
  await needCredit();
  const got = await phrasesOf(ref, n);
  if (!got || !got.list[k]) return { text: '' };
  const model = await keptModel();
  const ask = `${got.s.ref}, line ${n}\n\n${context(got.s.he, got.s.en, n)}\n\nGo deeper on this phrase of line ${n}: ${stripNikud(got.list[k].he)}`;
  const r = await runKept({ lang: true, model: model.id, system: `${DEEP}\n\n${SCOPE}${custom ? `\n\n${customBlock(custom, 'going deeper')}` : awake ? `\n\n${AWAKE_DEEP}` : ''}`, history: [{ role: 'user', content: `${ask}${toneTail({ awake, custom })}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'weave-deep', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/\*\*|__/g, '').trim();
  if (text.length < 40) throw new Error('It did not come back.');
  return { text };
}

export async function POST(req: NextRequest) {
  const { ref, n, k } = await req.json().catch(() => ({}));
  if (!ref || !n || k == null) return NextResponse.json({ error: 'Nothing to go deeper on.' }, { status: 400 });
  const t = await toneNow(); // the same Tone as the rest (Nov 18)
  const kind = t.custom ? `weave-deep-${t.tag}` : t.awake ? 'weave-deep-awake-v2' : 'weave-deep-v2';
  try { return NextResponse.json(await keep(kind, `${ref}:${n}:${k}`, () => makeDeep(String(ref), Number(n), Number(k), t.awake, t.custom), (x) => !x.text)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
