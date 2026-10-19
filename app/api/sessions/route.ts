import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/db';

export async function GET() {
  try { return NextResponse.json(await listSessions()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
