import { NextRequest, NextResponse } from 'next/server';
import { VOICE } from '@/lib/config';
import { logCost } from '@/lib/db';
import { writeBytes, signedUrl } from '@/lib/store';
import { TRANSCRIBE_HINT } from '@/lib/pronounce';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Voice notes (Nov 14): POST a recording (multipart: audio, seconds) → it is kept in Storage under notes-audio/ and
// written out in words → { audio: path, text }. GET ?path=notes-audio/… → { url } to play it.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get('audio');
    const seconds = Math.min(Number(form.get('seconds') ?? 0) || 0, 900);
    if (!(audio instanceof Blob) || audio.size < 800) return NextResponse.json({ error: 'The recording was empty.' }, { status: 400 });
    if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'The recording is too long (15 minutes at most).' }, { status: 400 });
    const ext = audio.type.includes('mp4') || audio.type.includes('m4a') || audio.type.includes('aac') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    const path = `notes-audio/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const bytes = Buffer.from(await audio.arrayBuffer());
    await writeBytes(path, bytes, audio.type || `audio/${ext}`);
    // Written out in words, so the note can be read and searched. If it fails, the recording is still kept.
    let text = '';
    const key = process.env.OPENAI_API_KEY;
    if (key) for (const model of VOICE.transcribeModels) {
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(bytes)], { type: audio.type }), `note.${ext}`);
      fd.append('model', model);
      fd.append('prompt', TRANSCRIBE_HINT);
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) {
        text = String(data.text ?? '').trim();
        await logCost({ sessionId: null, kind: 'voice-note', provider: 'openai', model, inputTokens: 0, outputTokens: 0, costUsd: (Math.max(seconds, 1) / 60) * VOICE.transcribeUsdPerMinute }).catch(() => {});
        break;
      }
      const err = data?.error?.message ?? '';
      if (!/model|not found|does not exist|access/i.test(err) && res.status !== 404) break;
    }
    return NextResponse.json({ audio: path, text });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const path = String(req.nextUrl.searchParams.get('path') ?? '');
  if (!/^notes-audio\/[a-z0-9]+\.(m4a|webm|ogg)$/.test(path)) return NextResponse.json({ error: 'Not a voice note.' }, { status: 400 });
  const url = await signedUrl(path, 60 * 60);
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: 'The recording could not be found.' }, { status: 404 });
}
