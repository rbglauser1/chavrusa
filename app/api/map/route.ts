import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { keep } from '@/lib/keep';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The sugya map (Settings → Extras): the amud or perek at a glance, all in plain English. On top, the big picture of the
// whole text; then its topics, each with an intro (what is being discussed and why), the background a learner needs
// where there is any, its steps (each with its kind, who says it, one line on what it says, and the line it begins on),
// and where it ends up. Made once per amud / perek by the AI, then kept a month. Each kind of text gets its own kinds
// of steps: a Gemara's give and take, a Mishnah's rulings and disputes, a perek of Tanach's story, speeches, mitzvos
// and prophecies.
type TextKind = 'gemara' | 'mishnah' | 'tanakh';
const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
const kindOf = (ref: string): TextKind => (/^Mishnah /.test(ref) ? 'mishnah' : TANAKH.test(ref) ? 'tanakh' : 'gemara');

const KINDS: Record<TextKind, string[]> = {
  gemara: ['Mishnah', 'Teaching', 'Statement', 'Question', 'Answer', 'Proof', 'Rejection', 'Opinion', 'Dispute', 'Story', 'Conclusion', 'Ruling'],
  mishnah: ['Ruling', 'Case', 'Dispute', 'Opinion', 'Reason', 'Exception', 'Source', 'Story', 'Principle'],
  tanakh: ['Story', 'Speech', 'Mitzvah', 'Prophecy', 'Rebuke', 'Comfort', 'Song', 'Prayer', 'Vision', 'Genealogy', 'List', 'Parable'],
};
const UNIT: Record<TextKind, string> = { gemara: 'amud of Gemara (or section of a sefer)', mishnah: 'perek of Mishnah', tanakh: 'perek of Tanach' };
const WHO: Record<TextKind, string> = {
  gemara: '"Rav Pappa", "Rabbi Akiva", "the Gemara", "a baraita"',
  mishnah: '"the first Tanna", "Rabbi Yehudah", "Beit Shammai", "the Sages"',
  tanakh: '"Hashem", "Moses", "Isaiah", "David", "the verse"',
};
const STEPS: Record<TextKind, string> = {
  gemara: 'Steps follow the argument (usually 5 to 15 in an amud); every Question is followed by its Answer or Rejection when the text gives one. "Teaching" is a baraita or other Tannaitic teaching quoted.',
  mishnah: 'Begin a new step at each new mishnah or ruling; a Dispute step is followed by an Opinion step for each side. "Source" is a verse the ruling is learned from.',
  tanakh: 'Begin a new step where the subject, the speaker or the parsha (open or closed section) changes. Explain according to Chazal and Rashi.',
};
const promptFor = (k: TextKind) => `You make a study map of a ${UNIT[k]} for a learner, so he sees the whole of it at a glance before and while he learns it.
Write everything in plain, clear English: no Hebrew or Aramaic words spelled out in English letters, except names of people and books, which you write the usual English way (Rashi, Rav Pappa, Rabbi Akiva, Moses, Isaiah). Call God "Hashem". Explain Orthodox-ly, according to Chazal and the classic meforshim.
Give:
- "overview": 2 to 3 sentences: the big picture of this whole text: what it is about and how it moves.
- "topics": the text's topics in order (usually 1 to 4). For each topic:
  - "title": a short English name for the topic (at most 7 words).
  - "line": the numbered line where it begins.
  - "intro": 2 to 3 sentences giving the big picture of this topic: what question or subject it deals with, why it comes up here, and (if it began before this text) where it began.
  - "background": the things a learner must know to follow this topic, if any (0 to 3), each one short line, "term: what it is" (like "Smicha: the owner leaning his hands on his korban before it is offered"). Leave empty when nothing is needed.
  - "steps": the topic's steps in order. Each step: "line" (the numbered line where it begins), "kind" (exactly one of: ${KINDS[k].join(', ')}), "who" (the speaker or source, like ${WHO[k]}; empty if none), "summary" (one plain English sentence, at most 18 words, telling what happens in this step, as a statement: never a question put to the learner, and not a test of what he knows. Write "The Gemara asks why both could not be dressed at once", not "Why couldn't both be dressed at once?").
  The steps are the text's own flow, the way a chavrusa would trace it: who says what, what is asked, how it is answered, what is proven or pushed off.
  - "takeaway": one sentence: where the topic ends up (its conclusion, or that it is left open or continues on the next ${k === 'gemara' ? 'amud' : 'perek'}).
${STEPS[k]}
Reply with JSON only: {"overview": "...", "topics": [{"title": "...", "line": 1, "intro": "...", "background": ["..."], "steps": [{"line": 1, "kind": "${KINDS[k][0]}", "who": "", "summary": "..."}], "takeaway": "..."}]}`;

