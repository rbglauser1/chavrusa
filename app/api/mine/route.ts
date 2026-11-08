import { NextRequest, NextResponse } from 'next/server';
import { listMine, removeMine, saveMine } from '@/lib/mine';

export const runtime = 'nodejs';

// My Seforim (lib/mine.ts): list his texts, add one (already turned into plain text by the page), or remove one.
export async function GET() {
  try { return NextResponse.json({ items: await listMine() }); }
  catch (e) { return NextResponse.json({ items: [], error: (e as Error).message }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const text = String(b.text ?? '');
  if (!text.trim()) return NextResponse.json({ error: 'There was no text to keep.' }, { status: 400 });
  if (text.length > 3_000_000) return NextResponse.json({ error: 'That is too long to keep in one piece. Try a smaller file.' }, { status: 400 });
  try {
    const item = await saveMine({ title: String(b.title ?? ''), kind: String(b.kind ?? 'text'), source: String(b.source ?? ''), text });
    return NextResponse.json({ item });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  try { await removeMine(id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
