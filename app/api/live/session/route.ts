import { englishFor } from '@/lib/literal';
import { NextRequest, NextResponse } from 'next/server';
import { outOfCredit } from '@/lib/credits';
import { LIVE, LIVE_VOICES, VOICE_SAMPLE, forNusach } from '@/lib/config';
import { getSettings } from '@/lib/db';
import { liveContext, liveContextShort, liveInstructions, liveInstructionsShort, RULES } from '@/lib/live';
import { HE_READS, namesForSpeechEn, voiceHe, type HeRead } from '@/lib/hebrew';
import { listMemories, listMessages, listSources } from '@/lib/db';
import { currentPlace } from '@/lib/place';
import { styleById, styleCard } from '@/lib/config';
import { gptLine, sayNote } from '@/lib/geminiPron';
import { forVoice } from '@/lib/geminiSpeech';

export const runtime = 'nodejs';

// The browser sends its WebRTC offer here; we start a GPT-Live session with our key and return the answer.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const sdp = await req.text();
  if (!sdp.startsWith('v=')) return NextResponse.json({ error: 'Missing WebRTC offer.' }, { status: 400 });
  // Credits (lib/credits.ts). Voice samples and tests count too: they are real voice sessions, and leaving them out
  // would let a learner with no credit talk for free.
  { const out = await outOfCredit(); if (out) return NextResponse.json({ error: out }, { status: 402 }); }
  const s = forNusach(await getSettings()); // Sephardi: Hebrew letters, no yeshivish respellings (lib/config)
  const askVoice = req.nextUrl.searchParams.get('voice');
  const preview = req.nextUrl.searchParams.get('preview') === '1';
  const allowed = [...LIVE_VOICES.map((v) => v.id), ...(s.customVoices ?? []).map((v) => v.id)];
  const voice = askVoice && allowed.includes(askVoice) ? askVoice : (s.liveVoice || 'meridian');
  // Designed voices are passed by id, with their description to help the model perform them.
  const custom = (s.customVoices ?? []).find((v) => v.id === voice);
  const voiceField = custom ? { id: custom.id } : voice;
  const voiceNote = custom?.prompt ? `\nYour speaking voice: ${custom.prompt}` : '';
  // The learner's style, place, and requests go to the voice too, so it can carry the conversation itself.
  let context = '';
  let recap = '';
  let lastSaid = '';
  let lastAt: string | null = null;
  let pointed = ''; // the line the learner tapped in the Sefer since we last spoke: start there
  let point: { ref: string; n: number; he: string; en: string; enB?: string; literal?: boolean } | null = null; // …which the app hands the voice itself
  // Short instructions (Settings → Voice → Instructions), the default: about a third of the words.
  // The rule lab: a test can ask for a combination of pronunciation rules (always with the short instructions); calls use
  // the combination the learner chose (Settings), or the standard.
  const askRules = req.nextUrl.searchParams.get('rules');
  const rules = askRules !== null ? askRules.split(',').filter(Boolean) : (s.liveRules ?? []);
  // A test can also ask for the short or the full instructions (the easy test compares them).
  const askInstr = req.nextUrl.searchParams.get('instr');
  // …and a speed (the easy test tries the speeds too).
  const askPace = req.nextUrl.searchParams.get('pace');
  const pace = (['slow', 'relaxed', 'natural', 'brisk'] as const).find((x) => x === askPace) ?? s.livePace;
  const short = askInstr === 'short' ? true : askInstr === 'full' ? false : askRules !== null || s.liveShort !== false;
  // A plain opening: the app's retry after a call whose voice never started. Only the place: no tapped line, no recap
  // of the conversation, no instructions saved for this session (one of them may be what held the voice up).
  const plainOpen = req.nextUrl.searchParams.get('plain') === '1';
  if (!preview) {
    try {
      const sid = req.nextUrl.searchParams.get('session');
      const [memories, history, sources] = await Promise.all([
        listMemories(), sid ? listMessages(sid, 30) : Promise.resolve([]), sid ? listSources(sid) : Promise.resolve([]),
      ]);
      const st = styleById(s.style, s.customStyles);
      const place = sid ? currentPlace(history, sources) : null;
      const ctx = {
        styleName: st.name,
        styleRules: st.behavior,
        leads: st.asks === false ? 'you explain' : s.leads === 'learner' ? 'the learner explains first' : 'you explain first, then ask',
        place: place ? `${place.base}, line ${place.n}` : null,
        requests: plainOpen ? [] : memories.filter((m) => m.scope === `session:${sid}`).map((m) => m.content),
        saved: memories.filter((m) => m.kind === 'instruction' && !m.scope?.startsWith('session:')).map((m) => m.content),
        noticed: memories.filter((m) => m.kind === 'observation').map((m) => m.content),
        card: styleCard(s.style, s.customStyles) + (s.blend ? ` Also: ${styleCard(s.blend, s.customStyles).replace(/^.*?this style's part\. /, '')}` : ''),
      };
      context = short ? liveContextShort(ctx) : liveContext(ctx);
      // The conversation so far, so a new or resumed call picks up exactly where we were.
      // The text read in earlier turns is left out of what the voice sees (only "[read the text inside]"): otherwise it
      // reads it again by itself, from memory, without the app knowing (the place goes wrong), and copies old spellings.
      const plain = (t: string) => t.replace(/\[\[say\]\][\s\S]*?\[\[\/say\]\]/gi, ' [read the text inside] ').replace(/\[\[line:[^\]]*\]\]/g, '').replace(/^\s*>\s?/gm, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
      // Shorten at the end of a sentence (never in the middle of one), so the voice doesn't pick up half a thought.
      const clip = (t: string, n: number) => {
        if (t.length <= n) return t;
        const cut = t.slice(0, n);
        const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('." '), cut.lastIndexOf('?" '));
        return end > n * 0.4 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
      };
      const recent = plainOpen ? [] : history.slice(-12);
      recap = recent.map((m) => `${m.role === 'user' ? 'Learner' : 'You'}: ${clip(plain(m.content), 320)}`).join('\n');
      const lastBot = [...recent].reverse().find((m) => m.role === 'assistant');
      lastSaid = lastBot ? clip(plain(lastBot.content), 600) : '';
      lastAt = recent.length ? recent[recent.length - 1].created_at : null;
      // Not a tap: the same amud just shown again (opened from the Library or Recent, or put back after Settings) is
      // no reason to start at its first line (log of Nov 8, 3:06 PM: the call started at 6a line 1, mid-sentence,
      // though we had learned well into the amud). Only a real tap, or a different place, moves where we start.
      const herePlace = currentPlace(history, sources);
      const realTap = (x: { data?: { tappedAt?: number } | null; ref: string }) => !!x.data?.tappedAt || !herePlace || herePlace.base !== x.ref;
      const tapped = [...sources].reverse().find((x) => x.data?.focus);
      if (tapped && realTap(tapped) && !plainOpen && (!lastAt || tapped.created_at > lastAt)) {
        const n = tapped.data.focus as number;
        const he = tapped.data.he[n - 1] ?? '';
        // The English as the learner chose it (Settings → Voice: the literal words, when Sefaria marks them).
        const en = englishFor(tapped.data.en[n - 1] ?? tapped.data.altEn?.[n - 1] ?? '', tapped.data.enB?.[n - 1], s.translate, false, he);
        const reads = s.voiceReads ?? 'all';
        point = { ref: tapped.ref, n, he, en, enB: tapped.data.enB?.[n - 1], literal: !!s.translate && s.translate !== 'full' };
        const enLine = en ? clip(namesForSpeechEn(en), 600) : '';
        pointed = reads === 'gist'
          ? `The learner has chosen where to learn: ${tapped.ref}, line ${n}. He reads it himself. In English it says: "${enLine}". In a sentence or two, give the gist of this line in your own words (do not read it), then stop and wait. Do not go past this line by yourself.`
          : reads === 'english'
            ? `The learner has chosen where to learn: ${tapped.ref}, line ${n}. He reads the lashon kodesh himself. Read its English now, as the text: "${enLine}". Then stop and wait. Do not go past this line by yourself.`
            : `The learner has chosen where to learn: ${tapped.ref}, line ${n}. Start right there. The line reads: ${voiceHe(he, s.heRead)}${en ? ` — in English: "${enLine}"` : ''}. Say it phrase by phrase (lashon kodesh, then English), every phrase to the end of the line, then stop and wait. Do not go past this line by yourself.`;
      }
    } catch { /* the call still works without it */ }
  }
  const resume = req.nextUrl.searchParams.get('resume') === '1';
  const placeName = context.match(/The learner is on (.*?), line \d+/)?.[1] ?? null;
  const recapBlock = recap ? `\n\n# The conversation so far in this session (most recent last)\n${recap}` : '';
  // How the call opens depends on the circumstances, like a real chavrusa: no formal hello if we were just learning.
  const mins = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : null;
  // The hello (Nov 10): after a while away (3 hours or more), a short friendly hello, a different one each call; just
  // back from a few minutes away, none; in between, a few natural words.
  const FLAVORS = ['that it is good to be learning together again', 'a warm "good to have you back" in your own words', 'a quick, friendly "let\'s get back into it"', 'a word of real enjoyment at sitting down to learn', 'a short, warm word that he came back to learn (no flattery)', 'a light, friendly line about picking the sugya back up', 'a cheerful "ready to go" in your own words', 'a brief, warm word about the learning waiting for us'];
  const away = mins === null ? 'a while' : mins < 24 * 60 ? 'earlier today' : mins < 48 * 60 ? 'yesterday' : `${Math.round(mins / 1440)} days ago`;
  const greet = mins !== null && mins < 20
    ? 'no greeting; we were just learning'
    : mins !== null && mins < 180
    ? 'a few natural words, no formal greeting'
    : `we last learned ${away}: start with one short, friendly hello the way a real chavrusa does when you sit down to learn again, for example ${FLAVORS[Math.floor(Math.random() * FLAVORS.length)]}. Say it in your own words, different from any other time, one sentence, no question that waits for an answer`;
  // Keep going by itself (Settings): the opening doesn't ask whether to go on; the app goes on after it by itself.
  const auto = s.autoGo === true && !preview;
  // "Open calls the Nov 3 way" (Settings, a test): everything about how a call opens as it was on Nov 3 at 9:23 PM,
  // before the changes since (the voice opens the call itself; the app brings nothing at the start; no retry).
  const oldOpen = s.liveOldOpen === true;
  const goOnAsk = oldOpen && auto ? 'say in a few words that we will go on now (do not ask), and stop: the app brings the next piece' : 'ask in a few words if he\'s ready to go on';
  // With Keep going by itself the voice doesn't open the call at all: the app hands it the next piece right away, and it
  // opens with a few words as it reads that piece. (Told to open first, it sometimes read the text from memory.)
  const autoOpen = !oldOpen && auto && !resume && !!(placeName || recap) && !pointed;
  // A tapped line: the app hands it to the voice as soon as the call opens (the way a tap mid-call does). Told to read
  // it from here, the voice said "let's start right here" and waited for the app, since its text comes only from the app.
  const pointOpen = point && !oldOpen ? `Do not speak first, and do not say, read or recite any text yourself. In a moment the app hands you the line the learner chose (${point.ref}, line ${point.n}); when it arrives, begin with ${greet}, and then do exactly what it says.${recapBlock}` : '';
  const hello = pointOpen ? pointOpen : autoOpen
    ? `Do not speak first, and do not say, read, recite or summarize any text yourself. In a moment the app hands you the next piece of the text${placeName ? ` (we are on ${placeName})` : ''}; when it arrives, begin with ${greet}, and then read it exactly as given, every word of it.${recapBlock}`
    : pointed
    ? `Speak first, briefly: ${greet}. ${pointed} Then listen.${recapBlock}`
    : !recap
    ? `Speak first, briefly and naturally, the way a chavrusa would when sitting down to learn: a short, warm, natural opener (not a formula, and different each time), ${placeName ? `then mention that last time we were on ${placeName} and ask if he wants to pick up there` : 'then ask what we are learning today'}. Then stop and listen.`
    : mins !== null && mins < 20
      ? `We were learning together just a few minutes ago. Do not greet. Speak first, very briefly, and simply continue from your last message: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again in a few words; otherwise ${goOnAsk}. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then listen.${recapBlock}`
      : `Speak first, briefly and naturally: ${greet}. In one sentence say where we were${placeName ? ` (${placeName})` : ''}. Your last message was: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again briefly; otherwise ${goOnAsk}. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then stop and listen.${recapBlock}`;
  const resumeNote = pointOpen ? pointOpen : pointed ? `The call is resuming after a short pause. Do not greet. ${pointed}${recapBlock}` : `The call is resuming after a short pause, in the middle of learning. Do not greet and do not recap. Continue exactly where you left off. Your last message was: "${lastSaid}". If the learner hasn't answered it yet, wait for him; when he speaks, carry on from there.${recapBlock}`;
  // A pronunciation test (Settings → Voice → Test it): say one line, spelled the way a call would get it.
  const testText = preview ? String(req.nextUrl.searchParams.get('say') ?? '').slice(0, 400) : '';
  // The Hebrew reading test can ask for one of the ways of giving the voice the lashon kodesh (else the one in use).
  const askMode = req.nextUrl.searchParams.get('mode') as HeRead | null;
  const heRead: HeRead = askMode && HE_READS.some((m) => m.id === askMode) ? askMode : s.heRead ?? 'join-kh';
  const testLine = testText ? gptLine(testText, s, heRead) : '';
  // The how-to movie's narration (components/HowTo.tsx): one line, said in Meridian, recorded once by the app.
  const narrate = preview && req.nextUrl.searchParams.get('narrate') === '1';
  const greeting = narrate
    ? `Say exactly this now, once, then stop: "${forVoice(testText, s.gptSpell ?? 'stressed', s.gptMyWay ?? [], s.houseSay !== false)}"`
    : testLine
    ? (askMode ? `Read this lashon kodesh aloud now, once, the way you read inside in a call: every word, from the first to the very last, in lashon kodesh. It has no English here: do not translate it, do not explain it, and never switch to English partway. Then stop. ⟪${testLine}⟫` : `Say exactly this now, once, the way you would in a call, then stop: "${testLine}"`)
    : `Say exactly this now, in your natural voice, then stop and wait: "${VOICE_SAMPLE}"`;
  const spell = s.gptSpell ?? 'stressed';
  // A slow brain (the top model on every turn: Saver off) may say one short word while the voice waits; a quick one, none.
  const slowBrain = s.tier === 'top' && s.saver === false;
  const myWay = s.gptMyWay ?? [];
  const house = s.houseSay !== false, steady = s.liveSteady === true;
  // Short instructions keep only the learner's own words here (the main standard ones are in the short guide, and the
  // text handed over is already spelled that way).
  const myWayNote = sayNote(myWay, house && !short);
  const fv = (t: string) => forVoice(t, spell, myWay, house);

  // The instructions for a call (or a test), with a given set of rules (so a failed start can try the standard ones).
  const build = (rl: string[]) => {
    const base = short ? liveInstructionsShort(s.nusach, pace, heRead, s.voiceReads ?? 'all', s.livePauses ?? 'normal', rl, s.customRules ?? [], slowBrain) : liveInstructions(s.nusach, pace, s.liveAccent ?? false, undefined, steady, heRead, s.voiceReads ?? 'all', s.livePauses ?? 'normal', slowBrain);
    if (narrate) return 'You are the narrator of a short how-to film for a Torah learning app, an American yeshiva bochur with a warm, calm, friendly voice and a natural yeshivish accent. Speak first, as soon as the session starts: say the line you are given, exactly as given, once, at an easy, unhurried pace, then stop. Do not add anything.' + voiceNote;
    return (preview && !testLine
      ? 'This is a short voice sample. Speak first, as soon as the session starts, without waiting for the user.'
      : preview && askMode === 'he-plain' && askRules === null
        ? 'This is a short reading test. Speak first, as soon as the session starts: read the text you are given aloud, once, clearly, then stop.'
      : preview
        ? `${fv(base)}${myWayNote}\nThis is a short pronunciation test. Speak first, as soon as the session starts: say the line you are given, once, then stop.`
        : fv(base + context) + myWayNote) + voiceNote;
  };
  const openSession = (instructions: string, vf: typeof voiceField) => fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        model: LIVE.model,
        instructions,
        // The opening is not given here (except to tests and the Nov 3 way): the app gives it once the phone's sound is
        // really going out. A call that began without sound got stuck loading its opening and never spoke.
        ...(preview || oldOpen ? { input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: preview ? greeting : fv(resume ? resumeNote : hello) }] }] } : {}),
        audio: { output: { voice: vf } },
        delegation: { type: 'client' },
      },
      transport: { type: 'webrtc', sdp },
    }),
  });
  let rulesFinal = rules;
  let res = await openSession(build(rules), voiceField);
  let data: any = await res.json().catch(() => ({}));
  // A call that OpenAI turns down because of a choice in Settings still starts, the safe way, and says why:
  // a voice it doesn't offer → Meridian; anything else while the learner's own rules are in use → the standard rules.
  let notice = '';
  if (!res.ok && !preview && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
    const why = String(data?.error?.message ?? '');
    if (/voice/i.test(why) && voice !== 'meridian') {
      res = await openSession(build(rules), 'meridian');
      data = await res.json().catch(() => ({}));
      notice = `The voice "${voice}" isn't available on GPT-Live, so this call uses Meridian. Choose another voice in Settings → Voice.`;
    } else if (short && rules.length) {
      res = await openSession(build([]), voiceField);
      data = await res.json().catch(() => ({}));
      rulesFinal = [];
      notice = `The rules you chose for calls wouldn't start a call (${why.slice(0, 120) || res.status}), so this call uses the standard rules.`;
    }
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Live voice could not start (${res.status}): ${data?.error?.message ?? 'unknown error'}` }, { status: 502 });
  }
  // How much text OpenAI got at the start of this call (for the call recorder: some calls never start, and it may be
  // the size or content of what a particular learning session sends).
  const opening = preview ? '' : fv(resume ? resumeNote : hello);
  const heCount = (t: string) => (t.match(/[\u05D0-\u05EA]/g) ?? []).length;
  const instr = build(rulesFinal);
  const sizes = `instructions ${instr.length} chars (${heCount(instr)} Hebrew letters) · context ${context.length} · opening ${opening.length} (${heCount(opening)} Hebrew) · recap ${recap.length} · tapped line ${pointed ? 'yes' : 'no'}`;
  // Which pronunciation rules this call really got, in words, for the call recorder.
  const ruleName = (id: string) => RULES.find((r) => r.id === id)?.name ?? (s.customRules ?? []).find((r) => r.id === id)?.name ?? id;
  const rulesUsed = !short ? 'full instructions (the rule lab applies only with Short)'
    : s.nusach !== 'ashkenaz' ? 'Sephardi guide (the rule lab applies only with Ashkenaz)'
    : !rulesFinal.length ? 'the standard (Yeshivish guide + Vowel key)'
    : rulesFinal[0] === 'none' ? 'no rules at all'
    : rulesFinal.map(ruleName).join(' + ');
  const answer = data?.transport?.sdp;
  if (!answer) return NextResponse.json({ error: 'Live voice returned no connection details.' }, { status: 502 });
  return NextResponse.json({ sdp: answer, sessionId: data?.session?.id ?? null, speech: { spell, myWay, house, heRead, nusach: s.nusach, reads: s.voiceReads ?? 'all', autoStart: oldOpen ? auto && !resume && !!(placeName || recap) && !pointed : autoOpen, ...(!preview && !oldOpen ? { opening, openingSpeaks: !resume && !pointOpen && !autoOpen } : {}), ...(point && !oldOpen ? { point } : {}), ...(oldOpen ? { oldOpen: true } : {}) }, ...(notice ? { notice } : {}), rulesUsed, sizes, voiceUsed: notice && /isn't available/.test(notice) ? 'meridian' : voice, ...(testLine ? { line: testLine } : {}) });
}
