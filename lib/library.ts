import 'server-only';
// A browser for Sefaria's library: categories -> seforim -> perakim / dapim / parts. No AI.
import { indexWithCounts, rawIndex, sefariaToc } from './sefaria';

export interface LibItem { kind: 'category' | 'book'; name: string; he: string }
export interface BookShape {
  title: string; he: string;
  // chapters: perek/chapter numbers 1..count; talmud: dapim 2..lastDaf (a/b); parts: named sections
  kind: 'chapters' | 'talmud' | 'parts' | 'open';
  count?: number; lastDaf?: number; unit?: string;
  parts?: { name: string; he: string }[];
}

// Categories that are modern or reference material are left out of the browser (the approved-source rules still apply when opening).
const HIDDEN = /Modern|Contemporary|Reference|Second Temple|Dictionary|Academic|Translations/i;
const ORDER = ['Tanakh', 'Mishnah', 'Talmud', 'Midrash', 'Halakhah', 'Kabbalah', 'Liturgy', 'Jewish Thought', 'Tosefta', 'Chasidut', 'Musar', 'Responsa'];

export async function libraryList(path: string[]): Promise<LibItem[]> {
  let level: any[] = await sefariaToc();
  for (const p of path) {
    const next = level.find((n) => n.category === p);
    if (!next) return [];
    level = Array.isArray(next.contents) ? next.contents : [];
  }
  const items: LibItem[] = level
    .filter((n) => (n.category ? !HIDDEN.test(n.category) : !!n.title))
    .map((n) => (n.category
      ? { kind: 'category' as const, name: String(n.category), he: String(n.heCategory ?? '') }
      : { kind: 'book' as const, name: String(n.title), he: String(n.heTitle ?? '') }));
  if (!path.length) items.sort((a, b) => (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99));
  return items;
}

const nodeName = (n: any): { name: string; he: string } => ({
  name: String(n?.title ?? n?.titles?.find((x: any) => x.lang === 'en' && x.primary)?.text ?? ''),
  he: String(n?.heTitle ?? n?.titles?.find((x: any) => x.lang === 'he' && x.primary)?.text ?? ''),
});
const isDefault = (n: any) => n?.default === true || !nodeName(n).name;
const DEFAULT_PART = '(main text)';

// How many sections (chapters, simanim…) a part has: from its lengths, or from Sefaria's content counts.
function sectionCount(node: any, counted: any): number {
  const lengths: number[] = Array.isArray(node?.lengths) ? node.lengths : [];
  if (lengths[0]) return lengths[0];
  const cc = counted?.content_counts ?? node?.content_counts;
  return Array.isArray(cc) ? cc.length : 0;
}

function shapeOf(title: string, he: string, node: any, counted: any): BookShape {
  const nodes: any[] = Array.isArray(node?.nodes) ? node.nodes : [];
  if (nodes.length) {
    return { title, he, kind: 'parts', parts: nodes.map((n) => (isDefault(n) ? { name: DEFAULT_PART, he: '' } : nodeName(n))).filter((p) => p.name) };
  }
  const types: string[] = Array.isArray(node?.addressTypes) ? node.addressTypes : [];
  const unitName = String((node?.sectionNames ?? [])[0] ?? 'Chapter');
  const count = sectionCount(node, counted);
  if (types[0] === 'Talmud') {
    // Sections are counted in amudim from 1a; the Gemara starts at 2a.
    return { title, he, kind: 'talmud', lastDaf: count ? Math.ceil(count / 2) : 0, unit: 'Daf' };
  }
  if (count && (node?.depth ?? 2) > 1) return { title, he, kind: 'chapters', count, unit: unitName };
  return { title, he, kind: 'open' };
}

// Find a part by its path of names ("Positive Commandments", or "Part I|Chapter 2"), in both the plain and counted index.
function findPart(node: any, names: string[]): any {
  let n = node;
  for (const name of names) {
    const kids: any[] = Array.isArray(n?.nodes) ? n.nodes : [];
    n = kids.find((k) => (name === DEFAULT_PART ? isDefault(k) : nodeName(k).name === name)) ?? null;
    if (!n) return null;
  }
  return n;
}

// The shape of a sefer (or one named part of it): how to pick a place in it.
export async function bookShape(title: string, part?: string): Promise<BookShape> {
  const [idx, counted] = await Promise.all([rawIndex(title), indexWithCounts(title).catch(() => null)]);
  const name = String(idx?.title ?? title);
  const he = String(idx?.heTitle ?? idx?.schema?.heTitle ?? '');
  if (!part) return shapeOf(name, he, idx?.schema, counted?.schema);
  const names = part.split('|');
  const node = findPart(idx?.schema, names);
  const cnode = findPart(counted?.schema, names);
  // A reference names each part, except the unnamed main text: "Mesillat Yesharim 3", "Sefer HaMitzvot, Positive Commandments 1".
  const refTitle = [name, ...names.filter((x) => x !== DEFAULT_PART)].join(', ');
  if (!node) return { title: refTitle, he, kind: 'open' };
  return shapeOf(refTitle, `${he}${nodeName(node).he ? `, ${nodeName(node).he}` : ''}`, node, cnode);
}
