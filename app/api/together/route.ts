import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { newCode, writeRoom } from '@/lib/room';

export const runtime = 'nodejs';

// Nov 25: Learn with a friend: the learner (logged in) opens a room on the text he is learning; the link brings a friend in.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const ref = String(b.ref ?? '').replace(/:\d+(-\d+)?$/, '').trim();
    if (!ref) return NextResponse.json({ error: 'Open a text first.' }, { status: 400 });
    const s = await getText(ref, await approvedList());
    if (!s.he.length) return NextResponse.json({ error: 'This text could not be read.' }, { status: 400 });
    const code = newCode();
    const clean = (t: string) => t.replace(/<[^>]+>/g, '').slice(0, 3000);
    await writeRoom({ code, ref: s.ref || ref, title: String(b.title ?? '') || s.ref || ref, he: s.he.map(clean), en: s.en.map(clean), line: Math.max(1, Number(b.line) || 1), lineBy: '', msgs: [], created: Date.now(), ai: 0 });
    return NextResponse.json({ code });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
