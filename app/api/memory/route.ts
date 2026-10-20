import { NextRequest, NextResponse } from 'next/server';
import { addMemory, forgetMemory, listSavedMemories, updateMemory } from '@/lib/db';

const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: 500 });

export async function GET() {
  try { return NextResponse.json(await listSavedMemories()); } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!b.content) return NextResponse.json({ error: 'content required' }, { status: 400 });
  try { return NextResponse.json(await addMemory({ kind: b.kind ?? 'instruction', content: String(b.content), scope: b.scope ?? null })); }
  catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try { await updateMemory(String(b.id), String(b.content)); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try { await forgetMemory(id); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