export type Step = { line: number; kind: string; who: string; summary: string };
export type Topic = { title: string; line: number; intro: string; background: string[]; steps: Step[]; takeaway: string };
export type SugyaMapData = { overview: string; topics: Topic[]; steps: Step[] };

async function makeMap(ref: string): Promise<SugyaMapData> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { overview: '', topics: [], steps: [] };
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = s.he.map((he, i) => `[${i + 1}] ${clip(stripNikud(he), 700)}${s.en[i] ? `\n    ${clip(s.en[i], 700)}` : ''}`).join('\n');
  const k = kindOf(s.ref);
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({
    model: model.id, system: promptFor(k), history: [{ role: 'user', content: `${s.ref}\n\n${lines.slice(0, 24000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1,
  });
  await logCost({ sessionId: null, kind: 'map', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const n = s.he.length;
  const lineOf = (x: unknown) => Math.min(Math.max(1, Math.round(Number(x) || 1)), n);
  const str = (x: unknown, max: number) => String(x ?? '').trim().slice(0, max);
  let overview = '';
  let topics: Topic[] = [];
  try {
    const d = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { overview?: unknown; topics?: unknown };
    overview = str(d.overview, 700);
    topics = (Array.isArray(d.topics) ? d.topics : []).filter((t) => t && typeof t === 'object').map((t: Record<string, unknown>) => {
      const steps: Step[] = (Array.isArray(t.steps) ? t.steps : [])
        .filter((x: Record<string, unknown>) => x && Number.isFinite(Number(x.line)) && typeof x.summary === 'string')
        .map((x: Record<string, unknown>) => ({
          line: lineOf(x.line),
          kind: KINDS[k].includes(String(x.kind)) ? String(x.kind) : KINDS[k][0],
          who: str(x.who, 40),
          summary: str(x.summary, 180),
        }));
      return {
        title: str(t.title, 80), line: lineOf(t.line ?? steps[0]?.line), intro: str(t.intro, 700),
        background: (Array.isArray(t.background) ? t.background : []).map((b) => str(b, 220)).filter(Boolean).slice(0, 4),
        steps, takeaway: str(t.takeaway, 300),
      };
    }).filter((t) => t.steps.length || t.intro);
  } catch { topics = []; }
  const steps = topics.flatMap((t) => t.steps);
  if (!steps.length) throw new Error('The map did not come back in the right form.'); // not kept: tried again next time
  return { overview, topics, steps };
}

// Kept for good (lib/keep): each amud's map is paid for once, ever; the server's month cache sits in front for speed.
const cached = (ref: string) => unstable_cache(() => keep('sugya-map-v4', ref, () => makeMap(ref)), ['sugya-map-v4', ref], { revalidate: 60 * 60 * 24 * 30 })();

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref)) return NextResponse.json({ overview: '', topics: [], steps: [] });
  try { return NextResponse.json(await cached(ref)); }
  catch (e) { return NextResponse.json({ overview: '', topics: [], steps: [], error: (e as Error).message }); }
}
