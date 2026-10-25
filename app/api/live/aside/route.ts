import { NextRequest, NextResponse } from 'next/server';
import { addMessage, createSession, getSession, touchSession } from '@/lib/db';

export const runtime = 'nodejs';

// Saves a stretch of conversation the Live voice handled by itself (no AI brain, no cost beyond the call),
// so it shows in the session and the brain knows what was said when it's next asked.
export async function POST(req: NextRequest) {
  const { sessionId, user, voice } = await req.json().catch(() => ({}));
  const u = String(user ?? '').trim();
  const v = String(voice ?? '').trim();
  if (!u && !v) return NextResponse.json({ ok: true });
  let sid: string | null = sessionId && (await getSession(String(sessionId))) ? String(sessionId) : null;
  let created = null;
  if (!sid) { created = await createSession((u || v).slice(0, 60)); sid = created.id; }
  const usage = { ai: false, reason: 'The voice answered by itself (part of the call)' };
  if (u) await addMessage(sid, 'user', u);
  if (v) await addMessage(sid, 'assistant', v, { usage, voiceOnly: true });
  await touchSession(sid);
  return NextResponse.json({ ok: true, session: created });
}
