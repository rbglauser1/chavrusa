import { NextRequest, NextResponse } from 'next/server';
import { VOICE } from '@/lib/config';
import { logCost } from '@/lib/db';
import { TRANSCRIBE_HINT } from '@/lib/pronounce';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Receives a short recording from the microphone and returns the text.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const form = await req.formData();
  const audio = form.get('audio');
  const seconds = Number(form.get('seconds') ?? 0);
  const sessionId = (form.get('sessionId') as string) || null;
  if (!(audio instanceof Blob) || audio.size < 1000) return NextResponse.json({ text: '' });

  let lastError = '';
  for (const model of VOICE.transcribeModels) {
    const fd = new FormData();
    const ext = (audio.type.includes('mp4') || audio.type.includes('m4a')) ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    fd.append('file', audio, `speech.${ext}`);
    fd.append('model', model);
    fd.append('prompt', TRANSCRIBE_HINT);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok) {
      const minutes = Math.max(seconds, 1) / 60;
      await logCost({ sessionId, kind: 'voice-in', provider: 'openai', model, inputTokens: 0, outputTokens: 0, costUsd: minutes * VOICE.transcribeUsdPerMinute }).catch(() => {});
      return NextResponse.json({ text: String(data.text ?? '').trim(), model });
    }
    lastError = data?.error?.message ?? `status ${res.status}`;
    // Only try the next model if this one isn't available; other errors are real.
    if (!/model|not found|does not exist|access/i.test(lastError) && res.status !== 404) break;
  }
  return NextResponse.json({ error: `Could not transcribe: ${lastError}` }, { status: 502 });
}
