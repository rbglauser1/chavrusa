import { NextRequest, NextResponse } from 'next/server';
import { getSettings, logCost } from '@/lib/db';
import { costUsd, MODELS } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

// My Seforim: one page (a photo, or a page of a scanned or Hebrew PDF) read into text by Claude. About a cent or two
// a page, once, when it's added. Logged as cost kind "upload".
const PROMPT = `Transcribe all the text on this page exactly, in reading order. Keep Hebrew and Aramaic exactly as printed, with nikud if it has nikud, and keep Rashi script as ordinary Hebrew letters. If the page has several blocks (for example a Gemara page with Rashi and Tosafos, or a sefer with a commentary), transcribe the main text first, then each other block, each starting on its own line with its name in square brackets, like [Rashi]. Put a blank line between paragraphs. Leave out page numbers, running headers and footers. Output only the text, nothing else. If there is no text, output nothing.`;

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const m = String(b.image ?? '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) return NextResponse.json({ error: 'No page image.' }, { status: 400 });
  if (m[2].length > 7_000_000) return NextResponse.json({ error: 'That page image is too large.' }, { status: 400 });
  const s = await getSettings().catch(() => null);
  const model = MODELS.anthropic.middle;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model.id, max_tokens: 8000,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: PROMPT }] }],
      }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: `Claude error ${res.status}: ${d?.error?.message ?? 'request failed'}` }, { status: 502 });
    const text = (Array.isArray(d.content) ? d.content : []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
    const inT = d.usage?.input_tokens ?? 0, outT = d.usage?.output_tokens ?? 0;
    logCost({ kind: 'upload', provider: 'anthropic', model: model.id, inputTokens: inT, outputTokens: outT, costUsd: costUsd(model, inT, outT) }).catch(() => {});
    void s;
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
