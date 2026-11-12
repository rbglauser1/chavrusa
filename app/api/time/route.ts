import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/store';

export const runtime = 'nodejs';

// Learning time (Home): minutes learned per day, by the learner's own calendar day. The app adds a minute for each
// minute a page is open and in use, or a call is on (app/page.tsx). Kept a year.
const FILE = 'time.json';
type Days = Record<string, number>;
const okDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function GET() {
  try { return NextResponse.json({ days: (await readJson<Days>(FILE)) ?? {} }); }
  catch { return NextResponse.json({ days: {} }); }
}

// POST { day: "2026-11-11", add: 1 }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const day = String(b.day ?? ''), add = Math.round(Number(b.add) || 0);
  if (!okDay(day) || add < 1 || add > 10) return NextResponse.json({ error: 'Nothing to add.' }, { status: 400 });
  try {
    const days = (await readJson<Days>(FILE)) ?? {};
    days[day] = Math.min(24 * 60, (days[day] ?? 0) + add);
    const keep = Object.keys(days).sort().slice(-370);
    await writeJson(FILE, Object.fromEntries(keep.map((k) => [k, days[k]])));
    return NextResponse.json({ ok: true, today: days[day] });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
