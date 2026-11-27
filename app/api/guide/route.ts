import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd, styleForChat } from '@/lib/config';
import { approvedList, getSettings, listSavedMemories, logCost } from '@/lib/db';
import { getText, endOfPrevious, getLinks } from '@/lib/sefaria';
import { prepareLamdan } from '@/lib/prefetch';
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

// Nov 21: on a card (Learn with me as Cards) he asks his own question about what is on the card; the chavrusa answers it.
const ASK = `You are a warm, sharp chavrusa learning a sefer with the learner one small card at a time. The card he is looking at now is shown below: a few words of the line marked >>> <<<, their translation, and the short explanation you gave him. He asks you a question about it.
Answer exactly what he asked, clearly and to the point, like a chavrusa across the table: usually 40 to 90 words; go longer only if he asks for depth (Rashi, Tosafos, the sevara) or the question truly needs it. If his question rests on a misreading, gently set it straight. If it reaches beyond this line, answer briefly and bring it back to the text in front of him. If you are not sure, say so plainly; never invent a source or a quote. Say what's what: when you quote the text or a meforesh, name it; when an idea is your own and not from a source given, say so plainly ("my own sevara", "I'd suggest"); if you can't support something, say you aren't sure rather than guess. If earlier questions on this card are shown, this is a follow-up: build on what you already said, don't repeat it. No headings, no lists, no markdown. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;

// Nov 25: "How I learn": his standing rules (Settings → How I learn, the same list the chat and the voice follow),
// for every reply made just for him here. Kept explanations (made once for everyone) don't take them.
async function rulesBlock(): Promise<string> {
  const list = await listSavedMemories().catch(() => []);
  const rules = list.filter((x) => x.kind === 'instruction').map((x) => x.content.trim()).filter(Boolean).slice(0, 20);
  return rules.length ? `\n\n# How he learns (his own standing rules: follow them)\n${rules.map((r) => `- ${r}`).join('\n')}` : '';
}

