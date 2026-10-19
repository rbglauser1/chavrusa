import { NextResponse } from 'next/server';
import { costSummary } from '@/lib/db';

export async function GET() {
  try { return NextResponse.json(await costSummary()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
