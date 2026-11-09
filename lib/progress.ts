import 'server-only';
import { listMessages, listSessions, listSources } from './db';
import { bookShape } from './library';
import { nextSection } from './refs';
import { readJson, writeJson } from './store';

// Progress (Settings → Extras): which amudim / perakim he has learned, from his sessions. A section counts as learned
// when the learning reached its last lines, or went on past it into the next one. Worked out again only when a session
// has changed since, and kept.
export interface BookProgress { book: string; unit: 'amud' | 'perek'; learned: string[]; total: number | null; lastAt: string }
type Kept = { sig: string; books: BookProgress[] };

const sectionOf = (ref: string) => ref.replace(/:\d+(-\d+)?$/, '');
const bookOf = (base: string) => base.replace(/ \d+[ab]?$/, '');

export async function progress(): Promise<BookProgress[]> {
  const sessions = await listSessions();
  const sig = sessions.slice(0, 100).map((s) => `${s.id}:${s.updated_at}`).join('|');
  const kept = await readJson<Kept>('progress/summary.json');
  if (kept && kept.sig === sig) return kept.books;

  const learned = new Map<string, Set<string>>(); // book -> bases
  const lastAt = new Map<string, string>();
  for (const s of sessions.slice(0, 100)) {
    const [msgs, srcs] = await Promise.all([listMessages(s.id, 400), listSources(s.id)]);
    const lines = new Map<string, number>(); // base -> lines in it
    for (const x of srcs) if (x.data?.he?.length && !/ on /i.test(x.ref)) lines.set(sectionOf(x.ref), x.data.he.length);
    const reached = new Map<string, number>(); // base -> furthest line
    for (const m of msgs) {
      if (m.role !== 'assistant' || !m.meta) continue;
      const meta = m.meta as { pos?: { base?: string; n?: number }; line?: { ref?: string }; opened?: string };
      const at = meta.pos?.base ? { base: meta.pos.base, n: meta.pos.n ?? 1 }
        : meta.line?.ref ? { base: sectionOf(meta.line.ref), n: Number(meta.line.ref.match(/:(\d+)/)?.[1] ?? 1) } : null;
      if (!at || / on /i.test(at.base) || /^Mine /.test(at.base)) continue;
      reached.set(at.base, Math.max(reached.get(at.base) ?? 0, at.n));
    }
    for (const [base, n] of reached) {
      const len = lines.get(base);
      const next = nextSection(base);
      const done = (len && n >= len - 1) || (next && reached.has(next));
      const book = bookOf(base);
      if (!lastAt.has(book) || lastAt.get(book)! < s.updated_at) lastAt.set(book, s.updated_at);
      if (!done) continue;
      if (!learned.has(book)) learned.set(book, new Set());
      learned.get(book)!.add(base);
    }
  }
  const books: BookProgress[] = [];
  for (const [book, set] of learned) {
    const talmud = [...set].some((b) => /\d+[ab]$/.test(b));
    let total: number | null = null;
    try {
      const sh = await bookShape(book);
      total = sh.kind === 'talmud' && sh.lastDaf ? (sh.lastDaf - 1) * 2 : sh.kind === 'chapters' && sh.count ? sh.count : null;
    } catch { /* unknown size */ }
    books.push({ book, unit: talmud ? 'amud' : 'perek', learned: [...set], total, lastAt: lastAt.get(book) ?? '' });
  }
  books.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  await writeJson('progress/summary.json', { sig, books }).catch(() => {});
  return books;
}

/** The next section of a book not yet learned, in order (for "what's next" in a plan). */
export function nextUnlearned(book: BookProgress): string | null {
  const first = book.unit === 'amud' ? `${book.book} 2a` : `${book.book} 1`;
  const have = new Set(book.learned);
  let r: string | null = first;
  for (let k = 0; r && k < 400; k++) { if (!have.has(r)) return r; r = nextSection(r); }
  return null;
}
