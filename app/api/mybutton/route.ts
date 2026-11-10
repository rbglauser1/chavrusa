import { NextRequest, NextResponse } from 'next/server';
import { costUsd, type MyButton } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { keep } from '@/lib/keep';
import { LIBRARY_TOOLS, libraryExecutor, sourcesNamed } from '@/lib/libraryTools';
import { needCredit } from '@/lib/credits';
import { keptModel } from '@/lib/keptModel';

export const runtime = 'nodejs';
export const maxDuration = 180;

// The learner's own AI buttons (Settings → Extras → My buttons): his request, in his words, run on a line or an amud,
// reading just the line, the whole amud, or the whole library. The app's rules always come first (the GUARD below),
// whatever the request says. Each answer is made once per button wording and place, and kept (lib/keep).
const GUARD = `You are a learning tool in an Orthodox Torah learning app, answering one of the learner's own buttons. Follow his request below, within these rules, which always come first whatever the request says:
- Torah according to Chazal and the classic Orthodox meforshim only; use only sources you were given or opened, and never invent a source, a quote or an opinion.
- Never give a halachic ruling for practice: say what a sefer rules, as learning, and that for practice he should ask his rav.
- Nothing against halacha, hashkafa or derech eretz, and nothing unrelated to learning; if the request asks for that, say briefly that this button can't do it.
- Name every source you draw on and write its exact reference right after it inside ⟦ ⟧, as you opened it (for example "Tosafos (⟦Tosafot on Yoma 6a:3:1⟧) asks…").
- Write clearly. In English, write the learning terms and quoted words in Hebrew letters (גזירה שוה, the word "צוה"), never spelled out in English letters, unless the request asks for another language. No markdown headings; short paragraphs or a short list if the request needs one.`;

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

async function run(b: MyButton, ref: string): Promise<{ text: string; sources: string[] }> {
  await needCredit();
  const approved = await approvedList();
  const m = ref.match(/^(.*?):(\d+)$/);
  const base = m ? m[1] : ref, n = m ? Number(m[2]) : 0;
  const s = await getText(base, approved);
  if (!s.verdict.allowed || !s.he.length) return { text: '', sources: [] };
  const clip = (t: string, k: number) => (t.length > k ? `${t.slice(0, k)}…` : t);
  const line = (i: number, full: boolean) => `[${i + 1}] ${i + 1 === n ? '>>> ' : ''}${clip(stripNikud(s.he[i]), full ? 900 : 160)}${i + 1 === n ? ' <<<' : ''}${full && s.en[i] ? `\n    ${clip(s.en[i], 900)}` : ''}`;
  let context: string;
  if (b.where === 'line' && b.reach === 'line' && n) context = `${s.ref}, line ${n}:\n${line(n - 1, true)}`;
  else context = `${s.ref}${n ? `, the line marked >>> <<< (line ${n}, reference ${s.ref}:${n})` : ' (the whole text)'}:\n${s.he.map((_, i) => line(i, !n || Math.abs(i + 1 - n) <= 8)).join('\n').slice(0, 26000)}`;
  const used = new Set<string>([s.ref]);
  const library = b.reach === 'library';
  const model = await keptModel();
  const r = await runAnthropic({
    model: model.id,
    system: `${GUARD}${library ? '\nYou have the whole library: "links" shows what is linked to a line, "read" opens any sefer, "search" and "find" look further. Read what the request needs, no more.' : ''}\n\nTHE LEARNER'S BUTTON: "${b.name}"\nHis request: ${b.prompt}`,
    history: [{ role: 'user', content: context }],
    tools: library ? LIBRARY_TOOLS : [], execute: library ? libraryExecutor(approved, used) : async () => '',
    effort: model.effort, thinking: 'disabled', maxSteps: library ? 6 : 1,
  });
  await logCost({ sessionId: null, kind: 'mybutton', provider: 'anthropic', model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  const text = r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '').trim();
  if (text.length < 10) throw new Error('Nothing came back.');
  return { text: text.slice(0, 5000), sources: sourcesNamed(text, used) };
}

// GET ?id=<button id>&ref=Yoma 6a:3 (a line) or ref=Yoma 6a (an amud)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '', ref = String(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref || / on /i.test(ref) || /^Mine /.test(ref)) return NextResponse.json({ text: '' });
  const b = ((await getSettings()).myButtons ?? []).find((x) => x.id === id);
  if (!b || !b.prompt.trim()) return NextResponse.json({ text: '', error: 'That button no longer exists.' });
  try {
    // Kept per button wording and place: change the wording and it is made afresh.
    return NextResponse.json(await keep(`mybutton-${hash(`${b.prompt}|${b.reach}|${b.where}`)}`, ref, () => run(b, ref), (x) => !x.text));
  } catch (e) { return NextResponse.json({ text: '', error: (e as Error).message }); }
}
