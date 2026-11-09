import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// Offline reading: one section's text for the phone to keep (nothing is added to a session).
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 });
  try {
    const s = await getText(ref, await approvedList());
    if (!s.verdict.allowed || !s.he.length) return NextResponse.json({ error: 'Not available' }, { status: 404 });
    const { verdict: _v, ...src } = s; void _v;
    return NextResponse.json({ source: src });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
