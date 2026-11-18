import 'server-only';
import { keptModelOf } from './config';
import { getSettings } from './db';
import { runAnthropic } from './llm/anthropic';
import { runOpenAI } from './llm/openai';

/** The AI for things made once and kept (Settings → Depth, AI and cost → Made once and kept): Opus unless Sonnet is
 *  chosen. Things made by each are kept apart, so switching never mixes them, and switching back finds them again. */
export async function keptModel() {
  const s = await getSettings().catch(() => null);
  return keptModelOf(s ?? {});
}

/** Run the kept-things AI on whichever company's model is chosen (Nov 18: Claude or OpenAI). */
export function runKept(o: Parameters<typeof runAnthropic>[0]) {
  return o.model.startsWith('gpt') ? runOpenAI(o) : runAnthropic(o);
}
