import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// One commentary (Bartenura, Rashi, Tosafos…) on one mishnah / pasuk / line, straight from Sefaria. No AI.
const NAMES: Record<string, string> = { bartenura: 'Bartenura', rashi: 'Rashi', tosafot: 'Tosafot', ramban: 'Ramban', tyt: 'Tosafot Yom Tov' };

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const who = NAMES[String(req.nextUrl.searchParams.get('who') ?? '').toLowerCase()];
  if (!ref || !who) return NextResponse.json({ error: 'Missing reference.' }, { status: 400 });
  try {
    const s = await getText(`${who} on ${ref}`, await approvedList());
    if (!s.verdict.allowed) return NextResponse.json({ error: `${who} isn't on the approved list.` });
    if (!s.he.length && !s.en.length) return NextResponse.json({ empty: true, ref: `${who} on ${ref}` });
    return NextResponse.json({ ref: s.ref, he: s.he, en: s.en, translation: s.translation });
  } catch {
    return NextResponse.json({ empty: true, ref: `${who} on ${ref}` });
  }
}
