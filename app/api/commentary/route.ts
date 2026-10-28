import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// One commentary (Bartenura, Rashi, Tosafos…) on one mishnah / pasuk / line, straight from Sefaria. No AI.
const NAMES: Record<string, string> = { bartenura: 'Bartenura', rashi: 'Rashi', tosafot: 'Tosafot', ramban: 'Ramban', tyt: 'Tosafot Yom Tov' };

export async function GET(req: NextRequest) {
  // A list of exact commentary references (from /api/connections): fetch them all.
  const refs = (req.nextUrl.searchParams.get('refs') ?? '').split('|').filter(Boolean).slice(0, 12);
  if (refs.length) {
    const list = await approvedList();
    const got = await Promise.all(refs.map((r: string) => getText(r, list).catch(() => null)));
    type T = Awaited<ReturnType<typeof getText>>;
    const ok = got.filter((x: T | null) => !!x && x.verdict.allowed) as T[];
    if (!ok.length) return NextResponse.json({ empty: true });
    const parts = refs.map((r: string, i: number) => ({ ref: r, got: got[i] })).filter((p: { got: T | null }) => p.got && p.got.verdict.allowed).map((p: { ref: string; got: T | null }) => ({ ref: p.ref, he: p.got!.he, en: p.got!.en }));
    return NextResponse.json({ parts, he: ok.flatMap((x: T) => x.he), en: ok.flatMap((x: T) => (x.en.length === x.he.length ? x.en : x.he.map((_: string, k: number) => x.en[k] ?? ''))) });
  }
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
