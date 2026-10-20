import { NextRequest, NextResponse } from 'next/server';
import { LIVE } from '@/lib/config';
import { logCost } from '@/lib/db';

// Records the length of a finished Live session for cost tracking.
export async function POST(req: NextRequest) {
  const { seconds, sessionId } = await req.json().catch(() => ({}));
  const secs = Math.max(0, Number(seconds) || 0);
  if (!secs) return NextResponse.json({ ok: true });
  await logCost({ sessionId: sessionId ?? null, kind: 'voice-live', provider: 'openai', model: LIVE.model, inputTokens: Math.round(secs), outputTokens: 0, costUsd: (secs / 60) * LIVE.usdPerMinute });
  return NextResponse.json({ ok: true });
}
