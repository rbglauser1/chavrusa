import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getLinks } from '@/lib/sefaria';

export const runtime = 'nodejs';
export const maxDuration = 60;

// What the sugya map shows beside the AI's outline, straight from Sefaria's links (no AI, no cost), each by the line
// of this text it belongs to:
//   halacha: where the halacha is ruled (Rambam, Shulchan Aruch, Tur…)
//   verses:  the pesukim quoted (not on a perek of Tanach itself)
//   comm:    the meforshim on each line (Rashi, Tosafos, Ramban, Bartenura…)
// Only seforim on the approved list.
type Item = { line: number; title: string; ref: string };

const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
// The main codes first.
const codeRank = (r: string) => (/^Mishneh Torah/.test(r) ? 0 : /^Shulchan Arukh/.test(r) ? 1 : /^Tur\b/.test(r) ? 2 : 3);
// Familiar names for the codes.
const niceHalacha = (r: string) => r.replace(/^Mishneh Torah, /, 'Rambam, ').replace(/^Shulchan Arukh/, 'Shulchan Aruch');

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  const empty = { halacha: [], verses: [], comm: {} };
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json(empty);
  try {
    const { allowed } = await getLinks(ref, await approvedList(), ['Commentary', 'Targum', 'Halakhah', 'Tanakh'], 100000);
    const halacha: Item[] = [], verses: Item[] = [];
    const comm: Record<string, Record<string, string[]>> = {};
    const seen = new Set<string>();
    for (const l of allowed) {
      const n = Number(l.anchor?.match(/:(\d+)(?:-\d+)?$/)?.[1] ?? (l.anchor === ref ? 1 : NaN));
      if (!Number.isFinite(n)) continue;
      const cat = l.category.toLowerCase();
      if (cat.includes('halakhah')) {
        if (seen.has(l.ref)) continue; seen.add(l.ref);
        halacha.push({ line: n, title: niceHalacha(l.ref), ref: l.ref });
      } else if (cat.includes('tanakh')) {
        if (TANAKH.test(ref) || seen.has(l.ref)) continue; seen.add(l.ref);
        verses.push({ line: n, title: l.ref, ref: l.ref });
      } else if (l.title) {
        ((comm[n] ??= {})[l.title] ??= []).push(l.ref);
      }
    }
    halacha.sort((a, b) => a.line - b.line || codeRank(a.ref) - codeRank(b.ref));
    verses.sort((a, b) => a.line - b.line);
    const out: Record<string, { title: string; refs: string[] }[]> = {};
    for (const [n, byTitle] of Object.entries(comm)) out[n] = Object.entries(byTitle).map(([title, refs]) => ({ title, refs: refs.slice(0, 12) }));
    return NextResponse.json({ halacha: halacha.slice(0, 60), verses: verses.slice(0, 60), comm: out });
  } catch (e) {
    return NextResponse.json({ ...empty, error: (e as Error).message });
  }
}
