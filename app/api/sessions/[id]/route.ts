import { NextRequest, NextResponse } from 'next/server';
import { currentPlace } from '@/lib/place';
import { deleteSession, getSession, listMessages, listSessionRequests, listSources, sessionCost } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession(id);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [messages, sources, usd, reqs] = await Promise.all([listMessages(id), listSources(id), sessionCost(id), listSessionRequests(id)]);
    // The same source can be saved twice (opened directly and by the AI); show it once.
    const seen = new Set<string>();
    const unique = sources.filter((s) => (seen.has(s.ref) ? false : (seen.add(s.ref), true)));
    // Where the learner was: the last tapped line or the chavrusa's last place (what "pick up where you left off" opens).
    let place: { ref: string; heRef: string; line: number } | null = null;
    try {
      const p = currentPlace(messages, sources);
      if (p) {
        const src = [...unique].reverse().find((s) => s.ref === p.base);
        place = { ref: p.base, heRef: src?.data.heRef ?? p.base, line: p.n };
      }
    } catch { /* optional */ }
    return NextResponse.json({ session, messages, sources: unique.map((s) => s.data), place, sessionUsd: usd, requests: reqs.map((r) => ({ id: r.id, content: r.content })) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await deleteSession(id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
