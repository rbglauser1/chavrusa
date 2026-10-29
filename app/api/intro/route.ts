import { NextRequest, NextResponse } from 'next/server';
import { getIntro } from '@/lib/intro';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /:\d+(-\d+)?$/.test(ref)) return NextResponse.json({ intro: '' });
  try {
    return NextResponse.json({ intro: await getIntro(ref) });
  } catch (e) {
    return NextResponse.json({ intro: '', error: (e as Error).message });
  }
}
