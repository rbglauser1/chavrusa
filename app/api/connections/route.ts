import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getLinks } from '@/lib/sefaria';

export const runtime = 'nodejs';

// Which commentaries Sefaria has on each part of a text (like Sefaria's side panel): { "3": [{ title, refs }] }.
// Straight from Sefaria, no AI.
export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref) return NextResponse.json({ lines: {} });
  try {
    const { allowed } = await getLinks(ref, await approvedList(), ['Commentary', 'Targum', 'Halakhah'], 600);
    const lines: Record<string, Record<string, string[]>> = {};
    for (const l of allowed) {
      // "Shulchan Arukh, Orach Chayim 1:1" / "Berakhot 2a:3" / "Genesis 1:3-5" -> part 1 / 3 / 3
      const n = l.anchor?.match(/:(\d+)(?:-\d+)?$/)?.[1] ?? (l.anchor === ref ? '1' : null);
      if (!n || !l.title) continue;
      ((lines[n] ??= {})[l.title] ??= []).push(l.ref);
    }
    const out: Record<string, { title: string; refs: string[] }[]> = {};
    for (const [n, byTitle] of Object.entries(lines)) out[n] = Object.entries(byTitle).map(([title, refs]) => ({ title, refs: refs.slice(0, 12) }));
    return NextResponse.json({ lines: out });
  } catch (e) {
    return NextResponse.json({ lines: {}, error: (e as Error).message });
  }
}
