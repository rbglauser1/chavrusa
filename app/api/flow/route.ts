import { NextRequest, NextResponse } from 'next/server';
import { parseAiJson } from '@/lib/aiLang';
import { costUsd } from '@/lib/config';
import { approvedList, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { keep } from '@/lib/keep';
import { clipWords } from '@/lib/clip';
import { needCredit } from '@/lib/credits';
import { keptModel, runKept } from '@/lib/keptModel';
import { heSentences } from '@/lib/interlinear';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Nov 23: the give and take, sentence by sentence (Color the give and take): every sentence of the amud (each line cut
// where its Hebrew has a period, as Sentence by sentence cuts it) marked with what it does (a statement, a question, an
// answer, a proof, a rejection…) and who says it, so in Sentence by sentence each label sits right on its own sentence.
// Made once per amud or perek and kept for good. (The sugya map marks only the line where each step begins.)
type TextKind = 'gemara' | 'mishnah' | 'tanakh';
const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
const kindOf = (ref: string): TextKind => (/^Mishnah /.test(ref) ? 'mishnah' : TANAKH.test(ref) ? 'tanakh' : 'gemara');
const KINDS: Record<TextKind, string[]> = {
  gemara: ['Statement', 'Teaching', 'Mishnah', 'Question', 'Answer', 'Proof', 'Rejection', 'Dispute', 'Opinion', 'Conclusion', 'Ruling', 'Story'],
  mishnah: ['Ruling', 'Case', 'Dispute', 'Opinion', 'Reason', 'Exception', 'Source', 'Story', 'Principle'],
  tanakh: ['Story', 'Speech', 'Mitzvah', 'Prophecy', 'Rebuke', 'Comfort', 'Song', 'Prayer', 'Vision', 'Genealogy', 'List', 'Parable'],
};
const WHO: Record<TextKind, string> = { gemara: '"Rav Yosef", "the Gemara", "a baraita", "Rabbi Chiyya"', mishnah: '"the first Tanna", "Rabbi Yehudah", "the Sages"', tanakh: '"Hashem", "Moses", "the verse"' };
const prompt = (k: TextKind) => `You mark the flow of a text sentence by sentence, for a learner who sees each sentence colored by what it does.
Below, every sentence of the text is numbered "line.sentence" (13.2 is the second sentence of line 13), with the line's English for help.
For EACH numbered sentence give: its "kind", exactly one of: ${KINDS[k].join(', ')}; and "who" says it (like ${WHO[k]}; empty if no one in particular).
${k === 'gemara' ? 'How to judge: a sentence that challenges or asks (והא תניא, מיתיבי, איני, מאי טעמא, ותסברא, and any kashya) is a Question; the reply that settles it (הכא במאי עסקינן, לא קשיא, תרגמה, אמר ליה) is an Answer; a source brought to support a view (תא שמע, דתניא, שנאמר brought as proof) is a Proof; a reply that pushes a proof or answer off (דילמא, לא, ממאי) is a Rejection; a quoted baraita or Tannaitic teaching is a Teaching; a plain statement of an Amora is a Statement; the outcome (הלכתא, והלכתא, אלא) is a Conclusion or Ruling. "The Gemara" is who for the anonymous voice.' : 'Judge each sentence by what it does in the flow of the text.'}
Judge each sentence by what it does in the argument, not by its words alone. Keep "who" short (a name, "the Gemara", "a baraita").
Reply with JSON only, one entry per numbered sentence, in order: {"s": [["13.1", "Teaching", "Rabbi Chiyya"], ["13.2", "Question", "the Gemara"]]}`;

export type FlowSent = { kind: string; who: string };
export type FlowData = { lines: Record<number, FlowSent[]> };

async function makeFlow(ref: string): Promise<FlowData> {
  await needCredit();
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed || !s.he.length) return { lines: {} };
  const k = kindOf(s.ref);
  const sents = s.he.map((he) => heSentences(he));
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const body = s.he.map((_, i) => `${sents[i].map((x, j) => `${i + 1}.${j + 1}: ${clip(stripNikud(x), 500)}`).join('\n')}${s.en[i] ? `\n   (English of line ${i + 1}: ${clip(s.en[i].replace(/<[^>]+>/g, ''), 700)})` : ''}`).join('\n');
  const model = await keptModel();
  const r = await runKept({
    lang: false, model: model.id, system: prompt(k), history: [{ role: 'user', content: `${s.ref}\n\n${body.slice(0, 26000)}` }],
    tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 6000,
  });
  await logCost({ sessionId: null, kind: 'flow', provider: model.id.startsWith('gpt') ? 'openai' : 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const lines: Record<number, FlowSent[]> = {};
  try {
    const d = parseAiJson(r.text, '{') as { s?: unknown };
    for (const row of Array.isArray(d.s) ? d.s : []) {
      if (!Array.isArray(row)) continue;
      const m = String(row[0] ?? '').match(/^(\d+)\.(\d+)$/);
      if (!m) continue;
      const li = Number(m[1]), si = Number(m[2]);
      if (!sents[li - 1] || si < 1 || si > sents[li - 1].length) continue;
      const kind = KINDS[k].includes(String(row[1])) ? String(row[1]) : KINDS[k][0];
      (lines[li] ??= Array.from({ length: sents[li - 1].length }, () => ({ kind: '', who: '' })))[si - 1] = { kind, who: clipWords(row[2], 40) };
    }
  } catch { /* below */ }
  // A sentence left out takes the one before it (or after it), so every sentence has its kind.
  for (const [li, arr] of Object.entries(lines)) arr.forEach((x, j) => { if (!x.kind) arr[j] = arr[j - 1]?.kind ? arr[j - 1] : arr.find((y) => y.kind) ?? { kind: KINDS[k][0], who: '' }; void li; });
  if (!Object.keys(lines).length) throw new Error('The flow did not come back in the right form.'); // not kept: tried again next time
  return { lines };
}

export async function GET(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref) return NextResponse.json({ lines: {} });
  try { return NextResponse.json(await keep('flow-sent-v1', ref, () => makeFlow(ref), (x) => !Object.keys(x.lines).length)); }
  catch (e) { return NextResponse.json({ lines: {}, error: (e as Error).message }); }
}
