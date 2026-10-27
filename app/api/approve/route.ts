import { NextRequest, NextResponse } from 'next/server';
import { approveTranslation, approveWork } from '@/lib/db';

export const runtime = 'nodejs';

// The learner approves a Sefaria translation (e.g. Rabbi Aryeh Kaplan's Sichos HaRan) from the Sefer.
export async function POST(req: NextRequest) {
  const { translation, work } = await req.json().catch(() => ({}));
  const name = String(translation ?? work ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Missing name.' }, { status: 400 });
  try { if (work) await approveWork(name); else await approveTranslation(name); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
