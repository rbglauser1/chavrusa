import 'server-only';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

// The amud intro: one paragraph telling the learner what's coming on this amud (or perek / siman), shown at its top
// and, in Read, Explain, Ask, said by the voice when the amud begins. Made once per amud by the AI, then kept.
const PROMPT = `You write the introduction a good chavrusa gives before learning a new amud of Gemara (or a new perek or siman of another sefer), so the learner knows what's coming.
Write ONE paragraph of about 90 to 140 words, in plain, warm, modern English, as if speaking to him. Say:
- what the sugya on this amud is about, and, if the amud begins in the middle of a discussion, where it's picking up from;
- the main steps the amud goes through, in order (the questions, answers, proofs, opinions, stories), simply and briefly;
- where it ends up, or where it leaves off for the next amud.
It is a map of the amud, not the explanation: no line-by-line detail. Do not quote Hebrew or Aramaic, no lists, no headings, no markdown. Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Rav Yehudah, Tosafos, the Gemara), say Hashem for G-d's Name, and add nothing that is not in the text.`;

async function makeIntro(ref: string): Promise<string> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return '';
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({
    model: model.id, system: PROMPT, history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  const usd = costUsd(model, r.inputTokens, r.outputTokens);
  await logCost({ sessionId: null, kind: 'intro', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: usd }).catch(() => {});
  const text = r.text.replace(/^#+.*$/gm, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  if (text.length < 40) throw new Error('The intro did not come back.'); // not kept: tried again next time
  return text.slice(0, 1400);
}

// Kept for a month on the server: the same amud's intro is never paid for twice.
export const getIntro = (ref: string) => unstable_cache(() => makeIntro(ref), ['intro-v1', ref], { revalidate: 60 * 60 * 24 * 30 })();

// The intro if it's ready within a few seconds (it keeps being made, and kept, in the background otherwise).
export async function introSoon(ref: string, ms = 7000): Promise<string> {
  return Promise.race([getIntro(ref).catch(() => ''), new Promise<string>((r) => setTimeout(() => r(''), ms))]);
}
