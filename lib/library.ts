import 'server-only';
// A browser for Sefaria's library: categories -> seforim -> perakim / dapim / parts. No AI.
import { rawIndex, sefariaToc } from './sefaria';

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

function shapeOf(title: string, he: string, node: any): BookShape {
  const nodes: any[] = Array.isArray(node?.nodes) ? node.nodes : [];
  if (nodes.length) {
    return { title, he, kind: 'parts', parts: nodes.map(nodeName).filter((p) => p.name) };
  }
  const types: string[] = Array.isArray(node?.addressTypes) ? node.addressTypes : [];
  const lengths: number[] = Array.isArray(node?.lengths) ? node.lengths : [];
  const unitName = String((node?.sectionNames ?? [])[0] ?? 'Chapter');
  if (types[0] === 'Talmud') {
    // Sections are counted in amudim from 1a; the Gemara starts at 2a.
    const amudim = lengths[0] ?? 0;
    return { title, he, kind: 'talmud', lastDaf: amudim ? Math.ceil(amudim / 2) : 0, unit: 'Daf' };
  }
  if (lengths[0] && (node?.depth ?? 2) > 1) return { title, he, kind: 'chapters', count: lengths[0], unit: unitName };
  return { title, he, kind: 'open' };
}

// The shape of a sefer (or one named part of it): how to pick a place in it.
export async function bookShape(title: string, part?: string): Promise<BookShape> {
  const idx = await rawIndex(title);
  const name = String(idx?.title ?? title);
  const he = String(idx?.heTitle ?? idx?.schema?.heTitle ?? '');
  let node = idx?.schema;
  if (part) {
    node = (Array.isArray(node?.nodes) ? node.nodes : []).find((n: any) => nodeName(n).name === part) ?? null;
    if (!node) return { title: `${name}, ${part}`, he, kind: 'open' };
    const s = shapeOf(`${name}, ${part}`, `${he}${nodeName(node).he ? `, ${nodeName(node).he}` : ''}`, node);
    return s;
  }
  return shapeOf(name, he, node);
}
