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
