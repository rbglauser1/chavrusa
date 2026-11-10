import 'server-only';
import { keptModelOf } from './config';
import { getSettings } from './db';

/** The AI for things made once and kept (Settings → Depth, AI and cost → Made once and kept): Opus unless Sonnet is
 *  chosen. Things made by each are kept apart, so switching never mixes them, and switching back finds them again. */
export async function keptModel() {
  const s = await getSettings().catch(() => null);
  return keptModelOf(s ?? {});
}
