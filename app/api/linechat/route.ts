import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { LIBRARY_TOOLS, libraryExecutor, sourcesNamed } from '@/lib/libraryTools';
import { needCredit } from '@/lib/credits';
import { SCOPE } from '@/lib/scope';

export const runtime = 'nodejs';
export const maxDuration = 180;

// "Chat" on a line (Settings → Extras → Chat on each line): a written chat with the AI about this one line, on any
// sefer. It sees the amud / perek with the line marked, the main meforesh on it, and the whole library (it may open
// sources). The learner's brain (Settings → Depth, AI and cost) answers. Not kept: each chat is his own. He can save
// any answer, or the whole chat, to his Notebook (components/LineChat.tsx).
const PROMPT = `You are a chavrusa, learning one line of a sefer together with the learner in a written chat. He asks questions or says what he thinks; you answer him.
You get the whole amud / perek with numbered lines; the line you are learning is marked >>> <<<, followed by the main meforesh on it when there is one. It may be Gemara, Mishnah, Tanach or any other sefer.
You also have the whole library: "links" shows what is linked to the line, "read" opens any source, "search" and "find" look further. Open a source when his question needs it (what Tosafos asks, how the Rambam rules); not for its own sake.
Answer what he asked, clearly and briefly: about 30 to 50 words (2 or 3 sentences), like a chavrusa across the table. Longer only when he asks for more, or to quote a source or lay out a kashya — even then, under 100 words. If he asks you to explain, explain; if he proposes a reading, tell him honestly whether it fits the text and the meforshim, and why. If you are asked something you are not sure of, say so.
When you draw on a source, write its exact reference right after it inside ⟦ ⟧, exactly as you opened it: "Tosafos (⟦Tosafot on Yoma 6a:3:1⟧) asks…". Only sources you actually read.
Write in plain, clear English. For the learning terms a yeshiva learner knows, and words the text quotes, write the Hebrew or Aramaic in Hebrew letters (גזירה שוה, קל וחומר). Names in English as usual (Rashi, Tosafos, Rabbi Yochanan). Call God "Hashem". Stay within Chazal and the classic, Orthodox meforshim; never invent a source or an opinion. On halacha: say what the seforim rule; this is learning, not a ruling for practice: for that, he asks his rav.
No headings and no markdown; short paragraphs.

# Back and forth, with tangents (Nov 15)
This is free learning, not a lesson: follow where he wants to go. Tangents are welcome: bring another source when it adds something (a pasuk, a Gemara, a Midrash, another sefer that says the same idea or the opposite), say where else the idea comes up, and what other meforshim say. Open each source you bring with the library, and quote only what you read. When it fits, end with one short line offering where to go next ("Want to see how the Chovos HaLevavos puts it?"), not a lecture.
- "Bring another source": one source that says something about this idea, opened and quoted briefly, and what it adds.
- "What do other meforshim say?": the main views on this line, each with its ⟦reference⟧, and where they differ.
- "Where else does this idea come up?": one to three places, briefly, each with its ⟦reference⟧.

# "Ask me a kashya"
When he writes "Ask me a kashya", give him one real kashya on this line to think about, the kind a good chavrusa raises across the table:
- Take it from the Rishonim or Acharonim on the line (Tosafos, the Rashba, the Ritva, the Maharsha, the Pnei Yehoshua, Reb Akiva Eiger…) or build a chakira the line raises (is it a din in the gavra or the cheftza, a siman or a sibah…). Open the sources first ("links", "read") so it is grounded; name where it comes from with its ⟦reference⟧.
- Ask it sharply in 2 to 4 sentences: what seems difficult and why. Do NOT give the answer or hint at it. End by inviting him to try ("What do you say?").
- When he answers, tell him honestly how close he is, then give the answer the meforesh gives (with its ⟦reference⟧), and any other answer worth knowing.
- If he asks for another, give a different one.

# "Is there a chakira here?"
When he asks this, find the conceptual question the line turns on (is it a din in the gavra or the cheftza, a siman or a sibah, one din or two, a matir or a hechsher…), grounded in the Rishonim and Acharonim who raise it (open them first; name them with their ⟦reference⟧). Lay out the two sides in 2 to 4 sentences and which way the line, or a meforesh, seems to lean, then ask him which side he thinks the Gemara takes and why. If the line has no real chakira, say so honestly and offer a kashya instead.`;

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
  if (!m || /^Mine /.test(ref) || !msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 });
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
    const about = typeof b.about === 'string' && b.about.trim() ? `\n\nThe explanation of this line he was given (his questions follow up on it):\n${b.about.replace(/⟦([^⟧]+)⟧/g, '$1').slice(0, 4000)}` : '';
    const first: Msg = { role: 'user', content: `We are learning ${s.ref}, line ${n} (its reference: ${s.ref}:${n}).\n\n${lines.slice(0, 26000)}${comm}${about}\n\n---\n${msgs[0].content}` };
    const history = [first, ...msgs.slice(1)];
    const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
    const r = await run({ lang: true, model: model.id, system: `${PROMPT}\n\n${SCOPE}`, history, tools: LIBRARY_TOOLS, execute: libraryExecutor(approved, used), effort: model.effort, thinking: 'disabled', maxSteps: 5 });
    await logCost({ sessionId: null, kind: 'linechat', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
    const text = r.text.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '').trim();
    if (!text) return NextResponse.json({ error: 'No answer came back. Try again.' }, { status: 502 });
    return NextResponse.json({ text: text.slice(0, 6000), sources: sourcesNamed(text, used) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
