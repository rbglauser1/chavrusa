import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getSession, listMessages, listSources, sessionCost } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession(id);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [messages, sources, usd] = await Promise.all([listMessages(id), listSources(id), sessionCost(id)]);
    return NextResponse.json({ session, messages, sources: sources.map((s) => s.data), sessionUsd: usd });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await deleteSession(id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
