import { NextRequest, NextResponse } from 'next/server';
import { outOfCredit } from '@/lib/credits';
import { GEMINI_LIVE, GEMINI_VOICES, styleById, styleCard, forNusach } from '@/lib/config';
import { getSettings, listMemories, listMessages, listSources } from '@/lib/db';
import { GEMINI_VOICE, liveContext, liveInstructions } from '@/lib/live';
import { mildCholam, namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';
import { currentPlace } from '@/lib/place';
import { geminiPronunciation, sayNote } from '@/lib/geminiPron';
import { forVoice } from '@/lib/geminiSpeech';
import { englishFor } from '@/lib/literal';
import { voicePhrases } from '@/lib/interlinear';

export const runtime = 'nodejs';

// Gemini Live (a test, side by side with GPT-Live). The phone talks to Google directly, for speed. Here we make a
// short-lived pass for it (so the Gemini key never leaves the server) and the call's setup: the same chavrusa
// instructions, style, place and opening as GPT-Live, the chosen voice, and one tool for handing learning turns
// to the Chavrusa brain.
const HANDOFF = `
# Handing off to the backend (Gemini)
Whenever the instructions above say to "delegate" (to the backend), call the function ask_backend with the learner's words, exactly as he said them. Say a few words of filler first ("let me look inside"), then wait: the function's result is what to say next. When the result has a part between TEXT and END, that part is the text itself: read it first, the way a chavrusa reads inside, phrase by phrase: the lashon kodesh out loud, every word, exactly as it is spelled in English letters, and then its English, leaving nothing out. Never skip the lashon kodesh and never give only the English; then say the rest in your own words. Never make up the text while you wait.
Messages that begin with "[APP]" come from the app, not from the learner: do what they say.`;

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return NextResponse.json({ error: 'No Gemini key on the server yet. In Vercel, add GEMINI_API_KEY under Settings → Environment Variables, then redeploy.' }, { status: 503 });
  { const out = await outOfCredit(); if (out) return NextResponse.json({ error: out }, { status: 402 }); } // credits (lib/credits.ts)
  const s = forNusach(await getSettings()); // Sephardi: no yeshivish respellings (lib/config)
  const voice = GEMINI_VOICES.some((v) => v.id === s.geminiVoice) ? s.geminiVoice! : GEMINI_VOICES[0].id;
  const preview = false;
  let context = '';
  let recap = '';
  let lastSaid = '';
  let lastAt: string | null = null;
  let pointed = ''; // the line the learner tapped in the Sefer since we last spoke: start there
  if (!preview) {
    try {
      const sid = req.nextUrl.searchParams.get('session');
      const [memories, history, sources] = await Promise.all([
        listMemories(), sid ? listMessages(sid, 30) : Promise.resolve([]), sid ? listSources(sid) : Promise.resolve([]),
      ]);
      const st = styleById(s.style, s.customStyles);
      const place = sid ? currentPlace(history, sources) : null;
      context = liveContext({
        styleName: st.name,
        styleRules: st.behavior,
        leads: st.asks === false ? 'you explain' : s.leads === 'learner' ? 'the learner explains first' : 'you explain first, then ask',
        place: place ? `${place.base}, line ${place.n}` : null,
        requests: memories.filter((m) => m.scope === `session:${sid}`).map((m) => m.content),
        saved: memories.filter((m) => m.kind === 'instruction' && !m.scope?.startsWith('session:')).map((m) => m.content),
        noticed: memories.filter((m) => m.kind === 'observation').map((m) => m.content),
        card: styleCard(s.style, s.customStyles) + (s.blend ? ` Also: ${styleCard(s.blend, s.customStyles).replace(/^.*?this style's part\. /, '')}` : ''),
      });
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
      const recent = history.slice(-12);
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
      if (tapped && realTap(tapped) && (!lastAt || tapped.created_at > lastAt)) {
        const n = tapped.data.focus as number;
        const he = tapped.data.he[n - 1] ?? '';
        const en = englishFor(tapped.data.en[n - 1] ?? tapped.data.altEn?.[n - 1] ?? '', tapped.data.enB?.[n - 1], s.translate, false, he);
        // Phrase by phrase, the lashon kodesh spelled out first (log of Nov 6, 12:29 AM: given the whole line and then
        // a long English, Gemini read only the English, and Sefaria's full English though "just the literal" was chosen).
        // Sephardi: the Hebrew letters themselves (Gemini reads them with Israeli Sephardi pronunciation); Ashkenaz: spelled out the yeshivish way.
        const phrases = voicePhrases(he).map((x) => (s.nusach === 'sephardi' ? namesForSpeech(x) : mildCholam(yeshivishTranslit(namesForSpeech(x), false), yeshivishTranslit(namesForSpeech(x), true))));
        pointed = `The learner has chosen where to learn: ${tapped.ref}, line ${n}. Start right there. Read it inside, the way a chavrusa does: FIRST the lashon kodesh, every word, out loud, exactly as spelled here, phrase by phrase: ⟪${phrases.join(' … ')}⟫ THEN its English: "${clip(en, 600)}". Never skip the lashon kodesh and never give only the English. Then stop, and wait for him. Do not go past this line by yourself.`;
      }
    } catch { /* the call still works without it */ }
  }
  const resume = req.nextUrl.searchParams.get('resume') === '1';
  const placeName = context.match(/The learner is on (.*?), line \d+/)?.[1] ?? null;
  const recapBlock = recap ? `\n\n# The conversation so far in this session (most recent last)\n${recap}` : '';
  // How the call opens depends on the circumstances, like a real chavrusa: no formal hello if we were just learning.
  const mins = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : null;
  const hello = pointed
    ? `Speak first, briefly. ${mins !== null && mins < 20 ? 'We were just learning; do not greet.' : 'At most a short natural opener; no formal greeting.'} ${pointed} Then listen.${recapBlock}`
    : !recap
    ? `Speak first, briefly and naturally, the way a chavrusa would when sitting down to learn: a short, warm, natural opener (not a formula, and different each time), ${placeName ? `then mention that last time we were on ${placeName} and ask if he wants to pick up there` : 'then ask what we are learning today'}. Then stop and listen.`
    : mins !== null && mins < 20
      ? `We were learning together just a few minutes ago. Do not greet. Speak first, very briefly, and simply continue from your last message: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again in a few words; otherwise ${s.autoGo ? 'say in a few words that we will go on (do not ask; the app brings the next piece)' : 'ask in a few words if he\'s ready to go on'}. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then listen.${recapBlock}`
      : `Speak first, briefly and naturally. Use a short, casual opener only if it fits (we last learned ${mins !== null && mins < 24 * 60 ? 'earlier today' : 'on an earlier day'}); no formal greeting. In one sentence say where we were${placeName ? ` (${placeName})` : ''}. Your last message was: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again briefly; otherwise ${s.autoGo ? 'say in a few words that we will go on (do not ask; the app brings the next piece)' : 'ask if he\'s ready to go on'}. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then stop and listen.${recapBlock}`;
  const resumeNote = pointed ? `The call is resuming after a short pause. Do not greet. ${pointed}${recapBlock}` : `The call is resuming after a short pause, in the middle of learning. Do not greet and do not recap. Continue exactly where you left off. Your last message was: "${lastSaid}". If the learner hasn't answered it yet, wait for him; when he speaks, carry on from there.${recapBlock}`;

  const { pron, myWayNote } = geminiPronunciation(s);
  const spell = s.geminiSpell ?? 'stressed';
  const myWay = s.geminiMyWay ?? [];
  const house = s.houseSay !== false, steady = s.liveSteady === true;
  void myWayNote;
  // The yeshivish speaker first, and the yeshivish accent note (not "a normal American accent"), for Ashkenaz.
  const ashk = s.nusach !== 'sephardi';
  // Pauses and stopping (Nov 8, the learner: it runs the phrases together, and stops in the wrong places). The pauses
  // setting now reaches Gemini too, and it gets a plain rule for both.
  const pauses = s.livePauses ?? 'normal';
  const beat = pauses === 'few' ? 'a brief beat' : pauses === 'more' ? 'a full pause of about a second' : pauses === 'most' ? 'a long pause of a second or two' : 'a clear short pause, about half a second';
  const reading = `\n\nREADING INSIDE, AND WHEN TO STOP: the text comes in phrases separated by "…". Say one phrase, then its English when its English is given with it, then take ${beat} before the next phrase. Never run two phrases together, and never pause in the middle of a phrase. When the English of the whole piece comes after the phrases, read it as one sentence after the last phrase. Then give what comes after the reading, if anything, and stop completely: stay silent until the learner speaks or the app brings the next piece. Never stop in the middle of a phrase or a sentence, and never go past the piece you were given.`;
  const instructions = forVoice((ashk ? GEMINI_VOICE : '') + liveInstructions(s.nusach, s.livePace, ashk, pron, steady, 'join-kh', s.voiceReads ?? 'all', pauses) + context + HANDOFF + reading, spell, myWay, house) + sayNote(myWay, house);

  // The short-lived pass: one use, a minute to start the call, half an hour of call.
  const now = Date.now();
  const tok = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uses: 1, expireTime: new Date(now + 30 * 60_000).toISOString(), newSessionExpireTime: new Date(now + 60_000).toISOString() }),
  });
  const t: any = await tok.json().catch(() => ({}));
  if (!tok.ok || !t?.name) return NextResponse.json({ error: `Gemini could not start (${tok.status}): ${t?.error?.message ?? 'no pass was issued'}` }, { status: 502 });

  return NextResponse.json({
    token: t.name,
    url: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(t.name)}`,
    setup: {
      model: `models/${GEMINI_LIVE.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        thinkingConfig: { thinkingLevel: 'low' },
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      systemInstruction: { parts: [{ text: instructions }] },
      tools: [{
        functionDeclarations: [{
          name: 'ask_backend',
          description: 'The chavrusa backend: reads the real text of any sefer (and the next line or piece), keeps the place, explains with sources, opens commentaries and saves the learner\'s requests. Pass the learner\'s words.',
          parameters: { type: 'OBJECT', properties: { request: { type: 'STRING', description: "The learner's words, exactly as he said them" } }, required: ['request'] },
          behavior: 'NON_BLOCKING',
        }],
      }],
      // Less ready to take a sound for the learner starting to speak (with the app's echo guard).
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', prefixPaddingMs: 120, silenceDurationMs: 700 } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
    },
    opening: resume ? resumeNote : hello, // the phone applies Gemini's spelling and list to it
    speech: { spell, myWay, house, nusach: s.nusach },
  });
}
