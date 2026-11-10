import 'server-only';
import { createHash } from 'crypto';
import { getSettings } from './db';
import { readJson, writeJson, writtenAt } from './store';

// Saved texts (Settings → Extras, on by default): every text and list of links fetched from Sefaria is also kept in
// the app's own storage. Sefaria is still asked first (through Vercel's week-long shared cache, as before), so a
// saved copy never goes stale; the copy is used when Sefaria is slow or down. Each copy is rewritten at most once a
// month. Only what is actually opened is kept: about 150 KB an amud with its English, Rashi, Tosafos and links.
const MONTH = 30 * 24 * 3600 * 1000;
const keyOf = (url: string) => `texts/${createHash('sha1').update(url).digest('hex')}.json`;
const savedHere = new Map<string, number>(); // what this server instance saved lately (url → when)
let flag: { on: boolean; at: number } | null = null;

export async function cacheOn(): Promise<boolean> {
  if (flag && Date.now() - flag.at < 60_000) return flag.on;
  const on = await getSettings().then((s) => s.cacheTexts !== false).catch(() => true);
  flag = { on, at: Date.now() };
  return on;
}
/** Worth saving: the texts and the links (not searches, calendars or book outlines). */
export const savable = (url: string) => /\/api\/(v3\/texts|links)\//.test(url);

export async function saveCopy(url: string, data: unknown): Promise<void> {
  const last = savedHere.get(url);
  if (last && Date.now() - last < MONTH) return;
  if (!(await cacheOn())) return;
  savedHere.set(url, Date.now());
  // Is there a recent copy already? Ask for the file's date only: downloading the whole copy just to read its date
  // used up the storage plan's monthly transfer for nothing.
  const at = await writtenAt(keyOf(url));
  if (at && Date.now() - at < MONTH) return;
  await writeJson(keyOf(url), { at: Date.now(), url, data }).catch(() => { savedHere.delete(url); });
}

export async function savedCopy(url: string): Promise<unknown | null> {
  if (!(await cacheOn())) return null;
  const c = await readJson<{ data: unknown }>(keyOf(url));
  return c?.data ?? null;
}
