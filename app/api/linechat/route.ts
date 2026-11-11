import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { LIBRARY_TOOLS, libraryExecutor, sourcesNamed } from '@/lib/libraryTools';
import { needCredit } from '@/lib/credits';

export const runtime = 'nodejs';
export const maxDuration = 180;

// "Chat" on a line (Settings → Extras → Chat on each line): a written chat with the AI about this one line, on any
// sefer. It sees the amud / perek with the line marked, the main meforesh on it, and the whole library (it may open
// sources). The learner's brain (Settings → Depth, AI and cost) answers. Not kept: each chat is his own. He can save
// any answer, or the whole chat, to his Notebook (components/LineChat.tsx).
const PROMPT = `You are a chavrusa, learning one line of a sefer together with the learner in a written chat. He asks questions or says what he thinks; you answer him.
You get the whole amud / perek with numbered lines; the line you are learning is marked >>> <<<, followed by the main meforesh on it when there is one. It may be Gemara, Mishnah, Tanach or any other sefer.
You also have the whole library: "links" shows what is linked to the line, "read" opens any source, "search" and "find" look further. Open a source when his question needs it (what Tosafos asks, how the Rambam rules); not for its own sake.
Answer what he asked, clearly and briefly: usually 2 to 6 sentences; longer only when he asks for more. If he asks you to explain, explain; if he proposes a reading, tell him honestly whether it fits the text and the meforshim, and why. If you are asked something you are not sure of, say so.
When you draw on a source, write its exact reference right after it inside ⟦ ⟧, exactly as you opened it: "Tosafos (⟦Tosafot on Yoma 6a:3:1⟧) asks…". Only sources you actually read.
Write in plain, clear English. For the learning terms a yeshiva learner knows, and words the text quotes, write the Hebrew or Aramaic in Hebrew letters (גזירה שוה, קל וחומר). Names in English as usual (Rashi, Tosafos, Rabbi Yochanan). Call God "Hashem". Stay within Chazal and the classic, Orthodox meforshim; never invent a source or an opinion. On halacha: say what the seforim rule; this is learning, not a ruling for practice: for that, he asks his rav.
No headings and no markdown; short paragraphs.`;

const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles) /;
const MAIN = (base: string) => (/^Mishnah /.test(base) ? 'Bartenura' : /\d+[ab]$/.test(base) || TANAKH.test(base) ? 'Rashi' : null);

type Msg = { role: 'user' | 'assistant'; content: string };

// POST { ref: "Yoma 6a:3", messages: [{ role, content }, …] } → { text, sources }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref ?? '');
  const m = ref.match(/^(.*?):(\d+)$/);
  const msgs: Msg[] = (Array.isArray(b.messages) ? b.messages : [])
    .filter((x: Msg) => (x?.role === 'user' || x?.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
    .slice(-20).map((x: Msg) => ({ role: x.role, content: x.content.slice(0, 4000) }));
  if (!m || / on /i.test(ref) || /^Mine /.test(ref) || !msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 });
  try {
    await needCredit();
    const [base, n] = [m[1], Number(m[2])];
    const approved = await approvedList();
    const s = await getText(base, approved);
    if (!s.verdict.allowed || !s.he.length || n > s.he.length) return NextResponse.json({ error: 'This text can’t be opened here.' }, { status: 400 });
    const clip = (t: string, k: number) => (t.length > k ? `${t.slice(0, k)}…` : t);
    const lines = s.he.map((he, i) => {
      const near = Math.abs(i + 1 - n) <= 6;
      const mk = i + 1 === n;
      return `[${i + 1}] ${mk ? '>>> ' : ''}${clip(stripNikud(he), near ? 900 : 160)}${mk ? ' <<<' : ''}${near && s.en[i] ? `\n    ${clip(s.en[i], 900)}` : ''}`;
    }).join('\n');
    const used = new Set<string>();
    let comm = '';
    const main = MAIN(base);
    if (main) try {
      const c = await getText(`${main} on ${base}:${n}`, approved);
      if (c.verdict.allowed && c.he.length) { comm = `\n\n${main} on line ${n} (${c.ref}):\n${clip(c.he.map(stripNikud).join(' '), 2500)}`; used.add(c.ref); }
    } catch { /* optional */ }
    const settings = await getSettings();
    const model = MODELS[settings.provider][settings.tier];
    const first: Msg = { role: 'user', content: `We are learning ${s.ref}, line ${n} (its reference: ${s.ref}:${n}).\n\n${lines.slice(0, 26000)}${comm}\n\n---\n${msgs[0].content}` };
    const history = [first, ...msgs.slice(1)];
    const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
    const r = await run({ model: model.id, system: PROMPT, history, tools: LIBRARY_TOOLS, execute: libraryExecutor(approved, used), effort: model.effort, thinking: 'disabled', maxSteps: 5 });
    await logCost({ sessionId: null, kind: 'linechat', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const text = r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '').trim();
    if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
    return NextResponse.json({ text: text.slice(0, 6000), sources: sourcesNamed(text, used) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
