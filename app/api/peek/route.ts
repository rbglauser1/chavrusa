import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// The next amud / perek, to show under the one being learned (so the text just keeps going). Free, no AI, not saved.
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref) return NextResponse.json({ error: 'Missing reference.' }, { status: 400 });
  try {
    const s = await getText(ref, await approvedList());
    if (!s.verdict.allowed || !s.he.length) return NextResponse.json({ empty: true });
    const out: Record<string, unknown> = { ...s };
    delete out.verdict;
    return NextResponse.json({ source: out });
  } catch {
    return NextResponse.json({ empty: true });
  }
}
