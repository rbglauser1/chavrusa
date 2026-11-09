import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The sugya map (Settings → Extras): the text laid out as steps, each with its kind, who says it, one line on what it
// says, and the line it begins on. Made once per amud / perek by the AI, then kept a month. Each kind of text gets its
// own kinds of steps: a Gemara's give and take, a Mishnah's rulings and machloksim, a perek of Tanach's story,
// speeches, mitzvos and nevuos.
type TextKind = 'gemara' | 'mishnah' | 'tanakh';
const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
const kindOf = (ref: string): TextKind => (/^Mishnah /.test(ref) ? 'mishnah' : TANAKH.test(ref) ? 'tanakh' : 'gemara');

const KINDS: Record<TextKind, string[]> = {
  gemara: ['Mishnah', 'Braisa', 'Statement', 'Question', 'Answer', 'Proof', 'Rejection', 'Opinion', 'Machlokes', 'Story', 'Conclusion', 'Halacha'],
  mishnah: ['Halacha', 'Case', 'Machlokes', 'Opinion', 'Reason', 'Exception', 'Derasha', 'Story', 'Principle'],
  tanakh: ['Story', 'Speech', 'Mitzvah', 'Nevuah', 'Tochacha', 'Nechama', 'Shira', 'Tefillah', 'Vision', 'Yichus', 'List', 'Mashal'],
};
const WHAT: Record<TextKind, string> = {
  gemara: 'a section of Gemara (or another sefer) as the steps of its argument, so he can see the whole sugya at a glance',
  mishnah: 'a perek of Mishnah as its parts: each ruling, case, machlokes and reason, so he can see the whole perek at a glance',
  tanakh: 'a perek of Tanach as its parts: each part of the story, each speech, mitzvah or nevuah, so he can see the whole perek at a glance',
};
const WHO: Record<TextKind, string> = {
  gemara: '"Rav Pappa", "Rabbi Akiva", "the Gemara", "a braisa"',
  mishnah: '"Tanna Kamma", "Rabbi Yehudah", "Beis Shammai", "Chachamim"',
  tanakh: '"Hashem", "Moshe", "Yeshayahu", "Dovid", "the pasuk"',
};
const HOW: Record<TextKind, string> = {
  gemara: 'Keep the steps at the level of the argument (usually 5 to 15 for an amud); every Question should be followed by its Answer or Rejection when the text gives one.',
  mishnah: 'Usually 4 to 12 steps for a perek; begin a new step at each new mishnah, and give each side of a machlokes its own Opinion step after the Machlokes.',
  tanakh: 'Usually 3 to 10 steps for a perek; begin a new step where the subject, the speaker or the parsha (open or closed section) changes. Explain al pi Chazal and Rashi.',
};
const promptFor = (k: TextKind) => `You map ${WHAT[k]} and where each part begins.
For each step give: "line" (the numbered line where it begins), "kind" (exactly one of: ${KINDS[k].join(', ')}), "who" (the speaker or source, like ${WHO[k]}; empty if none), and "summary" (one plain English line, at most 14 words, saying what this step says).
${HOW[k]} Use yeshivish English (Shabbos, Toirah, kashya, teirutz, braisa, Hashem).
Reply with JSON only: [{"line": 1, "kind": "${KINDS[k][0]}", "who": "", "summary": "..."}, ...] in order.`;

export type Step = { line: number; kind: string; who: string; summary: string };

async function makeMap(ref: string): Promise<{ steps: Step[] }> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { steps: [] };
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
  let steps: Step[] = [];
  try {
    steps = (JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as Step[])
      .filter((x) => x && Number.isFinite(Number(x.line)) && typeof x.summary === 'string')
      .map((x) => ({
        line: Math.min(Math.max(1, Math.round(Number(x.line))), s.he.length),
        kind: KINDS[k].includes(String(x.kind)) ? String(x.kind) : KINDS[k][0],
        who: String(x.who ?? '').slice(0, 40),
        summary: x.summary.trim().slice(0, 160),
      }));
  } catch { steps = []; }
  if (!steps.length) throw new Error('The map did not come back in the right form.'); // not kept: tried again next time
  return { steps };
}

const cached = (ref: string) => unstable_cache(() => makeMap(ref), [kindOf(ref) === 'gemara' ? 'sugya-map-v1' : 'sugya-map-v2', ref], { revalidate: 60 * 60 * 24 * 30 })();

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref)) return NextResponse.json({ steps: [] });
  try { return NextResponse.json(await cached(ref)); }
  catch (e) { return NextResponse.json({ steps: [], error: (e as Error).message }); }
}
