import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd } from '@/lib/config';
import { logCost } from '@/lib/db';
import { addNote } from '@/lib/notes';
import { runAnthropic } from '@/lib/llm/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 60;

// "What we learned" (Settings → Extras): after a call of three minutes or more, a short summary of it is saved to the
// Notebook on the place we ended, so a week later he sees what was covered without having taken notes. Claude Sonnet,
// about a cent a call.
const PROMPT = `You write a short record of one learning session between a learner and his chavrusa, for the learner's notebook.
You get what was said in the session (the chavrusa's words and the learner's), in order.
Write, in plain English:
- First line: the place and subject in a few words ("Yoma 6a: why the Kohen Gadol leaves his home").
- Then 2 to 5 short bullet lines ("- ") with the main points that were learned, in order: what the Gemara asked, how it answered, what was concluded.
- Then, if the learner asked questions, a line "My questions:" and each question in a few words, with the answer in a few words if one was given.
Only what was actually said in the session; never add learning that wasn't there. Learning terms a yeshiva learner knows may be in Hebrew letters. Call God "Hashem". No headings, no bold, no other formatting. At most 140 words.`;

// POST { ref, n, transcript: [{ who: 'me' | 'chavrusa', text }] }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const lines: { who: string; text: string }[] = (Array.isArray(b.transcript) ? b.transcript : [])
    .filter((x: { who?: string; text?: string }) => typeof x?.text === 'string' && x.text.trim())
    .map((x: { who?: string; text: string }) => ({ who: x.who === 'me' ? 'Learner' : 'Chavrusa', text: x.text.replace(/\s+/g, ' ').trim().slice(0, 1500) }));
  const words = lines.reduce((s, x) => s + x.text.split(' ').length, 0);
  if (lines.length < 3 || words < 120) return NextResponse.json({ skipped: true });
  try {
    const model = MODELS.anthropic.middle;
    let text = lines.map((x) => `${x.who}: ${x.text}`).join('\n');
    if (text.length > 30000) text = text.slice(-30000);
    const r = await runAnthropic({ model: model.id, system: PROMPT, history: [{ role: 'user', content: text }], tools: [], execute: async () => '', effort: 'low', thinking: 'disabled', maxSteps: 1 });
    await logCost({ sessionId: null, kind: 'daysummary', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const out = r.text.replace(/\*\*|__|^#+\s*/gm, '').trim();
    if (!out) return NextResponse.json({ skipped: true });
    const ref = String(b.ref ?? '').slice(0, 120);
    const note = await addNote(ref, ref ? Number(b.n) || 1 : 0, out, `what we learned, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`);
    return NextResponse.json({ note });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
