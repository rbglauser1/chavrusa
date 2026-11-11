import { NextRequest, NextResponse } from 'next/server';
import { VOICE, VOICES, costUsd } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { keptModel } from '@/lib/keptModel';
import { needCredit } from '@/lib/credits';
import { prepareForSpeech, speechInstructions } from '@/lib/pronounce';
import { safeKey, signedUrl, writeBytes, writtenAt } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

// "Listen" (Settings → Extras → Listen to the daf): a spoken overview of the amud / perek, about eight to ten minutes,
// with no back-and-forth: for the car. The AI writes the talk once (kept, lib/keep); the speech voice reads it once and
// the recording is kept in Storage (audio/listen/…), so every replay is free. A recording belongs to a voice and a
// nusach: change either and a new one is made the first time. Costs about 20¢ the first time for an amud (the talk a
// few cents, the speech about 1.5¢ a minute); nothing after that.
const PROMPT = (nusach: string) => `You write a talk to be read aloud: an overview of one amud of Gemara (or a perek of Mishnah or Tanach) for a learner who will only hear it, driving or walking, without the text in front of him.
Walk through the text in order, the way a good maggid shiur gives the daf in ten minutes: where we are and what the subject is; then each part of the give and take in turn (who says what, what is asked and why it is a question, how it is answered, what is proven or pushed off); the conclusion of each topic; and at the end, a recap of the whole in three or four sentences. Explain according to Rashi. Explain every idea a listener needs as you reach it. Only what is in this text and its plain meaning; never invent an opinion or a source. For halacha in practice, he asks his rav; do not rule.
Write for the ear:
- About 1,100 to 1,300 words. Short, clear sentences. Plain spoken English, warm and direct, like a chavrusa talking; say "we" and "the Gemara".
- No headings, no lists, no brackets or parentheses, no line numbers, no references like "6a:3", no symbols. Numbers as words.
- No Hebrew letters at all. Learning terms and names in English letters, spelled the way they are said in ${nusach === 'sephardi' ? 'Sephardi pronunciation (Shabbat, Tosafot, mitzvot, tumah, Rabbi Akiva)' : 'an American yeshiva (Shabbos, Tosafos, mitzvos, tumah, kal vachomer, gezeirah shavah, Rav Chisda, Rabbi Akiva)'}. When you quote a key phrase of the text, say it in those letters and then say what it means.
- Call God "Hashem".
- Begin right in: "We're on …". End with the recap; no sign-off.
Reply with the talk only, in paragraphs.`;

async function makeScript(ref: string, nusach: string): Promise<{ text: string; title: string }> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { text: '', title: ref };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = await keptModel();
  const r = await runAnthropic({ model: model.id, system: PROMPT(nusach), history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 26000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'listen-script', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__|[\[\]()]/g, '').replace(/[א-ת֑-ׇ]+/g, '').trim();
  if (text.length < 1500) throw new Error('The talk did not come back.'); // not kept: tried again
  return { text: text.slice(0, 12000), title: s.ref };
}

// Paragraphs gathered into pieces the speech model takes in one go.
function pieces(text: string, max = 3400): string[] {
  const out: string[] = [];
  let cur = '';
  for (const p of text.split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean)) {
    for (const part of p.length > max ? p.match(/[^.!?]+[.!?]+["”’]?\s*|[^.!?]+$/g) ?? [p] : [p]) {
      if (cur && cur.length + part.length + 1 > max) { out.push(cur); cur = ''; }
      cur = cur ? `${cur} ${part.trim()}` : part.trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function speak(input: string, voice: string, nusach: 'ashkenaz' | 'sephardi', key: string): Promise<Buffer> {
  let lastError = '';
  for (const model of VOICE.speechModels) {
    const body: Record<string, unknown> = { model, voice, input, response_format: 'mp3' };
    if (!model.startsWith('tts-')) body.instructions = `${speechInstructions(nusach)} You are giving a short, clear shiur on the daf to someone listening in the car: steady, warm, unhurried, with a pause between ideas.`;
    const res = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      await logCost({ sessionId: null, kind: 'listen-voice', provider: 'openai', model, inputTokens: input.length, outputTokens: 0, costUsd: (input.length / VOICE.charsPerMinute) * VOICE.speechUsdPerMinute }).catch(() => {});
      return Buffer.from(await res.arrayBuffer());
    }
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    lastError = data?.error?.message ?? `status ${res.status}`;
    if (!/model|not found|does not exist|access|voice/i.test(lastError) && res.status !== 404) break;
  }
  throw new Error(`Could not create the speech: ${lastError}`);
}

async function place(ref: string) {
  const s = await getSettings();
  const voice = VOICES.some((v) => v.id === s.voice) ? s.voice : VOICES[0].id;
  const nusach: 'ashkenaz' | 'sephardi' = s.nusach === 'sephardi' ? 'sephardi' : 'ashkenaz';
  const model = s.keptModel === 'sonnet' ? 'sonnet' : 'opus';
  return { voice, nusach, path: `audio/listen/${safeKey(`${voice}-${nusach}-${model}`)}/${safeKey(ref)}.mp3` };
}
const scriptOf = (ref: string, nusach: string) => keep(`listen-v1-${nusach}`, ref, () => makeScript(ref, nusach), (x) => !x.text);
const okRef = (ref: string) => !!ref && !/ on /i.test(ref) && !/^Mine /.test(ref);

// GET ?ref=Yoma 6a → { ready, url?, minutes? }: is there a recording already (for the chosen voice)?
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!okRef(ref)) return NextResponse.json({ ready: false });
  try {
    const { path } = await place(ref);
    if (!(await writtenAt(path))) return NextResponse.json({ ready: false });
    return NextResponse.json({ ready: true, url: await signedUrl(path) });
  } catch { return NextResponse.json({ ready: false }); }
}

// POST { ref } → { url, text }: write the talk (if not yet), record it, keep it.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const { ref: r0 } = await req.json().catch(() => ({}));
  const ref = String(r0 ?? '');
  if (!okRef(ref)) return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  try {
    const { voice, nusach, path } = await place(ref);
    if (await writtenAt(path)) return NextResponse.json({ url: await signedUrl(path) });
    const script = await scriptOf(ref, nusach);
    if (!script.text) return NextResponse.json({ error: 'This text can’t be opened here.' }, { status: 400 });
    await needCredit();
    const parts = pieces(script.text).map((p) => prepareForSpeech(p, nusach));
    const audio = await Promise.all(parts.map((p) => speak(p, voice, nusach, key)));
    await writeBytes(path, Buffer.concat(audio), 'audio/mpeg');
    return NextResponse.json({ url: await signedUrl(path) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
