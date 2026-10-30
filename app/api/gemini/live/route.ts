import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_LIVE, GEMINI_VOICES, styleById } from '@/lib/config';
import { getSettings, listMemories, listMessages, listSources } from '@/lib/db';
import { liveContext, liveInstructions } from '@/lib/live';
import { namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';
import { currentPlace } from '@/lib/place';
import { geminiPronunciation } from '@/lib/geminiPron';
import { forGemini } from '@/lib/geminiSpeech';

export const runtime = 'nodejs';

// Gemini Live (a test, side by side with GPT-Live). The phone talks to Google directly, for speed. Here we make a
// short-lived pass for it (so the Gemini key never leaves the server) and the call's setup: the same chavrusa
// instructions, style, place and opening as GPT-Live, the chosen voice, and one tool for handing learning turns
// to the Chavrusa brain.
const HANDOFF = `
# Handing off to the backend (Gemini)
Whenever the instructions above say to "delegate" (to the backend), call the function ask_backend with the learner's words, exactly as he said them. Say a few words of filler first ("let me look inside"), then wait: the function's result is what to say next. When the result has a part between TEXT and END, that part is the text itself: read it first, the way a chavrusa reads inside, phrase by phrase (the lashon kodesh, then its English), leaving nothing out; then say the rest in your own words. Never make up the text while you wait.
Messages that begin with "[APP]" come from the app, not from the learner: do what they say.`;

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return NextResponse.json({ error: 'No Gemini key on the server yet. In Vercel, add GEMINI_API_KEY under Settings → Environment Variables, then redeploy.' }, { status: 503 });
  const s = await getSettings();
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
      });
      // The conversation so far, so a new or resumed call picks up exactly where we were.
      const plain = (t: string) => t.replace(/\[\[line:\d+\]\]/g, '').replace(/^\s*>\s?/gm, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
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
      const tapped = [...sources].reverse().find((x) => x.data?.focus);
      if (tapped && (!lastAt || tapped.created_at > lastAt)) {
        const n = tapped.data.focus as number;
        const he = tapped.data.he[n - 1] ?? '';
        const en = tapped.data.en[n - 1] ?? tapped.data.altEn?.[n - 1] ?? '';
        pointed = `The learner has chosen where to learn: ${tapped.ref}, line ${n}. Start right there. The line reads: ${yeshivishTranslit(namesForSpeech(he), false)}${en ? ` — in English: "${clip(en, 600)}"` : ''}. Say it phrase by phrase (lashon kodesh, then English), every phrase to the end of the line, then stop: ask in a few words how he wants to go on, and wait. Do not go past this line by yourself.`;
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
      ? `We were learning together just a few minutes ago. Do not greet. Speak first, very briefly, and simply continue from your last message: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again in a few words; otherwise ask in a few words if he's ready to go on. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then listen.${recapBlock}`
      : `Speak first, briefly and naturally. Use a short, casual opener only if it fits (we last learned ${mins !== null && mins < 24 * 60 ? 'earlier today' : 'on an earlier day'}); no formal greeting. In one sentence say where we were${placeName ? ` (${placeName})` : ''}. Your last message was: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again briefly; otherwise ask if he's ready to go on. Do not read, recite or summarize the text yourself, and do not go on to the next line yourself: when he says to go on, delegate. Then stop and listen.${recapBlock}`;
  const resumeNote = pointed ? `The call is resuming after a short pause. Do not greet. ${pointed}${recapBlock}` : `The call is resuming after a short pause, in the middle of learning. Do not greet and do not recap. Continue exactly where you left off. Your last message was: "${lastSaid}". If the learner hasn't answered it yet, wait for him; when he speaks, carry on from there.${recapBlock}`;

  const { pron, myWayNote } = geminiPronunciation(s);
  const spell = s.geminiSpell ?? 'stressed';
  const myWay = s.geminiMyWay ?? [];
  const instructions = forGemini(liveInstructions(s.nusach, s.livePace, false, pron) + context + HANDOFF, spell, myWay) + myWayNote;

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
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
    },
    opening: resume ? resumeNote : hello, // the phone applies Gemini's spelling and list to it
    speech: { spell, myWay },
  });
}
