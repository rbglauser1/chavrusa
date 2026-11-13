import { NextRequest } from 'next/server';
import { outOfCredit } from '@/lib/credits';
import { costUsd, isQuickReply, MODELS, styleById, wantsDepth, forNusach } from '@/lib/config';
import {
  addMessage, approvedList, createSession, getSession, getSettings, listMemories, listMessages, listSources,
  logCost, saveSettings, sessionCost, touchSession,
} from '@/lib/db';
import { buildSystemPrompt } from '@/lib/instructions';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { makeExecutor, mentionsCommentary, textForModel, ToolEvent, TOOLS } from '@/lib/tools';
import { introSoon } from '@/lib/intro';
import { openingPlace, prefetchSource, prepareCommentaries, prepareLamdan, warmTexts } from '@/lib/prefetch';
import { findCommentary, routeWithoutAI } from '@/lib/router';
import { currentPlace, forPanel, markFilter, readMark, section, splitRef, textInHand } from '@/lib/place';
import { fixSay, nextPiece, type Expect, type Section } from '@/lib/sayFix';
import { forReader, namesForSpeechEn, stripNikud, voiceHe } from '@/lib/hebrew';
import { nextSection } from '@/lib/refs';
import { after } from 'next/server';
import { addSource, SourceData } from '@/lib/db';
import { voicePhrases } from '@/lib/interlinear';
import { englishFor, getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;

// Move the thinking level up or down, within what each model accepts.
function shiftEffort(effort: string | undefined, delta: number, provider: string, tier: string): string | undefined {
  if (!effort || !delta) return effort;
  const ladder = provider === 'openai'
    ? (tier === 'top' ? ['low', 'medium', 'high'] : ['none', 'low', 'medium', 'high'])
    : ['low', 'medium', 'high'];
  const i = ladder.indexOf(effort);
  if (i < 0) return effort;
  return ladder[Math.max(0, Math.min(ladder.length - 1, i + delta))];
}
// "Continue" = the next piece with the AI and the full formula. ("Next" moves on for free, reading only.)
const CONTINUE = /^\s*(ok(ay)?,? |so,? |please |let'?s |lets )?continue( learning| on| please| the gemara)?[.!]?\s*$/i;
export const maxDuration = 300; // deep models with several source lookups can take a while

// Streams newline-delimited JSON events: status, source, memory, mode, session, reply, cost, error.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: string = String(body.message ?? '').trim();
  let sessionId: string | null = body.sessionId ?? null;
  const spoken = body.voice === true;
  { const out = await outOfCredit(); if (out) return new Response(JSON.stringify({ type: 'error', text: out }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } }); } // credits (lib/credits.ts)
  // The next piece was ready in advance and the page already handed it to the voice (lib/nextRead.ts): this turn only
  // records it and writes what comes after the reading.
  const handed: { early: string; at: Expect } | null = spoken && typeof body.handed?.early === 'string' && typeof body.handed?.at?.base === 'string' && Number(body.handed?.at?.n) > 0
    ? { early: String(body.handed.early), at: { base: String(body.handed.at.base), n: Number(body.handed.at.n), ...(body.handed.at.part ? { part: Number(body.handed.at.part) } : {}) } } : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        if (!message) throw new Error('Empty message.');
        let settings = forNusach(await getSettings()); // Sephardi: Hebrew letters to the voice, no yeshivish respellings
        // Gemini gets the lashon kodesh spelled out in English letters by the app (useGeminiLive), which needs the
        // vowels to spell from. "Without vowels" is for GPT-Live; with Gemini the Hebrew keeps its nikud (log of Nov 7,
        // 11:24 PM: the bare letters came out as nothing, and Gemini read the line from memory, like an Israeli).
        if (spoken && settings.liveEngine === 'gemini') settings = { ...settings, heRead: 'he' };

        // Session
        if (!sessionId || !(await getSession(sessionId))) {
          const s = await createSession(message.slice(0, 60));
          sessionId = s.id;
          send({ type: 'session', session: s });
        }
        const sid = sessionId as string;

        const approvedP = approvedList();
        // Open a named source (or today's daf) right away, in parallel with loading the session.
        const prefetchP = approvedP.then((a) => prefetchSource(message, a)).catch(() => null);
        const [memories, history, sources, approved] = await Promise.all([
          listMemories(), listMessages(sid, 24), listSources(sid), approvedP,
        ]);
        const pre = await prefetchP;
        // Prepare the sugya: list the main commentaries now, and load their texts in the background.
        // Never make the learner wait for this: use it only if it's ready almost immediately.
        // Commentaries cost money to read, so the AI may use them only when the learner asks about one
        // (in this message, the one before, or by saying "yes" to the Chavrusa's offer to look at one).
        const prevUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
        const prevBot = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
        // Generous on purpose: a commentary mentioned by the learner in the last few turns, or by the Chavrusa (or the
        // voice) in its last reply, or one already open in this session, counts as asked.
        const recentLearner = history.filter((m) => m.role === 'user').slice(-3).map((m) => m.content);
        const commentaryOpen = sources.slice(-3).some((x) => / on /i.test(x.ref));
        const askedCommentary = mentionsCommentary(message) || recentLearner.some(mentionsCommentary) || mentionsCommentary(prevBot) || commentaryOpen;
        void prevUser;
        const prepared = pre && (askedCommentary || settings.style === 'iyun') ? await Promise.race([
          prepareCommentaries(pre.ref, approved).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 400)),
        ]) : null;
        if (pre && !prepared) {
          try { after(async () => { const p = await prepareCommentaries(pre.ref, approved).catch(() => null); if (p) await warmTexts(p.refs, approved); }); } catch { /* optional */ }
        }
        if (prepared) {
          try { after(() => warmTexts(prepared.refs, approved)); }
          catch { void warmTexts(prepared.refs, approved); } // background warm-up is optional
        }
        if (pre && !sources.some((x) => x.ref === pre.ref)) {
          // A single mishnah / pasuk / line: show its whole perek or amud in the Sefer, at that spot.
          const shown = await forPanel(pre, approved).catch(() => pre);
          send({ type: 'source', source: shown });
          await addSource(sid, shown);
          sources.push({ id: 'pre', ref: shown.ref, he_ref: shown.heRef, data: shown, created_at: new Date().toISOString() });
        }
        await addMessage(sid, 'user', message);

        // Notes on the line, by voice or typing (Settings → Extras): "make a note: …", "note that …", "make a note of
        // that" (the chavrusa's last explanation). Saved on the line we're on; free, no AI.
        const noteAsk = settings.notes ? message.trim().match(/^(?:please\s+)?(?:(?:make|take|save|add|write)\s+(?:a\s+)?note|note)\b\s*(?:(?:of|on)\s+(?:that|this)\b)?\s*[:,-]?\s*(?:that\s+)?([\s\S]*)$/i) : null;
        if (noteAsk) {
          const here = currentPlace(history, sources);
          const lastExpl = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
          const said = noteAsk[1].trim() || lastExpl.replace(/\[\[say\]\][\s\S]*?\[\[\/say\]\]/gi, ' ').replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
          let reply = '';
          if (!here) reply = 'Open a text first, and I’ll keep the note on the line we’re on.';
          else if (!said) reply = 'What should the note say?';
          else {
            const { addNote } = await import('@/lib/notes');
            await addNote(here.base, Math.max(1, here.n), said);
            reply = `Noted on ${here.base}, line ${Math.max(1, here.n)}.`;
            send({ type: 'notes', ref: here.base });
          }
          const usage = { ai: false, reason: 'Saved a note' };
          await addMessage(sid, 'assistant', reply, { free: true, usage });
          send({ type: 'reply', text: reply, model: 'No AI needed (free)', usage });
          await touchSession(sid);
          send({ type: 'cost', usd: 0, sessionUsd: await sessionCost(sid), inputTokens: 0, outputTokens: 0 });
          return;
        }

        // Anything the app can do by itself (open a place, turn the page, open Rashi, switch style, repeat, thanks…)
        // is done here with no AI call: free and instant. Only real learning goes to the AI.
        const routed = handed ? null : await routeWithoutAI({ message, spoken, settings, sessionId: sid, sources, history, memories, approved, pre }).catch(() => null);
        if (routed?.settings) {
          settings = await saveSettings(routed.settings);
          send({ type: 'mode', settings: routed.settings });
        }
        if (routed?.source && routed.source !== pre && !sources.some((x) => x.ref === routed.source!.ref)) {
          send({ type: 'source', source: routed.source });
          await addSource(sid, routed.source);
          sources.push({ id: 'routed', ref: routed.source.ref, he_ref: routed.source.heRef, data: routed.source, created_at: new Date().toISOString() });
        } else if (routed?.source && routed.source !== pre) {
          send({ type: 'source', source: routed.source }); // already in this session: bring it back into view
        }
        if (routed?.readThrough) send({ type: 'readthrough', ...routed.readThrough });
        // Read, Explain, Ask in a call: when a new amud begins, the voice first gives the amud intro (once per session).
        const wantsIntro = spoken && (settings.style === 'reader' || settings.blend === 'reader') && settings.amudIntro !== false && settings.introVoice !== false;
        const introSaid = (base: string) => history.some((m) => m.role === 'assistant' && (m.meta as { introFor?: string } | null)?.introFor === base);
        const introBaseAt = (ref: string | null | undefined, part?: number) => {
          if (!ref || / on /i.test(ref)) return null;
          const p = splitRef(ref);
          return p.n <= 1 && (part ?? 1) <= 1 ? p.base : null;
        };
        if (routed?.reply && routed.then !== 'ai') {
          const introBase = wantsIntro ? introBaseAt(routed.line?.ref ?? routed.source?.ref, routed.line?.part) : null;
          const introText = introBase && !introSaid(introBase) ? await introSoon(introBase) : '';
          if (introText) routed.reply = `${introText}\n\n${routed.reply}`;
          // Who reads the text in a call: only the English, or only the gist (the learner reads it himself).
          if (spoken) routed.reply = forReader(routed.reply, settings.voiceReads ?? 'all') || 'Okay.';
          if (routed.source) {
            const src = routed.source;
            try { after(async () => { const p = await prepareCommentaries(src.ref, approved).catch(() => null); if (p) await warmTexts(p.refs, approved); }); } catch { /* optional */ }
          }
          const usage = { ai: false, reason: routed.line ? `Showed ${routed.line.ref} with its translation` : routed.source ? `Opened ${routed.source.ref}` : routed.settings ? 'Changed a setting' : 'Handled by the app' };
          const opPlace = spoken && routed.source && !routed.line ? openingPlace(routed.source) : null; // read aloud in pieces
          await addMessage(sid, 'assistant', routed.reply, { free: true, usage, ...(introText ? { introFor: introBase } : {}), ...(routed.source ? { opened: routed.source.ref } : {}), ...(routed.line ? { line: routed.line } : {}), ...(opPlace ? { pos: opPlace } : {}) });
          // Mikraos Gedolos on screen: go to the pasuk (and meforesh) just read or opened.
          {
            const lr = routed.line?.ref ?? (routed.source && / on /.test(routed.source.ref) ? routed.source.ref : '');
            const m3 = lr.match(/((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d+):(\d+)/);
            if (m3) send({ type: 'mgfocus', perek: m3[1], pasuk: Number(m3[2]), who: / on /.test(lr) ? lr.split(' on ')[0] : null });
          }
          send({ type: 'reply', text: routed.reply, model: 'No AI needed (free)', usage });
          await touchSession(sid);
          send({ type: 'cost', usd: 0, sessionUsd: await sessionCost(sid), inputTokens: 0, outputTokens: 0 });
          return;
        }

        // If the app opened a place on the last turn, hand its text to the AI now so it doesn't spend a step fetching it.
        const lastBot = [...history].reverse().find((m) => m.role === 'assistant');
        const openedRef = !pre && typeof lastBot?.meta?.opened === 'string' ? lastBot.meta.opened as string : null;
        const opened = openedRef ? sources.find((x) => x.ref === openedRef)?.data ?? null : null;
        // Text in hand: the few real lines around the learner's place go to the AI with the question,
        // so it doesn't spend a lookup (time and money) fetching them. When the learner points somewhere
        // inside a page just opened ("at the two dots", "where it says…"), it gets a bigger piece to search.
        const place = pre ? splitRef(pre.ref) : currentPlace(history, sources);
        // Mikraos Gedolos open on the learner's screen: point it at the pasuk (and meforesh) this turn is about.
        const CHUMASH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) (\d+)/;
        const focusMg = (ref: string, n?: number | null) => {
          const who = ref.match(/^(.+?)(?: on |, )(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Bereishit|Shemot|Vayikra|Bamidbar|Devarim)\b/)?.[1] ?? null;
          const perek = ref.match(CHUMASH)?.[0] ?? ref.match(/(?:on |, )((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d+)/)?.[1] ?? (place && CHUMASH.test(place.base) ? place.base.match(CHUMASH)![0] : null);
          const pasuk = n ?? Number(ref.match(/ \d+:(\d+)/)?.[1] ?? 0);
          if (perek && pasuk) send({ type: 'mgfocus', perek, pasuk, who });
        };
        // Lamdan (prepared): the commentaries on the line are handed over every turn.
        const lamdan = !!styleById(settings.style, settings.customStyles).preload || (!!settings.blend && !!styleById(settings.blend, settings.customStyles).preload);
        const pointing = /\btwo dots\b|\bwhere it says\b|\bline (that )?(starts|starting|begins|beginning)\b|\bthe (mishna|mishnah|gemara)\b|\bamud (bet|beis|b)\b|\bthe (end|bottom|middle)\b/i.test(message);
        const inHand = place && !(pre && pointing) ? await textInHand(place, sources, approved, pre ? 1 : undefined).catch(() => null) : null;
        // A question about a commentary ("what is Tosafos asking?"): the app finds and opens it, and hands the AI its text.
        const comm = !pre && askedCommentary ? await findCommentary(message, sources, approved, history).catch(() => null) : null;
        let commNote = '';
        // Lamdan: the real words of the Rishonim and Acharonim on the line we're on (and the next), from Sefaria.
        if (lamdan && place && !/ on /i.test(place.base)) {
          const prep = await Promise.race([
            prepareLamdan(place.base, [place.n, place.n + 1], approved).catch(() => null),
            new Promise<null>((r) => setTimeout(() => r(null), 6000)),
          ]);
          if (prep) commNote += `\n\n[PREPARED: the commentaries on ${place.base}, lines ${place.n} and ${place.n + 1}, from Sefaria. Work from these; name who says what; say it in your own words.]\n${prep}`;
        }
        let introFor: string | null = null;
        if (wantsIntro && place && place.n <= 1 && (place.part ?? 1) <= 1 && !/ on /i.test(place.base) && !introSaid(place.base)) {
          const intro = await introSoon(place.base, 5000);
          if (intro) {
            introFor = place.base;
            commNote += `\n\n[AMUD INTRO: this is the start of ${place.base}. Before you read its first line, give the learner this overview of what's coming on the amud, in your own spoken words and about the same length. Then go on with the text as your style does (no second preview of the first move).]\n${intro}`;
          }
        }
        // The big picture, any time ("big picture", "where are we?", "zoom out"): the sugya, the steps so far, where we
        // are, and where it's heading, built on the amud's intro when there is one.
        if (!pre && /\b(big picture|where are we( holding| up to)?|zoom out|overview|what'?s (going on|the sugya about|this sugya about)|the gist of (the|this) (sugya|amud|perek)|recap)\b/i.test(message)) {
          const intro = place && !/ on /i.test(place.base) ? await introSoon(place.base, 5000).catch(() => '') : '';
          commNote += `\n\n[BIG PICTURE: the learner wants the big picture right now. Do not read any text and use no [[say]] block. ${spoken ? 'In about 60 to 100 spoken words' : 'In one short paragraph'}: what the sugya here is about; the steps so far, in order; exactly where we are now; and where it is heading next. Then stop, with no question about going on. Do not move the place.]${intro ? `\nThe amud's overview, for reference:\n${intro}` : ''}`;
        }
        if (comm && 'src' in comm) {
          if (!sources.some((x) => x.ref === comm.src.ref)) {
            await addSource(sid, comm.src);
            sources.push({ id: 'comm', ref: comm.src.ref, he_ref: comm.src.heRef, data: comm.src, created_at: new Date().toISOString() });
          }
          send({ type: 'source', source: comm.src });
          focusMg(comm.src.ref, comm.line ?? null);
          commNote = `\n\n[The app opened ${comm.src.ref} for the learner (${comm.count} comment${comm.count > 1 ? 's' : ''}). Its text is below, so you do not need get_text for it.]\n${textForModel(comm.src, spoken, spoken && settings.translate === 'literal')}`;
        } else if (comm && 'missing' in comm) {
          commNote = `\n\n[The app checked Sefaria: there is no approved ${comm.missing} on ${comm.on}. Tell the learner that plainly; do not guess what it says.${comm.available.length ? ` The commentaries this text does have: ${comm.available.join(', ')}. Offer one of them (for Mishnayos, usually the Bartenura).` : ''}]`;
        }

        // Short acknowledgments go to the cheaper model of the same company; real learning turns use the chosen depth.
        const quick = settings.quickReplies !== false && isQuickReply(message) && !pre && !opened;
        // Saver: everyday turns go to the middle model. Saying "go deeper" (or similar)
        // brings back the chosen depth for that turn and the next two.
        const recentUser = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
        const deep = wantsDepth(message) || recentUser.some(wantsDepth);
        // Saver applies to typed and spoken turns. Spoken Saver turns are also kept lean (short history and excerpt).
        const saver = settings.saver !== false;
        const everyday = saver && !deep;
        const lean = spoken && everyday;
        // Saver's everyday brain is the middle model (Sonnet / Sol), or the chosen depth if that is lower.
        const saverTier = settings.tier === 'basic' ? 'basic' : 'middle';
        const model = MODELS[settings.provider][quick ? 'basic' : everyday ? saverTier : settings.tier];
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
        // Some styles are themselves a request for sources: Iyun always brings Rishonim and Acharonim;
        // Mussar and Chassidic bring their seforim on Chumash and Tanach (on Gemara/Mishnah they stay with the text).
        const mainRef = pre?.ref ?? [...sources].reverse().find((x) => !/ on /i.test(x.ref))?.ref ?? '';
        const onTanakh = TANAKH.test(mainRef);
        const styleSources = settings.style === 'iyun' || lamdan || (['mussar', 'chassidic'].includes(settings.style) && onTanakh);
        const allowCommentary = askedCommentary || styleSources;
        const styleNote = lamdan
          ? '\n\n# Sources in this style\nLamdan: the commentaries on the line we are on are handed to you as PREPARED. Raise their kashyos yourself and give the answers, one at a time, naming who says what, in your own words (no quoting their lashon kodesh unless asked). Bring nothing that is not in front of you.'
          : settings.style === 'iyun' && !askedCommentary
          ? '\n\n# Sources in this style\nIn Iyun you may bring the main Rishonim and Acharonim without being asked, but only ONE at a time and only when it moves the analysis forward. Never survey commentaries.'
          : ['mussar', 'chassidic'].includes(settings.style) && !askedCommentary
            ? (onTanakh
              ? '\n\n# Sources in this style\nOn Chumash and Tanach you may bring classic seforim of this style (and Kli Yakar, Ohr HaChaim and the like) without being asked: one at a time, only when it truly adds.'
              : '\n\n# Sources in this style\nThis is Gemara or Mishnah: draw the lesson from the words of the text itself. Do not bring outside seforim; if one would really add, mention it in one line and offer.')
            : '';
        // Opus (the top model) on a spoken turn (Nov 5): it followed the "write it as said" spelling rule to the letter and
        // filled its explanations with spelled-out words ("Yoichonon", "koihein", "eiphah"); the voice stumbled on them and
        // carried the slip into the next piece of Hebrew. Sonnet explains in plain English and the Hebrew stays clean, so
        // Opus is asked to explain the same way (same depth and intros). To undo: remove plainSpoken.
        const plainSpoken = spoken && model.id === MODELS[settings.provider].top.id
          ? settings.nusach === 'sephardi'
            ? '\n\nHOW TO WORD A SPOKEN EXPLANATION (the [[say]] block is unchanged): explain in plain English, with all your depth and your intros. Keep only the everyday learning words (pasuk, Gemara, Mishnah, Rashi, Tosafot, baraita, kushya, terutz, machloket, gezera shava, kal vachomer, halacha, Kohen Gadol, tamei, tahor), in Sephardi transliteration, and say everything else in English. Write names the usual Sephardi way (Moshe, Aharon, Yaakov).'
            : '\n\nHOW TO WORD A SPOKEN EXPLANATION (this wins over the transliteration rule above for your explanation; the [[say]] block is unchanged): explain in plain English, with all your depth and your intros. Keep only the everyday learning words a yeshiva bochur says in English anyway (posuk, Gemara, Mishnah, Rashi, Tosfos, braisa, kashya, teretz, machlokes, gezeirah shavah, kal vachomer, halacha, Kohen Gadol, tamei, tahor), and say everything else in English (a small flour offering, not "a tenth of an eiphah"; a kohen, not "koihein"). Write names the usual yeshivish way (Moishe, Aharon, Rabbi Yochanan, Rabbi Chiya), never spelled out sound by sound ("Yoichonon"). Few Hebrew words in a row; never a string of them.'
          : '';
        const system = buildSystemPrompt(settings, memories, [...new Set(sources.map((s) => s.ref))], today, spoken, sid) + styleNote + plainSpoken;

        const emit = (e: ToolEvent) => send(e);
        const baseExecute = makeExecutor({
          allowCommentary,
          literal: spoken && settings.translate === 'literal',
          sessionId: sid,
          approved,
          saveSettings: async (p) => (settings = await saveSettings(p)),
          emit,
        });
        let lookups = 0; // how many times the AI used a tool (looked up a source, saved a note…)
        const execute = (async (...args: Parameters<typeof baseExecute>) => { lookups++; return baseExecute(...args); }) as typeof baseExecute;
        // Why the AI is answering this turn (shown under the reply, so the learner can see what engages it).
        const reason = routed?.then === 'ai' ? 'Style switched for free; the AI starts it in the new style'
          : quick ? 'Short reply, answered by the cheapest model'
          : pre ? `A question about ${pre.ref} (opening it was free)`
          : saver && deep ? 'You asked to go deeper'
          : everyday ? `Everyday learning turn (Saver: ${MODELS[settings.provider][saverTier].label}; say "go deeper" for ${MODELS[settings.provider][settings.tier].label})`
          : 'Learning turn: explaining, asking, or answering';

        // Spoken "go on": the app, not the brain, decides what comes next: the piece right after where he is.
        // "Yes" / "sure" / "ok" after the chavrusa asked whether to go on ("Ready for more?") is a go on too.
        const askedOn = /(ready|more|go on|continue|next|keep going|move on|shall i|should i|want me to|want to)[^?]*\?\s*(\[\[line:[^\]]*\]\])?\s*$/i.test((lastBot?.content ?? '').trim());
        const yes = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|go|mm-?hm+|uh-?huh|right|great|good|ready|absolutely|definitely|of course)\b[\s\w',.!]{0,20}$/i.test(message);
        const goOn = !!handed || spoken && message.length < 80 && (/\b(go ahead|go on|next|continue|keep going|move on|carry on|proceed|onward|let'?s go|what'?s next|and then|keep reading|finish)\b/i.test(message) || (yes && askedOn));
        let readNext = '';
        let nextAt: Expect | null = null; // the piece "go on" brings (its place is kept even when nothing is read aloud)
        // Read at once, explain after (in a GPT-Live call): on "go on" the app hands the voice the next piece right away
        // (the Hebrew and its English, phrase by phrase), and the brain writes only what comes after the reading.
        // The app holds that until the voice has finished reading, so nothing new arrives in the middle of it.
        let early = '';
        // Only the gist: the learner reads the text himself, so the chavrusa doesn't read it at all.
        const gistNote = spoken && settings.voiceReads === 'gist' ? '\n\n[THE LEARNER READS THE TEXT HIMSELF: do not use a [[say]] block and do not read or quote the text, in Hebrew or English. Give the gist of the piece in a sentence or two, in your own words (its steps), then go on with your style\'s part.]' : '';
        if (goOn && handed) {
          // Already handed by the page: the same note the read-at-once path gives, without handing it again.
          early = handed.early;
          const said = (handed.early.match(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/i)?.[1] ?? '').split('|').map((x) => x.trim()).filter(Boolean).join('\n');
          readNext = `\n\n[ALREADY BEING READ: the learner said to go on, and the app has already handed the voice the next piece, ${handed.at.base} line ${handed.at.n}${handed.at.part ? ` part ${handed.at.part}` : ''}, which it is reading aloud right now:\n${stripNikud(said)}\nDo not read it again and write no [[say]] block. Write only what comes after the reading in your style (the explanation, and a question if your style asks one), starting right in, as if continuing straight after the reading.]`;
          nextAt = handed.at;
        } else if (goOn && place && settings.nusach !== 'sephardi' && !/ on /i.test(place.base)) {
          try {
            const sec = await section(place.base, sources, approved);
            let nx = sec ? nextPiece({ base: place.base, he: sec.he, en: sec.en }, place) : null;
            let nb = place.base;
            if (sec && !nx) {
              const b2 = nextSection(place.base);
              const sec2 = b2 ? await section(b2, sources, approved) : null;
              if (b2 && sec2?.he.length) { nb = b2; nx = nextPiece({ base: b2, he: sec2.he, en: sec2.en }, { n: 0 }) ?? null; }
            }
            const sx = nb === place.base ? sec : await section(nb, sources, approved);
            if (nx && settings.voiceReads !== 'gist' && settings.liveEngine !== 'gemini' && !lamdan && !introFor) {
              // The English as he chose it; phrase by phrase when the line can be cut into phrases.
              const enB = sx?.enB?.[nx.n - 1];
              // The lashon kodesh phrase by phrase, then the English of the whole piece. (Pairing each phrase with its
              // own English by position put English under the wrong Hebrew where the word order differs; exact
              // phrase-by-phrase pairs come only from the brain, which pairs by meaning.)
              const hePh = voicePhrases(nx.he);
              const enLine = nx.en ? namesForSpeechEn(englishFor(nx.en, enB, settings.translate, !!nx.part, nx.he)) : '';
              const body = `${hePh.map((x) => voiceHe(x, settings.heRead)).join(' | ')}${enLine ? ` | ${enLine}` : ''}`;
              early = `${nb !== place.base ? `${nb}. ` : ''}[[say]]${body}[[/say]]`;
              send({ type: 'early', text: early });
              readNext = `\n\n[ALREADY BEING READ: the learner said to go on, and the app has already handed the voice the next piece, ${nb} line ${nx.n}${nx.part ? ` part ${nx.part}` : ''}, which it is reading aloud right now:\n${stripNikud(nx.he)}${nx.en ? `\n    ${nx.en}` : ''}\nDo not read it again and write no [[say]] block. Write only what comes after the reading in your style (the explanation, and a question if your style asks one), starting right in, as if continuing straight after the reading.]`;
              nextAt = { base: nb, n: nx.n, ...(nx.part ? { part: nx.part } : {}) };
            } else if (nx) {
              readNext = settings.voiceReads === 'gist'
                ? `\n\n[NEXT PIECE: the learner said to go on. The next piece, right after where he is, is ${nb} line ${nx.n}${nx.part ? ` part ${nx.part}` : ''}:\n${stripNikud(nx.he)}${nx.en ? `\n    ${nx.en}` : ''}\nHe reads it himself. Do not read it: give the gist of exactly this piece, then your style's part. Do not skip ahead and do not go back.]`
                : `\n\n[READ NEXT: the learner said to go on. The next piece, right after where he is, is ${nb} line ${nx.n}${nx.part ? ` part ${nx.part}` : ''}:\n${stripNikud(nx.he)}${nx.en ? `\n    ${nx.en}` : ''}\nRead exactly this piece now, all of it, in one [[say]] block, then your style's part. Do not skip ahead and do not go back.]`;
              nextAt = { base: nb, n: nx.n, ...(nx.part ? { part: nx.part } : {}) };
            }
          } catch { /* the brain still has the text in hand */ }
        }
        send({ type: 'status', text: 'Thinking…' });
        const marks = markFilter((t) => send({ type: 'delta', text: t }));
        const startedAt = new Date().toISOString();
        const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
        const result = await run({
          model: model.id,
          lang: !spoken, // typed turns: the language chosen in Settings; a call stays in English for the voice
          system,
          history: [
            // Saver keeps only the recent conversation on spoken turns: less to read every time.
            ...(lean ? history.slice(-10) : everyday ? history.slice(-14) : history).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: (inHand
              ? `${message}\n\n${inHand}`
              : pre
                ? `${message}\n\n[The app already opened this source for the learner. Its text is below, so you do not need get_text for it.]\n${textForModel(pre, lean, spoken && settings.translate === 'literal')}`
                : message)
              + commNote
              + readNext
              + gistNote
              + (lamdan && /^\s*(ok(ay)?|yes|yeah|next|go on|keep going|move on|moving on|continue|next one|onward)[.!]?\s*$/i.test(message) ? '\n\n[The learner is moving on. If an important kashya on this line is still waiting, bring it now with its answer; otherwise read the next piece and bring the kashya on it. Do not ask whether he wants it.]' : '')
              + (CONTINUE.test(message) || (spoken && /\bcontinue\b/i.test(message) && !/continue reading|continue from|where we left/i.test(message)) ? '\n\n[The learner said "continue": that means move on to the next piece of the text, right after the line he is on, and follow the full basic formula: read it phrase by phrase with its English, explain only if needed, and if a move was made, say it over in your own words, then your style\'s part. ("Next" is the free way that only reads.)]' : '')
              + (prepared ? `\n\n[Main commentaries on this text (approved). Use get_text on a specific ref when you bring one; you do not need get_connections for these.]\n${prepared.list}` : '') },
          ],
          tools: allowCommentary ? TOOLS : TOOLS.filter((t) => t.name !== 'get_connections'),
          execute,
          // Spoken turns need quick answers: think one level less.
          // Deep styles (Iyun, Sevara) think one level more; fast ones (Bekius, Farher) and spoken turns one level less.
          effort: shiftEffort(model.effort, (styleById(settings.style, settings.customStyles).effortShift ?? 0) - (spoken ? 1 : 0), settings.provider, settings.tier),
          thinking: model.thinking,
          maxSteps: lean ? 3 : 5,
          onText: (d) => marks.push(d),
        });
        marks.flush();

        // The AI marks the line it finished on ([[line:N]]); remember it as the learner's place, and hide the mark.
        const marked = readMark(result.text || '');
        let readPlace: Expect | null = null;
        let reply = marked.text || 'I got lost looking up sources. Could you say that again, or point me to a specific source?';
        // Spoken: the text the voice reads comes from the sefer itself. The brain's [[say]] phrases are matched to the
        // real words, checked that nothing was skipped, and written out in the app's yeshivish pronunciation.
        if (early) reply = reply.replace(/\[\[say\]\][\s\S]*?\[\[\/say\]\]/gi, ' ').replace(/\s+/g, ' ').trim(); // the text was already handed over
        if (!early && spoken && /\[\[say\]\]/i.test(reply) && settings.nusach !== 'sephardi') {
          try {
            const base = place?.base || marked.base || mainRef.replace(/:\d+(-\d+)?$/, '');
            const secs: Section[] = [];
            for (const b of [...new Set([base, marked.base, base ? nextSection(base) : null])]) {
              if (!b) continue;
              const sec = await section(b, sources, approved);
              // With "just the literal words", the app's own corrections of the block use the literal English too.
              if (sec?.he.length) secs.push({ base: b, he: sec.he, en: settings.translate && settings.translate !== 'full' && sec.enB?.length ? sec.en.map((e, i) => englishFor(e, sec.enB?.[i], settings.translate, false, sec.he[i] ?? '')) : sec.en });
            }
            // He asked to go on: the reading must start right after where he is (the brain sometimes jumps ahead).
            if (secs.length) {
              const fx = fixSay(reply, secs, goOn && place ? { base: place.base, n: place.n, part: place.part } : null, settings.heRead ?? 'join-kh');
              reply = fx.text;
              readPlace = fx.last;
              // For the call recorder: how the text was checked against the sefer.
              if (fx.notes.length) send({ type: 'check', text: `${goOn ? `go on from ${place?.base} line ${place?.n}${place?.part ? `.${place.part}` : ''} · ` : ''}${fx.notes.join(' || ')}` }); // where he really is now: the last piece read aloud, not where the brain says it stopped
            }
          } catch { /* the reply still goes out as the brain wrote it */ }
        }
        if (spoken) {
          if ((settings.voiceReads === 'gist' || early) && nextAt && !readPlace) readPlace = nextAt;
          reply = forReader(reply, settings.voiceReads ?? 'all') || reply;
        }
        // The learner tapped a line while this answer was being written: his tap wins, so don't move the place.
        const tappedSince = (await listSources(sid).catch(() => [])).some((x) => (x.data?.tappedAt ?? 0) > Date.parse(startedAt));
        const newPlace0 = readPlace ? readPlace : marked.n && (place || marked.base) ? { base: marked.base || place!.base, n: marked.n, ...(marked.part ? { part: marked.part } : {}) } : currentPlace([], (await listSources(sid)).filter((x) => x.created_at >= startedAt)) ?? place;
        const newPlace = tappedSince ? null : newPlace0;
        if (newPlace && CHUMASH.test(newPlace.base)) focusMg(`${newPlace.base}:${newPlace.n}`);
        // It went on into the next amud / perek: open it in the Sefer, at that line.
        if (newPlace && place && newPlace.base !== place.base) {
          try {
            const nx = await getText(newPlace.base, approved);
            if (nx.verdict.allowed && nx.he.length) {
              const src: SourceData & { verdict?: unknown } = { ...nx, focus: newPlace.n };
              delete src.verdict;
              await addSource(sid, src);
              send({ type: 'source', source: src });
            }
          } catch { /* the place is still saved */ }
        }
        const usd = costUsd(model, result.inputTokens, result.outputTokens, result.cachedTokens ?? 0, result.cacheWriteTokens ?? 0);
        const usage = { ai: true, model: model.label, reason, usd, lookups };
        const after2 = reply; // with "read at once": what the voice says after the reading
        if (early) reply = `${early}\n\n${reply}`;
        await addMessage(sid, 'assistant', reply, { model: model.id, style: settings.style, blend: settings.blend, usage, ...(introFor ? { introFor } : {}), ...(newPlace ? { pos: newPlace } : {}) });
        send({ type: 'reply', text: reply, model: model.label, usage, ...(early ? { early: true, after: after2 } : {}) });

        await logCost({ sessionId: sid, provider: settings.provider, model: model.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: usd });
        await touchSession(sid);
        send({ type: 'cost', usd, sessionUsd: await sessionCost(sid), inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      } catch (e) {
        send({ type: 'error', text: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
