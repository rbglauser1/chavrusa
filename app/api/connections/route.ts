import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getLinks, indexInfo, bookTitleFromRef } from '@/lib/sefaria';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Which commentaries Sefaria has on each part of a text (like Sefaria's side panel): { "3": [{ title, refs }] }.
// Straight from Sefaria, no AI.
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref) return NextResponse.json({ lines: {} });
  try {
    // No cut-off: a perek of Chumash can have thousands of links, and a cut-off dropped whole commentators.
    const { allowed } = await getLinks(ref, await approvedList(), ['Commentary', 'Targum', 'Halakhah'], 100000);
    const lines: Record<string, Record<string, string[]>> = {};
    for (const l of allowed) {
      // "Shulchan Arukh, Orach Chayim 1:1" / "Berakhot 2a:3" / "Genesis 1:3-5" -> part 1 / 3 / 3
      const n = l.anchor?.match(/:(\d+)(?:-\d+)?$/)?.[1] ?? (l.anchor === ref ? '1' : null);
      if (!n || !l.title) continue;
      ((lines[n] ??= {})[l.title] ??= []).push(l.ref);
    }
    // Each commentator's era (Nov 16): Geonim 0, Rishonim 1, Acharonim 2, unknown 3, and its year, so the list reads
    // Rishonim before Acharonim. The book was already looked up when it was approved, so this is quick.
    const firstRef: Record<string, string> = {};
    for (const byTitle of Object.values(lines)) for (const [t, refs] of Object.entries(byTitle)) firstRef[t] ??= refs[0];
    const era: Record<string, { era: number; year: number | null }> = {};
    await Promise.all(Object.entries(firstRef).map(async ([t, r]) => {
      try {
        const info = await indexInfo(bookTitleFromRef(r));
        const cats = info.categories.join(' ');
        const y = info.year;
        const e = /Geonim/i.test(cats) ? 0 : /Rishonim/i.test(cats) ? 1 : /Acharonim/i.test(cats) ? 2 : y != null ? (y < 1040 ? 0 : y < 1500 ? 1 : 2) : 3;
        era[t] = { era: e, year: y };
      } catch { era[t] = { era: 3, year: null }; }
    }));
    const out: Record<string, { title: string; refs: string[]; era?: number; year?: number | null }[]> = {};
    for (const [n, byTitle] of Object.entries(lines)) out[n] = Object.entries(byTitle).map(([title, refs]) => ({ title, refs: refs.slice(0, 12), era: era[title]?.era, year: era[title]?.year }));
    return NextResponse.json({ lines: out });
  } catch (e) {
    return NextResponse.json({ lines: {}, error: (e as Error).message });
  }
}
