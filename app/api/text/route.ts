import { NextRequest, NextResponse } from 'next/server';
import { addSource, approvedList } from '@/lib/db';
import { findRef } from '@/lib/prefetch';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// Opens a source straight from Sefaria, with no AI involved (and no AI cost).
// q = a reference ("Berachos 36a") or a whole message that mentions one.
export async function POST(req: NextRequest) {
  const { q, sessionId, direct } = await req.json().catch(() => ({}));
  const text = String(q ?? '').trim();
  if (!text) return NextResponse.json({ source: null });
  try {
    const ref = await findRef(text, !!direct);
    if (!ref) return NextResponse.json({ source: null, message: direct ? `Couldn't find "${text}". Try a form like "Berachos 36a" or "Rashi on Genesis 1:1".` : undefined });
    const s = await getText(ref, await approvedList());
    if (!s.verdict.allowed) return NextResponse.json({ source: null, message: `${s.verdict.reason}` });
    if (!s.he.length && !s.en.length) return NextResponse.json({ source: null, message: `No text found for ${ref}.` });
    const { verdict, ...source } = s;
    if (sessionId) await addSource(String(sessionId), source).catch(() => {});
    return NextResponse.json({ source });
  } catch (e) {
    return NextResponse.json({ source: null, message: `Sefaria didn't answer: ${(e as Error).message}` });
  }
}
