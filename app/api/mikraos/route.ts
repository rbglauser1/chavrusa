import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { MEFORSHIM, MG_DEFAULT } from '@/lib/mikraos';
import { getLinks, getPerPasuk, getText } from '@/lib/sefaria';

// The meforshim on Rashi (supercommentaries), found through Sefaria's links from each Rashi comment.
const ON_RASHI = /Gur Aryeh|Mizrachi|Siftei Chakhamim|Divrei David|Be'?er BaSadeh|Maskil LeDavid|Levush HaOrah|Nachalat Yaakov|Yeriot Shlomo|Da'?at Zekenim|Imrei Shefer|Sefer HaZikaron/i;

export const runtime = 'nodejs';
export const maxDuration = 30;

// Mikraos Gedolos: one perek of Chumash with Onkelos and the meforshim the learner chose, each comment kept with its
// pasuk, and (if asked) Sefaria's English under each. Straight from Sefaria (approved sources only), no AI.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ref = String(q.get('ref') ?? '').replace(/:.*$/, '');
  const m = ref.match(/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) (\d+)$/);
  if (!m) return NextResponse.json({ error: 'Mikraos Gedolos is for a perek of Chumash.' }, { status: 400 });
  const [, book, perek] = m;
  const wantEn = q.get('en') === '1';
  const wantOnk = q.get('onk') !== '0';
  const ids = (q.get('m') ?? MG_DEFAULT.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
  const chosen = ids.map((id) => MEFORSHIM.find((x) => x.id === id)).filter((x): x is (typeof MEFORSHIM)[number] => !!x).slice(0, 12);
  try {
    const list = await approvedList();
    const rashiOn = chosen.some((x) => x.id === 'Rashi')
      ? getLinks(`Rashi on ${ref}`, list, undefined, 500).then((r) => r.allowed).catch(() => [])
      : Promise.resolve([]);
    const [base, onk, ...comms] = await Promise.all([
      getText(ref, list),
      wantOnk ? getPerPasuk(`Onkelos ${ref}`, list, wantEn).catch(() => null) : Promise.resolve(null),
      ...chosen.map((x) => getPerPasuk(`${x.title(book)} ${perek}`, list, wantEn).catch(() => null)),
    ]);
    if (!base.verdict.allowed) return NextResponse.json({ error: 'Not on the approved list.' }, { status: 403 });
    // Which meforshim on Rashi speak about each Rashi comment: "pasuk:comment" (1-based) -> [{ title, refs }].
    const onRashi: Record<string, { title: string; refs: string[] }[]> = {};
    for (const l of await rashiOn) {
      if (!ON_RASHI.test(l.title)) continue;
      const m2 = (l.anchor ?? '').match(/^Rashi on .+? \d+:(\d+):(\d+)/);
      if (!m2) continue;
      const key = `${m2[1]}:${m2[2]}`;
      const list2 = (onRashi[key] ??= []);
      const have = list2.find((x) => x.title === l.title);
      if (have) { if (!have.refs.includes(l.ref)) have.refs.push(l.ref); } else list2.push({ title: l.title, refs: [l.ref] });
    }
    return NextResponse.json({
      ref: base.ref, heRef: base.heRef,
      pesukim: base.he,
      pesukimEn: wantEn ? (base.en.length ? base.en : base.altEn ?? []) : [],
      onkelos: onk ? onk.map((p) => p[0] ?? { he: '', en: '' }) : [],
      meforshim: chosen.map((x, i) => ({ id: x.id, he: x.he, name: x.name, perPasuk: comms[i] ?? [], missing: !comms[i], title: `${x.title(book)} ${perek}` })),
      onRashi,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
