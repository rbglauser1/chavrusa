import { NextRequest, NextResponse } from 'next/server';
import { listMessages, markRead, removeContact } from '@/lib/contact';

export const runtime = 'nodejs';

// The owner's inbox (Settings → Messages; signed in only): GET the messages, POST {id} marks one read, DELETE ?id=.
export async function GET() {
  try { return NextResponse.json({ messages: await listMessages() }); }
  catch (e) { return NextResponse.json({ messages: [], error: (e as Error).message }); }
}
export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  try { if (id) await markRead(String(id)); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
export async function DELETE(req: NextRequest) {
  try { await removeContact(req.nextUrl.searchParams.get('id') ?? ''); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
