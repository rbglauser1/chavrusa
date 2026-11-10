import 'server-only';
import { db } from './db';

// Small JSON files in Supabase Storage (private bucket "app"): the saved texts, notes, sugya maps, chazara, progress.
// A file per thing, so nothing here needs a database table (or a setup step).
const BUCKET = 'app';
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (!ready) ready = (async () => {
    const { data } = await db().storage.getBucket(BUCKET);
    if (!data) await db().storage.createBucket(BUCKET, { public: false });
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
export const safeKey = (s: string) => s.replace(/[^A-Za-z0-9 ,.:_-]/g, '').replace(/[ ,:]+/g, '_').slice(0, 180);

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const { data, error } = await db().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as T;
  } catch { return null; }
}
/** When a file was last written (ms), or null if it isn't there. Looks only at the file's listing, without downloading it. */
export async function writtenAt(path: string): Promise<number | null> {
  try {
    const i = path.lastIndexOf('/');
    const { data, error } = await db().storage.from(BUCKET).list(i < 0 ? '' : path.slice(0, i), { search: path.slice(i + 1), limit: 5 });
    if (error || !data) return null;
    const f = data.find((x) => x.name === path.slice(i + 1));
    return f ? Date.parse(f.updated_at ?? f.created_at ?? '') || Date.now() : null;
  } catch { return null; }
}
export async function writeJson(path: string, v: unknown): Promise<void> {
  await ensure();
  const { error } = await db().storage.from(BUCKET).upload(path, Buffer.from(JSON.stringify(v)), { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
}
export async function removeJson(path: string): Promise<void> {
  await db().storage.from(BUCKET).remove([path]).catch(() => {});
}
