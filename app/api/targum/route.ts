import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// Onkelos on a perek of Chumash (Settings → Onkelos): the Aramaic of each pasuk, with Sefaria's English when it has one.
// Straight from Sefaria, no AI.
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d+$/.test(ref)) return NextResponse.json({ he: [], en: [] });
  try {
    const s = await getText(`Onkelos ${ref}`, await approvedList());
    const en = s.en.length ? s.en : (s.altEn ?? []);
    return NextResponse.json({ he: s.he, en, translation: s.en.length ? s.translation : s.altTitle ?? null });
  } catch (e) {
    return NextResponse.json({ he: [], en: [], error: (e as Error).message });
  }
}
