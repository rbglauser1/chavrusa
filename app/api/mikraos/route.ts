import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getPerPasuk, getText } from '@/lib/sefaria';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Mikraos Gedolos: one perek of Chumash with Onkelos and the main meforshim, each comment kept with its pasuk, so the
// app can lay it out like a printed page. Straight from Sefaria (approved sources only), no AI. Cached by Sefaria calls.
const MEFORSHIM: [string, string][] = [['Rashi', 'רש״י'], ['Ramban', 'רמב״ן'], ['Ibn Ezra', 'אבן עזרא'], ['Sforno', 'ספורנו'], ['Or HaChaim', 'אור החיים']];

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').replace(/:.*$/, '');
  if (!/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d+$/.test(ref)) return NextResponse.json({ error: 'Mikraos Gedolos is for a perek of Chumash.' }, { status: 400 });
  try {
    const list = await approvedList();
    const [base, onk, ...comms] = await Promise.all([
      getText(ref, list),
      getText(`Onkelos ${ref}`, list).catch(() => null),
      ...MEFORSHIM.map(([en]) => getPerPasuk(`${en} on ${ref}`, list).catch(() => null)),
    ]);
    if (!base.verdict.allowed) return NextResponse.json({ error: 'Not on the approved list.' }, { status: 403 });
    return NextResponse.json({
      ref: base.ref, heRef: base.heRef,
      pesukim: base.he,
      onkelos: onk?.verdict.allowed ? onk.he : [],
      meforshim: MEFORSHIM.map(([en, he], i) => ({ en, he, perPasuk: comms[i] ?? [] })).filter((m) => m.perPasuk.some((p) => p.length)),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
