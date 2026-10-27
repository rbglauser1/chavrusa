import { NextRequest, NextResponse } from 'next/server';
import { LIVE, LIVE_VOICES, VOICE_SAMPLE } from '@/lib/config';
import { getSettings } from '@/lib/db';
import { liveContext, liveInstructions } from '@/lib/live';
import { namesForSpeech, yeshivishTranslit } from '@/lib/hebrew';
import { listMemories, listMessages, listSources } from '@/lib/db';
import { currentPlace } from '@/lib/place';
import { styleById } from '@/lib/config';

export const runtime = 'nodejs';

// The browser sends its WebRTC offer here; we start a GPT-Live session with our key and return the answer.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
  const sdp = await req.text();
  if (!sdp.startsWith('v=')) return NextResponse.json({ error: 'Missing WebRTC offer.' }, { status: 400 });
  const s = await getSettings();
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
  if (!preview) {
    try {
      const sid = req.nextUrl.searchParams.get('session');
      const [memories, history, sources] = await Promise.all([
        listMemories(), sid ? listMessages(sid, 30) : Promise.resolve([]), sid ? listSources(sid) : Promise.resolve([]),
      ]);
      const st = styleById(s.style);
      const place = sid ? currentPlace(history, sources) : null;
      context = liveContext({
        styleName: st.name,
        styleRules: st.behavior,
        leads: st.asks === false ? 'you explain' : s.leads === 'learner' ? 'the learner explains first' : 'you explain first, then ask',
        place: place ? `${place.base}, line ${place.n}` : null,
        requests: memories.filter((m) => m.scope === `session:${sid}`).map((m) => m.content),
        saved: memories.filter((m) => m.kind === 'instruction' && !m.scope?.startsWith('session:')).map((m) => m.content),
      });
      // The conversation so far, so a new or resumed call picks up exactly where we were.
      const plain = (t: string) => t.replace(/\[\[line:\d+\]\]/g, '').replace(/^\s*>\s?/gm, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
      const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);
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
        pointed = `The learner has chosen where to learn: ${tapped.ref}, line ${n}. Start right there. The line reads: ${yeshivishTranslit(namesForSpeech(he), false)}${en ? ` — in English: "${clip(en, 600)}"` : ''}. Say it phrase by phrase (lashon kodesh, then English), then continue in the learning style.`;
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
      ? `We were learning together just a few minutes ago. Do not greet. Speak first, very briefly, and simply continue from your last message: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again in a few words; otherwise just pick up the next step (for example "So, let's continue…"). Then listen.${recapBlock}`
      : `Speak first, briefly and naturally. Use a short, casual opener only if it fits (we last learned ${mins !== null && mins < 24 * 60 ? 'earlier today' : 'on an earlier day'}); no formal greeting. In one sentence say where we were${placeName ? ` (${placeName})` : ''}, then continue from your last message: "${lastSaid}". If it ended with a question the learner hasn't answered, ask it again briefly. Then stop and listen.${recapBlock}`;
  const resumeNote = pointed ? `The call is resuming after a short pause. Do not greet. ${pointed}${recapBlock}` : `The call is resuming after a short pause, in the middle of learning. Do not greet and do not recap. Continue exactly where you left off. Your last message was: "${lastSaid}". If the learner hasn't answered it yet, wait for him; when he speaks, carry on from there.${recapBlock}`;
  const greeting = `Say exactly this now, in your natural voice, then stop and wait: "${VOICE_SAMPLE}"`;

  const res = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        model: LIVE.model,
        instructions: (preview
          ? 'This is a short voice sample. Speak first, as soon as the session starts, without waiting for the user.'
          : liveInstructions(s.nusach, s.livePace, false) + context) + voiceNote,
        input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: preview ? greeting : resume ? resumeNote : hello }] }],
        audio: { output: { voice: voiceField } },
        delegation: { type: 'client' },
      },
      transport: { type: 'webrtc', sdp },
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: `Live voice could not start (${res.status}): ${data?.error?.message ?? 'unknown error'}` }, { status: 502 });
  }
  const answer = data?.transport?.sdp;
  if (!answer) return NextResponse.json({ error: 'Live voice returned no connection details.' }, { status: 502 });
  return NextResponse.json({ sdp: answer, sessionId: data?.session?.id ?? null });
}
