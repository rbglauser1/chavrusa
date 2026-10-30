import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_LIVE, LIVE } from '@/lib/config';
import { logCost } from '@/lib/db';

// Records the length of a finished Live session for cost tracking.
export async function POST(req: NextRequest) {
  const { seconds, sessionId, engine } = await req.json().catch(() => ({}));
  const secs = Math.max(0, Number(seconds) || 0);
  if (!secs) return NextResponse.json({ ok: true });
  const gem = engine === 'gemini';
  await logCost({ sessionId: sessionId ?? null, kind: 'voice-live', provider: gem ? 'google' : 'openai', model: gem ? GEMINI_LIVE.model : LIVE.model, inputTokens: Math.round(secs), outputTokens: 0, costUsd: (secs / 60) * (gem ? GEMINI_LIVE.usdPerMinute : LIVE.usdPerMinute) });
  return NextResponse.json({ ok: true });
}
