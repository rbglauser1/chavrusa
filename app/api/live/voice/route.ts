import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';

export const runtime = 'nodejs';

// Design a Live voice from a written description (OpenAI prompt-to-voice), save it, and select it.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const { name, prompt, script } = await req.json().catch(() => ({}));
  if (!prompt || String(prompt).trim().length < 20) return NextResponse.json({ error: 'Describe the voice in at least a sentence.' }, { status: 400 });
  const body: Record<string, unknown> = { type: 'prompt', name: String(name || 'Custom voice').slice(0, 60), prompt: String(prompt).slice(0, 2000), model: 'auto' };
  if (script && String(script).trim().length > 40) body.script_hint = String(script).slice(0, 2000);

  const res = await fetch('https://api.openai.com/v1/audio/voices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    return NextResponse.json({ error: `OpenAI couldn't create the voice (${res.status}): ${data?.error?.message ?? 'unknown error'}` }, { status: 502 });
  }
  const s = await getSettings();
  const voice = { id: String(data.id), name: String(body.name), prompt: String(body.prompt) };
  const saved = await saveSettings({ customVoices: [...(s.customVoices ?? []).filter((v) => v.id !== voice.id), voice], liveVoice: voice.id });
  return NextResponse.json({ voice, settings: saved });
}

// Remove a designed voice from the app (it stays in your OpenAI account).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const s = await getSettings();
  const customVoices = (s.customVoices ?? []).filter((v) => v.id !== id);
  const saved = await saveSettings({ customVoices, liveVoice: s.liveVoice === id ? 'meridian' : s.liveVoice });
  return NextResponse.json({ settings: saved });
}
