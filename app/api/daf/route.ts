import { NextRequest, NextResponse } from 'next/server';
import { amudOf, dafPdfUrl } from '@/lib/daf';

export const runtime = 'nodejs';

// Tzuras hadaf: the printed page's PDF, fetched from Shas.org by the server and handed to the app from its own address,
// so the app can draw it itself (zoom in place, with the Talk button staying on screen). Kept a month in caches.
export async function GET(req: NextRequest) {
  const a = amudOf(String(req.nextUrl.searchParams.get('ref') ?? ''));
  if (!a) return NextResponse.json({ error: 'Not a page of Gemara.' }, { status: 400 });
  try {
    const r = await fetch(dafPdfUrl(a), { next: { revalidate: 60 * 60 * 24 * 30 } });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/pdf/i.test(type)) return NextResponse.json({ error: `The page couldn't be loaded (${r.status}).` }, { status: 502 });
    return new NextResponse(await r.arrayBuffer(), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=2592000' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
