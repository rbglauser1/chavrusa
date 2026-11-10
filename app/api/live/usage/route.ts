import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_LIVE, LIVE } from '@/lib/config';
import { logCost } from '@/lib/db';

// Records the length of a finished Live session for cost tracking.
export async function POST(req: NextRequest) {
  const { seconds, sessionId, engine } = await req.json().catch(() => ({}));
  const secs = Math.min(6 * 3600, Math.max(0, Number(seconds) || 0)); // never more than 6 hours in one report
  if (!secs) return NextResponse.json({ ok: true });
  const gem = engine === 'gemini';
  await logCost({ sessionId: sessionId ?? null, kind: 'voice-live', provider: gem ? 'google' : 'openai', model: gem ? GEMINI_LIVE.model : LIVE.model, inputTokens: Math.round(secs), outputTokens: 0, costUsd: (secs / 60) * (gem ? GEMINI_LIVE.usdPerMinute : LIVE.usdPerMinute) });
  return NextResponse.json({ ok: true });
}
