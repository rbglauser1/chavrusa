import 'server-only';
import { approvedList } from './db';
import { getLinks } from './sefaria';

// What Sefaria links to each line of an amud / perek, other than its meforshim, sorted into groups (the "Sources"
// button on a line, and the AI's "Ideas from these sources"). Only seforim on the approved list. No AI.
export type Item = { title: string; ref: string };
export type Groups = { halacha: Item[]; parallels: Item[]; midrash: Item[]; verses: Item[]; thought: Item[] };

export const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
const nice = (r: string) => r.replace(/^Mishneh Torah, /, 'Rambam, ').replace(/^Shulchan Arukh/, 'Shulchan Aruch');
const codeRank = (r: string) => (/^Mishneh Torah/.test(r) ? 0 : /^Shulchan Arukh/.test(r) ? 1 : /^Tur\b/.test(r) ? 2 : /^Mishnah Berurah/.test(r) ? 3 : 4);

function groupOf(cat: string): keyof Groups | null {
  const c = cat.toLowerCase();
  if (c.includes('halakhah')) return 'halacha';
  if (c === 'talmud' || c === 'mishnah' || c === 'tosefta') return 'parallels';
  if (c.includes('midrash')) return 'midrash';
  if (c === 'tanakh') return 'verses';
  if (c.includes('jewish thought') || c.includes('musar') || c.includes('chasidut') || c.includes('kabbalah')) return 'thought';
  return null;
}

/** Every line's groups: { "3": { halacha: [...], ... } }. */
export async function relatedLines(ref: string): Promise<Record<string, Groups>> {
  const { allowed } = await getLinks(ref, await approvedList(), ['Halakhah', 'Talmud', 'Mishnah', 'Tosefta', 'Midrash', 'Tanakh', 'Jewish Thought', 'Musar', 'Chasidut', 'Kabbalah'], 100000);
  const lines: Record<string, Groups> = {};
  const seen = new Set<string>();
  for (const l of allowed) {
    const n = l.anchor?.match(/:(\d+)(?:-\d+)?$/)?.[1] ?? (l.anchor === ref ? '1' : null);
    const g = groupOf(l.category);
    if (!n || !g || seen.has(`${n}|${l.ref}`)) continue;
    seen.add(`${n}|${l.ref}`);
    const box = (lines[n] ??= { halacha: [], parallels: [], midrash: [], verses: [], thought: [] });
    box[g].push({ title: g === 'halacha' ? nice(l.ref) : l.ref, ref: l.ref });
  }
  for (const box of Object.values(lines)) {
    box.halacha.sort((a, b) => codeRank(a.ref) - codeRank(b.ref));
    for (const k of Object.keys(box) as (keyof Groups)[]) box[k] = box[k].slice(0, 12);
  }
  return lines;
}
