import { NextRequest, NextResponse } from 'next/server';
import { addSource, getSession, setSourceFocus, SourceData } from '@/lib/db';

export const runtime = 'nodejs';

// The learner tapped a line in the Sefer: save it as where we are, so the Chavrusa (and a call) starts there.
export async function POST(req: NextRequest) {
  const { sessionId, ref, n, source } = await req.json().catch(() => ({}));
  const line = Number(n);
  if (!sessionId || !ref || !line) return NextResponse.json({ ok: false });
  try {
    if (!(await getSession(String(sessionId)))) return NextResponse.json({ ok: false });
    const moved = await setSourceFocus(String(sessionId), String(ref), line);
    if (!moved && source) await addSource(String(sessionId), { ...(source as SourceData), focus: line });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
