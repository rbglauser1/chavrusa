import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getLinks } from '@/lib/sefaria';

export const runtime = 'nodejs';
export const maxDuration = 60;

// "From the sugya to the halacha" (components/HalachaTrail.tsx): the last stage. Given a se'if of the Shulchan Aruch
// (or a halacha of the Rambam), what stands on it: the Mishnah Berurah first, then the classic commentaries around
// the page. Straight from Sefaria's links (free, no AI); only seforim on the approved list.
const ON: [RegExp, string][] = [
  [/^Mishnah Berurah/, 'Mishnah Berurah'], [/^Bi'?ur Halacha|^Beur Halacha/, 'Biur Halacha'], [/^Sha'?ar HaTziyun/, 'Shaar HaTziyun'],
  [/^Magen Avraham/, 'Magen Avraham'], [/^Turei Zahav/, 'Taz'], [/^Siftei Kohen/, 'Shach'], [/^Ba'?er Hetev|^Be'?er Hetev/, 'Be’er Heitev'],
  [/^Arukh HaShulchan/, 'Aruch HaShulchan'], [/^Kessef Mishneh|^Kesef Mishneh/, 'Kesef Mishneh'], [/^Maggid Mishneh/, 'Maggid Mishneh'],
];

// GET ?ref=Shulchan Arukh, Orach Chayim 235:1 → { on: [{ title, ref }] }
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').slice(0, 200);
  if (!/^(Shulchan Arukh|Mishneh Torah|Tur)\b/.test(ref)) return NextResponse.json({ on: [] });
  try {
    const { allowed } = await getLinks(ref, await approvedList(), undefined, 100000);
    const seen = new Set<string>();
    const on: { title: string; ref: string; rank: number }[] = [];
    for (const l of allowed) {
      const k = ON.findIndex(([re]) => re.test(l.ref));
      if (k < 0 || seen.has(l.ref)) continue;
      seen.add(l.ref);
      on.push({ title: l.ref.replace(ON[k][0], ON[k][1]), ref: l.ref, rank: k });
    }
    on.sort((a, b) => a.rank - b.rank || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    return NextResponse.json({ on: on.slice(0, 14).map(({ title, ref: r }) => ({ title, ref: r })) }, { headers: { 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) { return NextResponse.json({ on: [], error: (e as Error).message }); }
}
