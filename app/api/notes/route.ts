import { NextRequest, NextResponse } from 'next/server';
import { addNote, allNotes, notesFor, removeNote, updateNote } from '@/lib/notes';

export const runtime = 'nodejs';

// Notes: GET ?ref=… (one text's notes) or ?q=… (search all), POST {ref, n, text, on?, quote?} (no ref: a page of its
// own in the Notebook) or {id, text}, DELETE ?id=.
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  try {
    const list = ref ? await notesFor(ref) : await allNotes();
    const hits = q ? list.filter((x) => (x.text + ' ' + x.ref + ' ' + (x.on ?? '') + ' ' + (x.quote ?? '')).toLowerCase().includes(q)) : list;
    return NextResponse.json({ notes: hits.sort((a, b) => b.created.localeCompare(a.created)) });
  } catch (e) { return NextResponse.json({ notes: [], error: (e as Error).message }); }
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.id) { await updateNote(String(b.id), String(b.text ?? '')); return NextResponse.json({ ok: true }); }
    if (!String(b.text ?? '').trim()) return NextResponse.json({ error: 'A note needs some words.' }, { status: 400 });
    // On a line (ref + n), or a page of its own in the Notebook (no ref).
    const ref = String(b.ref ?? ''), n = ref ? Number(b.n) || 1 : 0;
    return NextResponse.json({ note: await addNote(ref, n, String(b.text), b.on ? String(b.on) : undefined, b.quote ? String(b.quote) : undefined) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
export async function DELETE(req: NextRequest) {
  try { await removeNote(req.nextUrl.searchParams.get('id') ?? ''); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
