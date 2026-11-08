import { NextRequest, NextResponse } from 'next/server';
import { approvedList, getSettings, listMessages, listSources } from '@/lib/db';
import { nextEarly } from '@/lib/nextRead';

export const runtime = 'nodejs';

// The next piece, ready in advance (lib/nextRead.ts): free, no AI.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ next: null });
  try {
    const [settings, history, sources, approved] = await Promise.all([getSettings(), listMessages(String(sessionId), 24), listSources(String(sessionId)), approvedList()]);
    return NextResponse.json({ next: await nextEarly({ settings, history, sources, approved }) });
  } catch (e) {
    return NextResponse.json({ next: null, error: (e as Error).message });
  }
}
