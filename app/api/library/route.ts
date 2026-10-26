import { NextRequest, NextResponse } from 'next/server';
import { bookShape, libraryList } from '@/lib/library';

export const runtime = 'nodejs';

// GET ?path=Tanakh|Torah   -> categories and seforim at that place in Sefaria's library
// GET ?book=Genesis[&part=…] -> how to pick a place in that sefer (perakim, dapim, or named parts)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const book = p.get('book');
    if (book) return NextResponse.json(await bookShape(book, p.get('part') ?? undefined));
    const path = (p.get('path') ?? '').split('|').filter(Boolean);
    return NextResponse.json({ items: await libraryList(path) });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't reach Sefaria's library: ${(e as Error).message}` }, { status: 502 });
  }
}
