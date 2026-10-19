import { NextRequest, NextResponse } from 'next/server';
import { VOICE } from '@/lib/config';
import { getSettings, logCost } from '@/lib/db';
import { prepareForSpeech, speechInstructions } from '@/lib/pronounce';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Turns a Chavrusa reply into speech (MP3).
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const { text, sessionId } = await req.json().catch(() => ({}));
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const s = await getSettings();
  const input = prepareForSpeech(String(text), s.nusach);

  let lastError = '';
  for (const model of VOICE.speechModels) {
    const body: Record<string, unknown> = { model, voice: s.voice, input, response_format: 'mp3', speed: s.speechRate };
    if (!model.startsWith('tts-')) body.instructions = speechInstructions(s.nusach);
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok && res.body) {
      const minutes = input.length / VOICE.charsPerMinute;
      await logCost({ sessionId: sessionId ?? null, kind: 'voice-out', provider: 'openai', model, inputTokens: input.length, outputTokens: 0, costUsd: minutes * VOICE.speechUsdPerMinute }).catch(() => {});
      return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    }
    const data: any = await res.json().catch(() => ({}));
    lastError = data?.error?.message ?? `status ${res.status}`;
    if (!/model|not found|does not exist|access|voice/i.test(lastError) && res.status !== 404) break;
  }
  return NextResponse.json({ error: `Could not create speech: ${lastError}` }, { status: 502 });
}
