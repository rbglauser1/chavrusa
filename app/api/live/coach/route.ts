import { NextRequest, NextResponse } from 'next/server';
import { costUsd, MODELS, styleById, styleCard } from '@/lib/config';
import { getSettings, listMemories, logCost } from '@/lib/db';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Coach notes (Settings → Voice; used when Steady mode is off). After each exchange in a call, a quick, cheap brain
// (the "basic" model) reads the last few exchanges and checks the voice against the style and the learner's
// instructions. It answers OK, or a short private note the app slips to the voice for its next reply. The voice never
// waits for it. It never adds Torah content: it only steers how the voice learns.
const PROMPT = `You coach a live voice that is learning Torah out loud with a learner (a chavrusa on a voice call). You see the learning style, the learner's instructions, and the last few exchanges (what the learner said, what the voice said). Check the voice's LAST reply and decide what it needs for its NEXT reply.
Answer exactly OK if the voice is on track. Otherwise write ONE private note to the voice, at most 40 words, plain imperative sentences, nothing else. Cover only what matters most, in this order:
1. A learner instruction it broke or forgot (quote it briefly).
2. Where it drifted from the style: wrong order of the move, too long, explained when it should have asked or let him read, asked more than one question, skipped the English of a phrase, moved on by itself, missed the short big-picture line before a new move when the style has one.
3. A word it said the wrong way for this learner, as you can see from the transcript (for Ashkenaz: Shabbos not Shabbat, Tosafos not Tosafot, Elokim not Elohim, Hashem for the Name, emes not emet). Give the right form.
4. If useful, what the next move should be in this style (for example "After he answers, say one line on whether he's right, then go on to the next line").
Never add Torah content, quotes, sources or explanations of the text yourself. Never ask the voice to say anything about this note. Don't repeat a note the voice is already following.`;

type Ex = { learner?: string; said?: string };

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const log: Ex[] = Array.isArray(b.log) ? b.log.slice(-4) : [];
  if (!log.length || !String(log[log.length - 1]?.said ?? '').trim()) return NextResponse.json({ note: '' });
  const [s, memories] = await Promise.all([getSettings(), listMemories().catch(() => [])]);
  const st = styleById(s.style, s.customStyles);
  const card = styleCard(s.style, s.customStyles) + (s.blend ? ` Also: ${styleCard(s.blend, s.customStyles)}` : '');
  const requests: string[] = Array.isArray(b.requests) ? b.requests.map(String).filter(Boolean).slice(0, 12) : [];
  const saved = memories.filter((m) => m.kind === 'instruction' && !m.scope?.startsWith('session:')).map((m) => m.content).slice(0, 12);
  const clip = (t: unknown, n: number) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n)}…` : x; };
  const lines = log.map((e, i) => `${i === log.length - 1 ? 'LAST EXCHANGE' : 'Earlier'}:\nLearner: ${clip(e.learner, 500) || '(nothing)'}\nVoice: ${clip(e.said, 1200)}`).join('\n\n');
  const user = [
    `Style: ${st.name}. ${card}`,
    `Pronunciation: ${s.nusach === 'sephardi' ? 'Sephardi' : 'Ashkenaz (yeshivish)'}.`,
    requests.length ? `The learner's instructions for this session (above everything): ${requests.map((r) => `"${r}"`).join('; ')}` : '',
    saved.length ? `His saved instructions (always): ${saved.map((r) => `"${r}"`).join('; ')}` : '',
    b.place ? `Place: ${clip(b.place, 80)}` : '',
    `\n${lines}`,
  ].filter(Boolean).join('\n');

  const model = MODELS[s.provider].basic;
  const run = s.provider === 'anthropic' ? runAnthropic : runOpenAI;
  try {
    const r = await run({ model: model.id, system: PROMPT, history: [{ role: 'user', content: user }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
    logCost({ sessionId: b.sessionId ?? null, kind: 'coach', provider: s.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const t = r.text.replace(/\*\*|__|^#+.*$/gm, '').replace(/\s+/g, ' ').trim();
    if (!t || /^ok\.?$/i.test(t)) return NextResponse.json({ note: '' });
    return NextResponse.json({ note: t.split(/\s+/).slice(0, 50).join(' ') });
  } catch (e) {
    return NextResponse.json({ note: '', error: (e as Error).message });
  }
}
