import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { MEFORSHIM, MG_DEFAULT } from '@/lib/mikraos';
import { getPerPasuk, getText } from '@/lib/sefaria';

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
    const [base, onk, ...comms] = await Promise.all([
      getText(ref, list),
      wantOnk ? getPerPasuk(`Onkelos ${ref}`, list, wantEn).catch(() => null) : Promise.resolve(null),
      ...chosen.map((x) => getPerPasuk(`${x.title(book)} ${perek}`, list, wantEn).catch(() => null)),
    ]);
    if (!base.verdict.allowed) return NextResponse.json({ error: 'Not on the approved list.' }, { status: 403 });
    return NextResponse.json({
      ref: base.ref, heRef: base.heRef,
      pesukim: base.he,
      pesukimEn: wantEn ? (base.en.length ? base.en : base.altEn ?? []) : [],
      onkelos: onk ? onk.map((p) => p[0] ?? { he: '', en: '' }) : [],
      meforshim: chosen.map((x, i) => ({ id: x.id, he: x.he, name: x.name, perPasuk: comms[i] ?? [], missing: !comms[i] })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
