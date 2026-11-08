import 'server-only';
import { db } from './db';
import type { SourceData } from './db';

// "My Seforim": texts the learner brings in himself (a PDF, a Word file, a photo of a page, a web page, pasted
// text). Each one is kept as a JSON file in Supabase Storage (private bucket "mine"), with a small index. It opens
// and learns like any sefer: its ref is "Mine <id> <part>" (a long text is split into parts of PART_LINES lines),
// and getText (lib/sefaria.ts) hands it over in the same shape as a Sefaria text, so the Sefer, the voice and the
// chavrusa all work with it unchanged.

const BUCKET = 'mine';
export const PART_LINES = 30;
export interface MineLine { he: string; en: string }
export interface MineDoc { id: string; title: string; kind: string; source: string; created: string; lines: MineLine[] }
export interface MineEntry { id: string; title: string; kind: string; created: string; lines: number; parts: number }

const isMineRef = (ref: string) => /^Mine [a-z0-9]{6,} \d+(:\d+(-\d+)?)?$/i.test(ref.trim());
export { isMineRef };

async function ensureBucket() {
  const { data } = await db().storage.getBucket(BUCKET);
  if (!data) await db().storage.createBucket(BUCKET, { public: false });
}
async function readJson<T>(path: string): Promise<T | null> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as T; } catch { return null; }
}
async function writeJson(path: string, v: unknown) {
  const { error } = await db().storage.from(BUCKET).upload(path, Buffer.from(JSON.stringify(v)), { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
}

export async function listMine(): Promise<MineEntry[]> {
  return (await readJson<MineEntry[]>('index.json')) ?? [];
}
export async function getMine(id: string): Promise<MineDoc | null> {
  return readJson<MineDoc>(`docs/${id.replace(/[^a-z0-9]/gi, '')}.json`);
}

/** Hebrew or English: whichever the paragraph is mostly in. */
const mostlyHebrew = (s: string) => {
  const he = (s.match(/[\u05D0-\u05EA]/g) ?? []).length, la = (s.match(/[A-Za-z]/g) ?? []).length;
  return he > 0 && he >= la;
};

/** The text cut into lines: one per paragraph (a very long paragraph is cut at sentences). */
export function toLines(text: string): MineLine[] {
  const paras = text.replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*[-•*]\s)|\n(?=[\u05D0-\u05EA]{1,4}[.)]\s)/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const out: MineLine[] = [];
  for (const p of paras) {
    const pieces: string[] = [];
    if (p.length <= 700) pieces.push(p);
    else {
      let cur = '';
      for (const s of p.split(/(?<=[.:?!׃])\s+/)) { if ((cur + ' ' + s).length > 600 && cur) { pieces.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s; }
      if (cur) pieces.push(cur);
    }
    for (const x of pieces) out.push(mostlyHebrew(x) ? { he: x, en: '' } : { he: '', en: x });
  }
  return out;
}

export async function saveMine(d: { title: string; kind: string; source: string; text: string }): Promise<MineEntry> {
  await ensureBucket();
  const lines = toLines(d.text);
  if (!lines.length) throw new Error('No text was found in it.');
  const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toLowerCase();
  const doc: MineDoc = { id, title: d.title.trim().slice(0, 120) || 'My text', kind: d.kind, source: d.source.slice(0, 500), created: new Date().toISOString(), lines };
  await writeJson(`docs/${id}.json`, doc);
  const entry: MineEntry = { id, title: doc.title, kind: doc.kind, created: doc.created, lines: lines.length, parts: Math.ceil(lines.length / PART_LINES) };
  await writeJson('index.json', [entry, ...(await listMine()).filter((e) => e.id !== id)]);
  return entry;
}

export async function removeMine(id: string): Promise<void> {
  const clean = id.replace(/[^a-z0-9]/gi, '');
  await db().storage.from(BUCKET).remove([`docs/${clean}.json`]);
  await writeJson('index.json', (await listMine()).filter((e) => e.id !== clean));
}

/** A part of one of his texts, in the shape of a Sefaria text. "Mine <id> <part>" (a ":n" line is the same part). */
export async function getMineText(ref: string): Promise<SourceData> {
  const m = ref.trim().match(/^Mine ([a-z0-9]+) (\d+)/i);
  const doc = m ? await getMine(m[1]) : null;
  const part = m ? Math.max(1, Number(m[2])) : 1;
  const parts = doc ? Math.ceil(doc.lines.length / PART_LINES) : 0;
  const lines = doc && part <= parts ? doc.lines.slice((part - 1) * PART_LINES, part * PART_LINES) : [];
  const base = m ? `Mine ${m[1]} ${part}` : ref;
  return {
    ref: base,
    heRef: doc ? (parts > 1 ? `${doc.title} · ${part}/${parts}` : doc.title) : base,
    he: lines.map((l) => l.he),
    en: lines.map((l) => l.en),
    translation: lines.some((l) => l.en) ? 'Your own text' : null,
    url: '',
  };
}
