import { NextRequest, NextResponse } from 'next/server';
import { relatedLines, TANAKH } from '@/lib/related';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The "Sources" button on a line: what Sefaria links to each line of an amud / perek (lib/related). Free, no AI.
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ lines: {} });
  try {
    return NextResponse.json({ lines: await relatedLines(ref), tanakh: TANAKH.test(ref) });
  } catch (e) {
    return NextResponse.json({ lines: {}, error: (e as Error).message });
  }
}
