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
export const maxDuration = 120;

// "Big picture" (Nov 17): one button under a line, and the voice tells you, in about half a minute, where this line
// stands in the sugya: what the discussion is about, what this line is doing in it, and where it is going. Then it
// stops. Written once per line (kept, lib/keep) and recorded once in the chosen speech voice, the same voice as Listen
// (kept in Storage, audio/bigpicture/…), so a replay is free. About 1–2¢ the first time for a line.
const PROMPT = (nusach: string) => `You are a chavrusa. In a few spoken sentences, give the learner the big picture of the one line he is on: what the sugya here is about, what this line is doing in it (asking, answering, proving, bringing a new opinion…), and where the discussion is going next. Only the big picture: no word-by-word translation, no meforshim, no tangents.
Write for the ear: 60 to 110 words, short clear sentences, plain warm spoken English, say "we" and "the Gemara". No headings, lists, brackets, line numbers, references or symbols. No Hebrew letters at all: learning terms and names in English letters, spelled as said in ${nusach === 'sephardi' ? 'Sephardi pronunciation (Shabbat, Tosafot)' : 'an American yeshivish Ashkenazi pronunciation (Shabbos, Tosafos)'}. Call God "Hashem". Begin right in; no greeting, no sign-off.`;

async function makeText(base: string, n: number, nusach: string): Promise<{ text: string }> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he[n - 1]) return { text: '' };
  const clip = (t: string, k: number) => (t.length > k ? `${t.slice(0, k)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}]${i + 1 === n ? ' ← THE LINE HE IS ON' : ''} ${clip(stripNikud(he), 500)}${s.en[i] ? `\n    ${clip(s.en[i], 500)}` : ''}`).join('\n');
  const model = await keptModel();
  const r = await runAnthropic({ model: model.id, system: PROMPT(nusach), history: [{ role: 'user', content: `${s.ref}, line ${n}\n\n${lines.slice(0, 20000)}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'bigpicture-text', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__|[\[\]()]/g, '').replace(/[א-ת֑-ׇ]+/g, '').replace(/\s+/g, ' ').trim();
  if (text.length < 120) throw new Error('The big picture did not come back.'); // not kept: tried again
  return { text: text.slice(0, 1200) };
}

async function speak(input: string, voice: string, nusach: 'ashkenaz' | 'sephardi', key: string): Promise<Buffer> {
  let lastError = '';
  for (const model of VOICE.speechModels) {
    const body: Record<string, unknown> = { model, voice, input, response_format: 'mp3' };
    if (!model.startsWith('tts-')) body.instructions = `${speechInstructions(nusach)} You are a chavrusa giving a quick big picture: warm, clear, unhurried.`;
    const res = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      await logCost({ sessionId: null, kind: 'bigpicture-voice', provider: 'openai', model, inputTokens: input.length, outputTokens: 0, costUsd: (input.length / VOICE.charsPerMinute) * VOICE.speechUsdPerMinute }).catch(() => {});
      return Buffer.from(await res.arrayBuffer());
    }
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    lastError = data?.error?.message ?? `status ${res.status}`;
    if (!/model|not found|does not exist|access|voice/i.test(lastError) && res.status !== 404) break;
  }
  throw new Error(`Could not create the speech: ${lastError}`);
}

// POST { ref: "Yoma 6b:3" } → { url, text }
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const { ref: r0 } = await req.json().catch(() => ({}));
  const m = String(r0 ?? '').match(/^(.+):(\d+)$/);
  if (!m || / on /i.test(m[1]) || /^Mine /.test(m[1])) return NextResponse.json({ error: 'Nothing to say over here.' }, { status: 400 });
  const base = m[1], n = Number(m[2]);
  try {
    const st = await getSettings();
    const voice = VOICES.some((v) => v.id === st.voice) ? st.voice : VOICES[0].id;
    const nusach: 'ashkenaz' | 'sephardi' = st.nusach === 'sephardi' ? 'sephardi' : 'ashkenaz';
    const kept = st.keptModel === 'sonnet' ? 'sonnet' : 'opus';
    const path = `audio/bigpicture/${safeKey(`${voice}-${nusach}-${kept}`)}/${safeKey(`${base}:${n}`)}.mp3`;
    if (await writtenAt(path)) return NextResponse.json({ url: await signedUrl(path) });
    const { text } = await keep(`bigpicture-v1-${nusach}`, `${base}:${n}`, () => makeText(base, n, nusach), (x) => !x.text);
    if (!text) return NextResponse.json({ error: 'This text can’t be opened here.' }, { status: 400 });
    await needCredit();
    const audio = await speak(prepareForSpeech(text, nusach), voice, nusach, key);
    await writeBytes(path, audio, 'audio/mpeg');
    return NextResponse.json({ url: await signedUrl(path), text });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
