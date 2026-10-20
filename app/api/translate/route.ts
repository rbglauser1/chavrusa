import { NextRequest, NextResponse } from 'next/server';
import { costUsd, MODELS } from '@/lib/config';
import { getSettings, logCost } from '@/lib/db';
import { TRANSLATE_PROMPT } from '@/lib/instructions';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Translates one line or passage the learner tapped, using the basic model of their chosen provider.
export async function POST(req: NextRequest) {
  const { text, sessionId } = await req.json().catch(() => ({}));
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  try {
    const settings = await getSettings();
    const model = MODELS[settings.provider].basic;
    const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
    const r = await run({
      model: model.id, system: TRANSLATE_PROMPT, history: [{ role: 'user', content: String(text).slice(0, 6000) }],
      tools: [], execute: async () => '', effort: model.effort, thinking: model.thinking, maxSteps: 1,
    });
    await logCost({ sessionId: sessionId ?? null, kind: 'translate', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) });
    return NextResponse.json({ translation: r.text });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
