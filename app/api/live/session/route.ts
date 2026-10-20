import { NextRequest, NextResponse } from 'next/server';
import { LIVE, LIVE_VOICES, VOICE_SAMPLE } from '@/lib/config';
import { getSettings } from '@/lib/db';
import { liveInstructions } from '@/lib/live';

export const runtime = 'nodejs';

// The browser sends its WebRTC offer here; we start a GPT-Live session with our key and return the answer.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const sdp = await req.text();
  if (!sdp.startsWith('v=')) return NextResponse.json({ error: 'Missing WebRTC offer.' }, { status: 400 });
  const s = await getSettings();
  const askVoice = req.nextUrl.searchParams.get('voice');
  const preview = req.nextUrl.searchParams.get('preview') === '1';
  const allowed = [...LIVE_VOICES.map((v) => v.id), ...(s.customVoices ?? []).map((v) => v.id)];
  const voice = askVoice && allowed.includes(askVoice) ? askVoice : (s.liveVoice || 'meridian');

  const res = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        model: LIVE.model,
        instructions: preview
          ? `As soon as the session starts, without waiting for the user, say exactly this in a warm, natural voice, then stop: "${VOICE_SAMPLE}"`
          : liveInstructions(s.nusach),
        audio: { output: { voice } },
        delegation: { type: 'client' },
      },
      transport: { type: 'webrtc', sdp },
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: `Live voice could not start (${res.status}): ${data?.error?.message ?? 'unknown error'}` }, { status: 502 });
  }
  const answer = data?.transport?.sdp;
  if (!answer) return NextResponse.json({ error: 'Live voice returned no connection details.' }, { status: 502 });
  return NextResponse.json({ sdp: answer, sessionId: data?.session?.id ?? null });
}
