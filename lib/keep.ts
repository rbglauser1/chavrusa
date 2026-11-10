import 'server-only';
import { readJson, safeKey, writeJson } from './store';

// Everything the AI makes that is the same each time (a sugya map, an amud's intro and outline, the summaries of a
// meforesh, a translation of a line, review questions) is kept for good in Supabase Storage (bucket "app", folder
// "ai"), so it is paid for once, ever: the next time anyone opens it, it comes from here, free. (The server's own cache,
// a month at most and emptied now and then, sits in front of it for speed.)
// A conversation with the chavrusa is never kept this way: every answer there is new.
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const pathOf = (kind: string, key: string) => `ai/${safeKey(kind)}/${safeKey(key).slice(0, 120)}-${hash(key)}.json`;

/** The kept copy if there is one; else make it (paying once), keep it, and return it. A failed make is not kept,
 *  nor an empty one (`empty` says so): a text that couldn't be read just then is tried again next time. */
export async function keep<T>(kind: string, key: string, make: () => Promise<T>, empty?: (v: T) => boolean): Promise<T> {
  const path = pathOf(kind, key);
  const had = await readJson<{ v: T }>(path);
  if (had && had.v !== undefined) return had.v;
  const v = await make();
  if (empty?.(v)) return v;
  await writeJson(path, { v, at: new Date().toISOString() }).catch(() => {});
  return v;
}
