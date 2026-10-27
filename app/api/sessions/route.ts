import { NextResponse } from 'next/server';
import { deleteAllSessions, listSessions } from '@/lib/db';

export async function GET() {
  try { return NextResponse.json(await listSessions()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE() {
  try { await deleteAllSessions(); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
