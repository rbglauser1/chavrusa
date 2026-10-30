import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { GEMINI_LIVE, GEMINI_VOICES } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

// A short sample of Gemini Live's voice (Settings → Voice → Gemini Live, test). Opens one Live session on the server,
// asks it to say a test line, collects the audio and returns it as a WAV file. Kept, so each voice is paid for once.
const LINE = "Shalom! I'm your chavrusa. Let's open the Gemara together: Rabbi Yehudah says, a person must learn Torah every day. Now tell me, what's bothering Rashi here? Shabbos, Tosafos, Moishe Rabbeinu.";
const SYSTEM = `You are a warm, sharp, male yeshivish chavrusa, an American who learns in a Lakewood-style yeshiva. Speak natural American English with a light yeshivish flavor. Pronounce Hebrew and Aramaic in Ashkenazi yeshivish style: kamatz as "aw", cholam as "oi" (Toirah, Moishe), tav without a dagesh as "s" (Shabbos, Tosafos), stress on the second-to-last syllable. When you are given a line to say, say exactly that line aloud, once, naturally, and then stop.`;

function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(voice: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error('NO_KEY');
  const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) throw new Error('This server has no WebSocket support.');
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;
  return new Promise<string>((resolve, reject) => {
    const ws = new WS(url);
    ws.binaryType = 'arraybuffer'; // Gemini sends its JSON messages as binary frames
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else if (!chunks.length) reject(new Error('Gemini sent no audio.'));
      else resolve(wav(Buffer.concat(chunks)).toString('base64'));
    };
    const timer = setTimeout(() => finish(chunks.length ? undefined : new Error('Gemini took too long to answer.')), 40000);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${GEMINI_LIVE.model}`,
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
          systemInstruction: { parts: [{ text: SYSTEM }] },
        },
      }));
    };
    ws.onmessage = async (ev: MessageEvent) => {
      try {
        const d = ev.data as unknown;
        const raw = typeof d === 'string' ? d
          : d instanceof ArrayBuffer ? Buffer.from(new Uint8Array(d)).toString('utf8')
          : typeof (d as Blob)?.arrayBuffer === 'function' ? Buffer.from(new Uint8Array(await (d as Blob).arrayBuffer())).toString('utf8')
          : String(d);
        const m = JSON.parse(raw);
        if (m.error) { finish(new Error(m.error.message ?? 'Gemini error')); return; }
        if (m.setupComplete) {
          ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `Say this line aloud now, exactly as written, then stop:\n"${LINE}"` }] }], turnComplete: true } }));
          return;
        }
        const parts = m.serverContent?.modelTurn?.parts ?? [];
        for (const p of parts) if (p.inlineData?.data && String(p.inlineData.mimeType ?? '').startsWith('audio')) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
        if (m.serverContent?.turnComplete && chunks.length) finish();
      } catch (e) { finish(e as Error); }
    };
    ws.onerror = () => finish(new Error('Could not connect to Gemini Live.'));
    ws.onclose = (ev: CloseEvent) => { if (!done) finish(chunks.length ? undefined : new Error(`Gemini closed the connection${ev.reason ? `: ${ev.reason}` : ''}.`)); };
  });
}

export async function GET(req: NextRequest) {
  const voice = String(req.nextUrl.searchParams.get('voice') ?? '');
  if (!GEMINI_VOICES.some((v) => v.id === voice)) return NextResponse.json({ error: 'Unknown voice.' }, { status: 400 });
  try {
    const b64 = await unstable_cache(() => speak(voice), ['gemini-sample-v1', GEMINI_LIVE.model, voice], { revalidate: 60 * 60 * 24 * 30 })();
    return new NextResponse(new Uint8Array(Buffer.from(b64, 'base64')), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'NO_KEY') return NextResponse.json({ error: 'No Gemini key on the server yet. In Vercel, add GEMINI_API_KEY under Settings → Environment Variables, then redeploy.' }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
