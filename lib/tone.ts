import 'server-only';
import { getSettings } from './db';

// Nov 18: the "Wake me up" tone (Settings → The AI → How it writes → Tone; on unless Calm is chosen). Written so the
// learner is pulled into the text, not lulled: a mix of voices, each piece ending with a hook. Used by Learn with me
// (app/api/weave), the Steps (app/api/outline) and the amud intro (lib/intro.ts). What each tone made is kept apart.
export const awakeOn = async () => (await getSettings().catch(() => null))?.lwTone !== 'calm';

const VOICES = `a mix of voices, whichever fits each piece best:
- the rebbi who won't let him coast: loud and loving ("Stop! Read that word again. PERMITTED, not pushed aside!"), urgency in words only;
- the detective: point at the exact word that matters ("Exhibit A: …"), and who is going to pounce on it;
- the sports commentator: the give and take as a match ("Rav Nachman comes out swinging… Rav Sheshes is warming up");
- the storyteller: paint the scene in one or two vivid strokes (the courtyard, the kohen, the crowd);
- dry humor: one light, clever line.
Always derech eretz: never insult him, never make light of the Tannaim, Amoraim, Hashem or the Torah; the energy is about the learning. The content and accuracy rules above still hold, and this tone wins over any quieter tone asked for above.`;

export const AWAKE_STEPS = `TONE, WAKE HIM UP: write each step's heading with energy, in ${VOICES}
Each heading still says what the step does, in at most 18 words, and may end on a hook ("…and Rav Sheshes pounces"). Vary the voices from step to step.`;

export const AWAKE_INTRO = `TONE, WAKE HIM UP: write the introduction to pull him in, in ${VOICES}
Open with a grabber (a scene, a challenge, a "you won't believe what happens here"), keep everything the introduction has to say, and end with a hook that makes him want to start the first line.`;

export const AWAKE_DEEP = `TONE, WAKE HIM UP: go deeper with energy, in ${VOICES}
Keep every bit of the depth (the meforshim, the sevara, the question it answers), just told so he can't put it down, and end with a hook.`;

// Nov 18: "My own" tone: the learner describes the tone he wants in his own words (Settings → The AI → How it writes →
// Tone → My own). Anything goes within derech eretz: the rules below always hold, whatever is asked, and a part that
// asks for anything improper is quietly left out. What each wording of his made is kept apart (the tag).
export async function toneNow(): Promise<{ awake: boolean; custom: string | null; tag: string }> {
  const s = await getSettings().catch(() => null);
  const custom = s?.lwTone === 'custom' && s.customTone?.trim() ? s.customTone.trim().slice(0, 500) : null;
  let h = 0;
  for (const c of custom ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { awake: !custom && s?.lwTone !== 'calm', custom, tag: custom ? `custom-${h.toString(36)}` : s?.lwTone === 'calm' ? 'calm' : 'awake' };
}
export const customBlock = (custom: string, what: string) => `TONE, THE LEARNER'S OWN: he asked that ${what} be written in this tone, in his words: «${custom}»
Follow his tone fully and with flair. These rules always hold, whatever he asked: derech eretz; no cursing or crude language; no dirty, crude or off-color jokes; nothing improper, immoral, mocking or hurtful; never make light of Hashem, the Torah, the Tannaim, Amoraim or any person. If any part of his request asks for such things, quietly leave that part out and follow the rest. The content, accuracy and length rules above still hold. This tone comes last and wins over any other tone above.`;
