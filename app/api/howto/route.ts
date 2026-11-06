import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// The how-to movie's narration clips (components/HowTo.tsx). The first time a scene plays, the app has Meridian say
// its line live and records it; the recording is kept here (Supabase Storage, a private bucket), so after that the
// movie plays the saved clips: no voice call, no cost. `v` is a fingerprint of the narration's words, so changing a
// scene's words records it afresh.
const BUCKET = 'howto';
const safe = (x: string | null) => (x ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 40);

async function ensureBucket() {
  const { data } = await db().storage.getBucket(BUCKET);
  if (!data) await db().storage.createBucket(BUCKET, { public: false });
}

// GET ?v=…            → { have: [scene numbers with a saved clip] }
// GET ?v=…&i=3        → the clip itself
export async function GET(req: NextRequest) {
  const v = safe(req.nextUrl.searchParams.get('v'));
  const i = req.nextUrl.searchParams.get('i');
  if (!v) return NextResponse.json({ error: 'v required' }, { status: 400 });
  try {
    if (i === null) {
      const { data } = await db().storage.from(BUCKET).list(v);
      const have = (data ?? []).map((f) => parseInt(f.name, 10)).filter((n) => Number.isFinite(n));
      return NextResponse.json({ have, files: (data ?? []).map((f) => f.name) });
    }
    const { data: list } = await db().storage.from(BUCKET).list(v);
    const name = (list ?? []).find((f) => parseInt(f.name, 10) === Number(i))?.name;
    if (!name) return NextResponse.json({ error: 'no clip' }, { status: 404 });
    const { data, error } = await db().storage.from(BUCKET).download(`${v}/${name}`);
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'no clip' }, { status: 404 });
    return new Response(data, { headers: { 'Content-Type': data.type || (name.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm'), 'Cache-Control': 'private, max-age=31536000, immutable' } });
  } catch (e) {
    return NextResponse.json({ have: [], error: (e as Error).message });
  }
}

// POST ?v=…&i=3&ext=mp4 with the recording as the body: keep it (the first good recording of a scene wins).
export async function POST(req: NextRequest) {
  const v = safe(req.nextUrl.searchParams.get('v'));
  const i = Number(req.nextUrl.searchParams.get('i'));
  const ext = req.nextUrl.searchParams.get('ext') === 'webm' ? 'webm' : 'mp4';
  if (!v || !Number.isInteger(i) || i < 0 || i > 40) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 2000 || buf.length > 4_000_000) return NextResponse.json({ error: 'bad size' }, { status: 400 });
  try {
    await ensureBucket();
    const { data: list } = await db().storage.from(BUCKET).list(v);
    if ((list ?? []).some((f) => parseInt(f.name, 10) === i)) return NextResponse.json({ ok: true, kept: 'already' });
    const { error } = await db().storage.from(BUCKET).upload(`${v}/${i}.${ext}`, buf, { contentType: ext === 'mp4' ? 'audio/mp4' : 'audio/webm', upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
