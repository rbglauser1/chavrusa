import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SETTINGS, Settings } from '@/lib/config';
import { getSettings, saveSettings } from '@/lib/db';

export async function GET() {
  try { return NextResponse.json(await getSettings()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Only accept known setting keys.
  const patch: Partial<Settings> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (k in body) (patch as Record<string, unknown>)[k] = body[k];
  }
  try { return NextResponse.json(await saveSettings(patch)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