// Nov 25: new ways to learn together (the doc "new ways to learn together").
// Teach it back: he says the line over in his own words; the chavrusa tells him what he got, what he missed, and where
// he is fuzzy.
const SAYOVER = `You are a warm, sharp chavrusa. The learner just learned the line marked >>> <<< (what was on his cards is shown) and now says it over in his own words, to check himself. Saying it over is how learning sticks: take it seriously.
Answer in three short parts, each starting on its own line with its label exactly:
Got it: what he said correctly (be specific; never false praise; if nothing, say so kindly).
Missed: what he left out that matters (the step, the reason, the word that carries it). If nothing important, say "Nothing important."
Fuzzy: where his wording is vague or a little off, and the precise way to say it. If nothing, say "Nothing."
Then one last line starting "In one line:" with the line said over correctly in a single sentence.
At most 120 words in all. No markdown. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;
// What would you answer?: the Gemara asks a kashya; he answers first; then the Gemara's own answer and how close he came.
const TRYANSWER = `You are a warm, sharp chavrusa. The Gemara just asked a question or kashya (given below, with the line), and before reading on, the learner tried to answer it himself. The Gemara's own answer is given below too.
Tell him, in about 50 to 90 words: first how close he came (the same answer, a real answer the Gemara doesn't use, part of it, or not it), honestly and warmly; then the Gemara's answer plainly in a sentence or two; then, if his answer was different but reasonable, one sentence on why the Gemara might not say it (or that a meforesh does, only if you are sure). If he said he doesn't know, just give the answer kindly. No markdown. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;
// Prepare, then compare: he reads the line himself first; then his reading is set against Rashi's real words.
const COMPARE = `You are a warm, sharp chavrusa. The learner worked out the line marked >>> <<< by himself first, and wrote how he reads it. Now compare his reading with Rashi on this line (Rashi's real text is given below, with the other meforshim; use Tosafos only if Rashi says nothing here, and say so).
In about 70 to 120 words: where he reads it like Rashi (name the words of Rashi that match, in Hebrew letters); where Rashi reads it differently, and what in the words makes Rashi read it his way; and anything Rashi adds that he didn't think of. If his reading is a fair pshat that Rashi doesn't take, say so honestly. Only what Rashi's given text says; never invent. No markdown.`;

const lineText =(he: string[], en: string[], n: number) => {
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
    if (typeof b.ask === 'string') return askOnCard(b, m);
    if (b.say === true || b.simple === true) return sayInMyWords(b, m);
    if (typeof b.expand === 'string') return expandInyan(b, m);
    if (typeof b.work === 'string') return sugyaWork(b, m);
    if (typeof b.sayover === 'string') return mine(b, m, 'sayover');
    if (typeof b.tryanswer === 'string') return mine(b, m, 'tryanswer');
    if (typeof b.compare === 'string') return mine(b, m, 'compare');
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
      lang: true, model: model.id, system: `${REPLY}\n\n${styleForChat(settings)}\n\n${SCOPE}${toneText}${await rulesBlock()}`,
      history: [{ role: 'user', content: `${s.ref}, line ${n}${await endOfPrevious(m[1], n, approved)}\n\n${lineText(s.he, s.en, n)}\n\n---\nYou asked: ${String(b.question ?? '').slice(0, 500)}\nHe answered: ${answer}` }],
      tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 500,
    });
    await logCost({ sessionId: null, kind: 'guide-reply', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, ''));
    if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
    return NextResponse.json({ text: text.slice(0, 2000) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// POST { ref, ask, card, thread }: his own question on a card; the chavrusa answers (not kept: it's his question).
async function askOnCard(b: { ask?: unknown; card?: unknown; thread?: unknown }, m: RegExpMatchArray | null) {
  const q = String(b.ask ?? '').trim().slice(0, 1500);
  if (!m || !q) return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 });
  await needCredit();
  const n = Number(m[2]);
  const approved = await approvedList();
  const s = await getText(m[1], approved);
  if (!s.verdict.allowed || !s.he.length) return NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
  const settings = await getSettings();
  const model = MODELS[settings.provider][settings.tier];
  const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
  const t = await toneNow();
  const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your replies')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
  const card = String(b.card ?? '').slice(0, 3000);
  const earlier = (Array.isArray(b.thread) ? b.thread : []).slice(-4)
    .map((x: { q?: unknown; a?: unknown }) => `He asked: ${String(x?.q ?? '').slice(0, 800)}\nYou answered: ${String(x?.a ?? '').slice(0, 1500)}`)
    .join('\n\n');
  const r = await run({
    lang: true, model: model.id, system: `${ASK}\n\n${styleForChat(settings)}\n\n${SCOPE}${toneText}${await rulesBlock()}`,
    history: [{ role: 'user', content: `${s.ref}, line ${n}${await endOfPrevious(m[1], n, approved)}\n\n${lineText(s.he, s.en, n)}\n\n---\nThe card in front of him:\n${card || '(this line)'}${earlier ? `\n\n---\nEarlier on this card:\n${earlier}` : ''}\n\n---\nHe asks: ${q}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 800,
  });
  await logCost({ sessionId: null, kind: 'guide-ask', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, ''));
  if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
  return NextResponse.json({ text: text.slice(0, 3000) });
}

// Nov 25 (2): Choose a side, Put it to work, One sentence per amud.
const SIDES = `You are a sharp chavrusa. Below is a sugya (the lines given, from its first line to its last). Find the two positions in it that a learner could argue: a machlokes, or a question against an answer, or two ways the Gemara considers. Return JSON only:
{"a": {"who": "who holds it (a name, or 'The questioner')", "holds": "the position in one plain sentence"}, "b": {"who": "...", "holds": "..."}, "about": "what they argue about, in a few words"}
If the sugya truly has no two positions to argue, return {"a": null}. For names and terms, yeshivish spelling; Hebrew words in Hebrew letters.`;
const DEBATE = `You are a sharp chavrusa in a friendly debate with the learner over the sugya below. He took one side; you argue the OTHER side, from the text and the standard meforshim, the way a real chavrusa bangs on the table. Each turn: answer his last argument head on (concede a point only if it is truly right), then press your side with one sharp argument or a question he must answer. 50 to 100 words. Never invent a source. When one side has clearly won, or he asks, say so plainly. No markdown. Hebrew and Aramaic words in Hebrew letters.`;
const SETTLE = `You are a sharp chavrusa. The learner just debated the two positions below. Now show him how the Gemara itself settles it (or leaves it), from the lines given: which side stands, by what argument or proof, and in which line; and one sentence on what each side of the debate got right. 70 to 120 words. No markdown. Hebrew and Aramaic words in Hebrew letters.`;
const CASES = `You are a sharp chavrusa. The sugya below just ended. Make three everyday cases (things from life today: a shoelace, a boat tied to a dock, a phone left charging, a bag on a hook) that test the line the sugya drew. Each case falls clearly on one side once the sugya is understood. Return JSON only:
{"rule": "the line the sugya drew, in one plain sentence", "cases": [{"case": "the case in one or two sentences", "options": ["the first way it could go", "the second way"], "answer": 0, "why": "one or two sentences: why, from the sugya"}]}
Only what the sugya supports; for a real halachic question in practice, the why ends with "for practice, ask your rav". Hebrew words in Hebrew letters.`;
const SENTENCE = `You are a sharp chavrusa. The learner finished this amud and wrote the whole sugya in ONE sentence. Help him sharpen it: say in one short line what his sentence gets right, in one short line what it misses or blurs (if anything), then give the sharpened sentence on its own line starting "Sharper:" (one sentence, at most 35 words, in his words where possible). No markdown.`;

async function sugyaLines(base: string, from: number, to: number) {
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length) return null;
  const a = Math.max(1, from), z = Math.min(s.he.length, Math.max(a, to));
  const body = s.he.slice(a - 1, z).map((h, i) => `[${a + i}] ${stripNikud(h).slice(0, 900)}${s.en[a - 1 + i] ? `\n    ${s.en[a - 1 + i].replace(/<[^>]+>/g, '').slice(0, 900)}` : ''}`).join('\n').slice(0, 18000);
  return { s, body };
}

async function sugyaWork(b: Record<string, unknown>, m: RegExpMatchArray | null) {
  if (!m) return NextResponse.json({ error: 'Nothing to work on.' }, { status: 400 });
  const what = String(b.work);
  const from = Math.round(Number(b.from) || 1), to = Math.round(Number(b.to) || Number(m[2]) || 1);
  const t = await toneNow();
  const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your replies')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
  const kept = async (kind: string, system: string, maxTokens: number) => keep(kind, `${m[1]}:${from}-${to}`, async () => {
    await needCredit();
    const got = await sugyaLines(m[1], from, to);
    if (!got) return { none: true } as Record<string, unknown>;
    const model = await keptModel();
    const r = await runKept({ lang: true, model: model.id, system: `${system}\n\n${SCOPE}`, history: [{ role: 'user', content: `${got.s.ref}, lines ${from} to ${to}\n\n${got.body}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens });
    await logCost({ sessionId: null, kind, provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const d = parseAiJson(r.text, '{') as Record<string, unknown>;
    if (!d || typeof d !== 'object') throw new Error('It did not come back.');
    return d;
  }, (x) => !!(x as { none?: unknown }).none);
  try {
    if (what === 'sides') return NextResponse.json(await kept('debate-sides1', SIDES, 600));
    if (what === 'cases') return NextResponse.json(await kept('cases1', CASES, 1200));
    // His own debate turn, the settling, and his one sentence: just for him, not kept.
    await needCredit();
    const got = await sugyaLines(m[1], from, to);
    if (!got) return NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
    const settings = await getSettings();
    const model = MODELS[settings.provider][settings.tier];
    const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
    const sides = `Side A (${String(b.aWho ?? '')}): ${String(b.aHolds ?? '')}\nSide B (${String(b.bWho ?? '')}): ${String(b.bHolds ?? '')}`;
    const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-10).map((x: { me?: unknown; you?: unknown }) => `He: ${String(x?.me ?? '').slice(0, 800)}${x?.you ? `\nYou: ${String(x.you).slice(0, 1000)}` : ''}`).join('\n\n');
    let system = '', ask = '';
    if (what === 'turn') { system = DEBATE; ask = `${sides}\nHe argues side ${b.side === 'b' ? 'B' : 'A'}; you argue side ${b.side === 'b' ? 'A' : 'B'}.\n\n${thread}\n\nHe now says: ${String(b.msg ?? '').slice(0, 1500)}`; }
    else if (what === 'settle') { system = SETTLE; ask = `${sides}\n\nThe debate:\n${thread || '(short)'}`; }
    else if (what === 'sentence') { system = SENTENCE; ask = `His one sentence for the amud: ${String(b.msg ?? '').slice(0, 800)}`; }
    else return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 });
    const r = await run({ lang: true, model: model.id, system: `${system}\n\n${styleForChat(settings)}\n\n${SCOPE}${toneText}${await rulesBlock()}`, history: [{ role: 'user', content: `${got.s.ref}, lines ${from} to ${to}\n\n${got.body}\n\n---\n${ask}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 700 });
    await logCost({ sessionId: null, kind: `guide-${what}`, provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, ''));
    return text ? NextResponse.json({ text: text.slice(0, 2500) }) : NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message || 'It couldn’t do that just now.' }, { status: 502 }); }
}

// Nov 25: his own work, answered just for him (not kept): his say-over, his answer to the Gemara's question, his reading
// set against Rashi.
async function mine(b: Record<string, unknown>, m: RegExpMatchArray | null, what: 'sayover' | 'tryanswer' | 'compare') {
  const his = String(b[what] ?? '').trim().slice(0, 2500);
  if (!m || !his) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  await needCredit();
  const n = Number(m[2]);
  const approved = await approvedList();
  const s = await getText(m[1], approved);
  if (!s.verdict.allowed || !s.he.length) return NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
  const settings = await getSettings();
  const model = MODELS[settings.provider][settings.tier];
  const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
  const t = await toneNow();
  const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your replies')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
  let extra = '';
  if (what === 'sayover') extra = `What was on his cards for this line:\n${String(b.card ?? '').slice(0, 4000) || '(the line)'}\n\n---\nHe says it over:\n${his}`;
  if (what === 'tryanswer') extra = `The Gemara asks (line ${Math.round(Number(b.qline) || n)}): ${String(b.q ?? '').slice(0, 600)}\nThe Gemara's own answer${b.aline ? ` (line ${Math.round(Number(b.aline))})` : ''}: ${String(b.a ?? '').slice(0, 800) || '(see the lines that follow)'}\n\n---\nHis answer: ${his}`;
  if (what === 'compare') {
    const lam = await prepareLamdan(m[1], [n], approved, 7000).catch(() => null);
    extra = `${lam && !/^\(No commentaries/.test(lam) ? `The meforshim on this line:\n${lam.replace(/\n\(Also on these lines[\s\S]*$/, '')}` : '(Sefaria brings no Rashi on this line.)'}\n\n---\nHow he reads the line:\n${his}`;
  }
  const after = what === 'tryanswer' ? Math.max(n, Math.round(Number(b.aline) || n)) : n;
  const shown = what === 'tryanswer' ? lineText(s.he, s.en, after) : lineText(s.he, s.en, n);
  const r = await run({
    lang: true, model: model.id, system: `${what === 'sayover' ? SAYOVER : what === 'tryanswer' ? TRYANSWER : COMPARE}\n\n${styleForChat(settings)}\n\n${SCOPE}${toneText}${await rulesBlock()}`,
    history: [{ role: 'user', content: `${s.ref}, line ${n}\n\n${shown}\n\n---\n${extra}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 700,
  });
  await logCost({ sessionId: null, kind: `guide-${what}`, provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, ''));
  if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
  return NextResponse.json({ text: text.slice(0, 2500) });
}

// Nov 23: "✦ In my words?" at the end of a line (or of a sentence, in Sentence by sentence): what it says and does, in
// the chavrusa's own plain words, a few sentences; he can then ask a follow-up (askOnCard). Made once per line or
// sentence, in his tone, and kept.
const SAY = `You are a warm, sharp chavrusa. The learner just read the line marked >>> <<< (or, if one sentence of it is given, just that sentence) and tapped "In my words?": say what it means and what it is doing here, in your own plain words, the way you'd put it to him across the table.
2 to 4 short sentences, at most 70 words. Not a word-for-word translation: the meaning and its point in the flow (what is being asked, answered, proven, or why it matters). Don't repeat the English he already has. No headings, no lists, no markdown, no questions to him. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;

// Nov 26: ✦ Simple: the most basic, rudimentary explanation of the move, for someone just starting, set in the larger
// picture of the sugya (the whole amud is given so it can say where this step stands). Made once per line and kept.
const SIMPLE = `You are a patient chavrusa teaching someone at the very start. The learner tapped "Simple" on the line marked >>> <<< (or, if one sentence of it is given, just that sentence). Explain the move at the most basic, rudimentary level, as you would to a beginner, AND in light of the larger picture: the whole amud is given below, so say where this step stands in it.
Write 3 to 5 very short, plain sentences, at most 90 words: first the big picture in one sentence (what the sugya is trying to figure out); then what this line does in that (asks, answers, proves, pushes back, concludes), in the simplest words; then why it matters for where the sugya is going. Everyday words; explain any learning term in a few words the first time; one simple example if it helps. No headings, no lists, no markdown, no questions to him. Quoted words of the text in Hebrew letters.`;

async function sayInMyWords(b: { piece?: unknown; si?: unknown; simple?: unknown }, m: RegExpMatchArray | null) {
  if (!m) return NextResponse.json({ error: 'Nothing to explain.' }, { status: 400 });
  const n = Number(m[2]);
  const piece = String(b.piece ?? '').trim().slice(0, 1500);
  const si = Math.max(0, Math.round(Number(b.si) || 0));
  const t = await toneNow();
  const simple = b.simple === true;
  const kind = `${simple ? 'simple1' : 'say1'}-${t.custom ? t.tag : t.awake ? 'awake' : 'calm'}`;
  try {
    const out = await keep(kind, `${m[1]}:${n}:${si}`, async () => {
      await needCredit();
      const approved = await approvedList();
      const s = await getText(m[1], approved);
      if (!s.verdict.allowed || !s.he.length) return { text: '' };
      const model = await keptModel();
      const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your explanation')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
      const r = await runKept({
        lang: true, model: model.id, system: `${simple ? SIMPLE : SAY}\n\n${SCOPE}${toneText}`,
        history: [{ role: 'user', content: `${s.ref}, line ${n}\n\n${lineText(s.he, s.en, n)}${piece ? `\n\n---\nJust this sentence of line ${n}:\n${stripNikud(piece)}` : ''}${simple ? `\n\n---\nThe whole amud, for the larger picture (English):\n${s.en.map((e, i) => `[${i + 1}]${i + 1 === n ? ' >>>' : ''} ${e.replace(/<[^>]+>/g, '').slice(0, 400)}`).join('\n').slice(0, 14000)}` : ''}` }],
        tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: simple ? 600 : 500,
      });
      await logCost({ sessionId: null, kind: simple ? 'simple' : 'say', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
      const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '')).slice(0, 1500);
      if (text.length < 20) throw new Error('It did not come back.');
      return { text };
    }, (x) => !x.text);
    return out.text ? NextResponse.json(out) : NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message || 'It couldn’t explain just now.' }, { status: 502 }); }
}

// Nov 23: under "In my words", ✦ Go deeper: a kashya, a chakira, the halacha, the meforshim, or the wider inyan, built
// from what Sefaria brings on this line: its meforshim (Rashi, Tosafos, the Rishonim) and what it links to (the
// Rambam, the Shulchan Aruch and Mishnah Berurah, the same sugya elsewhere in Shas, Midrash, mussar). Made once per line
// or sentence and kind, in his tone, and kept.
const EXPANDS: Record<string, { label: string; ask: string; cats: string[] }> = {
  kashya: { label: 'A kashya', cats: ['Commentary', 'Talmud'], ask: `Bring a real kashya on it. If one of the meforshim given asks one (Tosafos above all), bring that: who asks, the kashya sharply in a sentence, and the answer (or answers, and who gives each). If none of them asks one here, bring the natural kashya a sharp learner would ask, say plainly that it is your own question, and show how the sugya or the meforshim given answer it.` },
  // Nov 23: the chavrusa's OWN sharp kashya, as a challenger across the table, whether or not a meforesh asks one.
  challenge: { label: 'Sharp kashya', cats: ['Commentary', 'Talmud'], ask: `Be the sharp challenger across the table: give YOUR OWN sharpest kashya on it, whether or not a meforesh asks one. A real difficulty, not a quibble: from the logic of the piece itself, from a contradiction with another line or sugya, from a pasuk, or from a case where the din seems not to fit. Put it pointedly, in one to three sentences, the way a chavrusa bangs on the table. If one of the meforshim given asks the same, don't just repeat him: sharpen it or take it one step further, and you may say he touches on it. Then, on its own line starting exactly with "ANSWER:", a possible answer in two to four sentences: from the sugya, from a meforesh given (named), or from a sevara, saying plainly when it is your own suggestion.` },
  chakira: { label: 'A chakira', cats: ['Commentary', 'Talmud', 'Halakhah'], ask: `Frame the chakira under it: the two ways to understand the din (in the gavra or the cheftza? one din or tzvei dinim? the cause or the definition? …), each side in a sentence, what in the text or the meforshim given leans to each, and the נפקא מינה between them. Only a real chakira that this piece supports; never force one.` },
  halacha: { label: 'Halacha', cats: ['Halakhah'], ask: `Show how it lands in halacha, from the codes given (the Rambam, the Tur, the Shulchan Aruch, the Mishnah Berurah): what each rules on this, briefly, naming each with its place, and where the halacha differs from or adds to the simple reading of the Gemara. If none of the codes given speaks to this piece, say so in a sentence and say what the halacha would turn on. End with: for practice, ask your rav.` },
  meforshim: { label: 'Meforshim', cats: ['Commentary'], ask: `Give what the meforshim given say on it: Rashi, Tosafos and the other Rishonim (and Acharonim if given), each in its gist (a sentence or two), naming each, and where they differ, what the difference turns on. Only what the given texts say.` },
  // Nov 25: Rashi vs. Tosafos, side by side (for Iyun): what each holds, what bothers Tosafos, what it turns on.
  rashitos: { label: 'Rashi vs Tosafos', cats: ['Commentary'], ask: `Set Rashi and Tosafos side by side on it, from their real text given. Write exactly these four lines, each starting with its label: "Rashi:" what Rashi holds or how he reads it, in a sentence or two. "Tosafos:" what Tosafos holds (name the דיבור המתחיל), in a sentence or two. "What bothers Tosafos:" the difficulty that pushes Tosafos away from Rashi (or, if Tosafos agrees, what Tosafos adds). "It turns on:" the point the difference turns on, and a נפקא מינה if there is one. If Rashi or Tosafos says nothing on this piece, say so on that line plainly; never invent.` },
  widen: { label: 'Widen it', cats: ['Talmud', 'Midrash', 'Tanakh', 'Jewish Thought', 'Musar', 'Chasidut'], ask: `Widen the inyan: from the linked sources given (the same sugya elsewhere in Shas, a Midrash, a pasuk, a sefer of mussar or machshava), bring the two or three that shed the most light on this piece, each named, each in a sentence or two on how it opens the inyan up.` },
};
const EXPAND_RULES = `You are a warm, sharp chavrusa going deeper with the learner on one line (or one sentence of it, if given) that you just explained to him in plain words.
Use the sources given below; name each source you use, exactly (Rashi, Tosafos ד"ה …, the Rambam Hilchos … , the Shulchan Aruch O.C. …, Bava Kamma 30a …). Never invent a source or a quote; if a source is not given, don't attribute anything to it. Say what's what: when you quote the text or a meforesh, name it; when an idea is your own and not from a source given, say so plainly ("my own sevara", "I'd suggest"); if you can't support something, say you aren't sure rather than guess. 90 to 170 words. Plain prose (a short list only if it truly helps), no headings, no markdown. For learning terms and quoted words, write the Hebrew or Aramaic in Hebrew letters.`;

async function expandInyan(b: { expand?: unknown; piece?: unknown; si?: unknown }, m: RegExpMatchArray | null) {
  const kindName = String(b.expand ?? '');
  const ex = EXPANDS[kindName];
  if (!m || !ex) return NextResponse.json({ error: 'Nothing to go into.' }, { status: 400 });
  const n = Number(m[2]);
  const piece = String(b.piece ?? '').trim().slice(0, 1500);
  const si = Math.max(0, Math.round(Number(b.si) || 0));
  const t = await toneNow();
  const kind = `expand1-${kindName}-${t.custom ? t.tag : t.awake ? 'awake' : 'calm'}`;
  try {
    const out = await keep(kind, `${m[1]}:${n}:${si}`, async () => {
      await needCredit();
      const approved = await approvedList();
      const s = await getText(m[1], approved);
      if (!s.verdict.allowed || !s.he.length) return { text: '', sources: [] as string[] };
      // The meforshim on the line, and a few of the linked texts of the kind asked for.
      const [lamdan, links] = await Promise.all([
        kindName === 'widen' || kindName === 'halacha' ? Promise.resolve(null) : prepareLamdan(m[1], [n], approved, 6000).catch(() => null),
        getLinks(`${m[1]}:${n}`, approved, undefined, 60).catch(() => ({ allowed: [], excluded: [] })),
      ]);
      const want = ex.cats.filter((c) => c !== 'Commentary').map((c) => c.toLowerCase());
      const rank = (r: string) => (/^Mishneh Torah/.test(r) ? 0 : /^Shulchan Arukh/.test(r) ? 1 : /^Tur\b/.test(r) ? 2 : /^Mishnah Berurah/.test(r) ? 3 : 4);
      const picked = links.allowed.filter((l) => want.some((c) => l.category.toLowerCase().includes(c)))
        .sort((a, b2) => (kindName === 'halacha' ? rank(a.ref) - rank(b2.ref) : 0)).slice(0, kindName === 'halacha' ? 5 : 4);
      const texts = (await Promise.all(picked.map(async (l) => {
        const x = await getText(l.ref, approved).catch(() => null);
        if (!x || !x.verdict.allowed) return null;
        const he = stripNikud(x.he.join(' ')).slice(0, 900), en = x.en.join(' ').replace(/<[^>]+>/g, '').slice(0, 700);
        return { ref: l.ref, body: `${he}${en ? `\n   (${en})` : ''}` };
      }))).filter(Boolean) as { ref: string; body: string }[];
      const lam = lamdan && !/^\(No commentaries/.test(lamdan) ? lamdan.replace(/\n\(Also on these lines[\s\S]*$/, '') : '';
      const sourcesBlock = `${lam ? `The meforshim on this line:\n${lam}\n\n` : ''}${texts.length ? `Linked sources:\n${texts.map((x) => `[${x.ref}]\n${x.body}`).join('\n\n')}` : ''}` || '(Sefaria brings no sources on this line beyond the text itself.)';
      const model = await keptModel();
      const toneText = t.custom ? `\n\n${customBlock(t.custom, 'your explanation')}` : t.awake ? `\n\n${AWAKE_REPLY}` : '';
      const r = await runKept({
        lang: true, model: model.id, system: `${EXPAND_RULES}\n\n${ex.ask}\n\n${SCOPE}${toneText}`,
        history: [{ role: 'user', content: `${s.ref}, line ${n}\n\n${lineText(s.he, s.en, n)}${piece ? `\n\n---\nJust this sentence of line ${n}:\n${stripNikud(piece)}` : ''}\n\n---\n${sourcesBlock.slice(0, 16000)}` }],
        tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 900,
      });
      await logCost({ sessionId: null, kind: `expand-${kindName}`, provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
      const text = unlabel(r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '')).slice(0, 2500);
      if (text.length < 30) throw new Error('It did not come back.');
      return { text, sources: texts.map((x) => x.ref) };
    }, (x) => !x.text);
    return out.text ? NextResponse.json(out) : NextResponse.json({ error: 'This text is not open to the AI.' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message || 'It couldn’t go deeper just now.' }, { status: 502 }); }
}
