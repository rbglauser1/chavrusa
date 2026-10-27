import { NextRequest, NextResponse } from 'next/server';
import { addSource, approvedList, createSession, getSession } from '@/lib/db';
import { forPanel } from '@/lib/place';
import { findRef } from '@/lib/prefetch';
import { bookTitleFromRef, getText } from '@/lib/sefaria';

export const runtime = 'nodejs';

// Opens a source straight from Sefaria, with no AI involved (and no AI cost).
// q = a reference ("Berachos 36a") or a whole message that mentions one.
export async function POST(req: NextRequest) {
  const { q, sessionId, direct, exact } = await req.json().catch(() => ({}));
  const text = String(q ?? '').trim();
  if (!text) return NextResponse.json({ source: null });
  try {
    const ref = exact ? text : await findRef(text, !!direct);
    if (!ref) return NextResponse.json({ source: null, message: direct ? `Couldn't find "${text}". Try a form like "Berachos 36a" or "Rashi on Genesis 1:1".` : undefined });
    const s = await getText(ref, await approvedList());
    if (!s.verdict.allowed) {
      // Not blocked, just not confirmed as classic (or newer): the learner can approve it with one tap.
      const approvable = /blocked list/.test(s.verdict.reason) ? undefined : bookTitleFromRef(ref).replace(/,.*$/, '');
      return NextResponse.json({ source: null, message: `${s.verdict.reason}`, approvable });
    }
    if (!s.he.length && !s.en.length) return NextResponse.json({ source: null, message: `No text found for ${ref}.` });
    const { verdict, ...opened } = s;
    // Show a single line as its whole perek/amud, and mark where the learner is, so the Chavrusa knows the place.
    const shown = await forPanel(opened, await approvedList()).catch(() => opened);
    const source = !shown.focus && !/ on /i.test(shown.ref) ? { ...shown, focus: 1 } : shown;
    // Opening a place starts a session if there isn't one yet, so the Chavrusa has it when you start talking.
    let sid: string | null = sessionId && (await getSession(String(sessionId))) ? String(sessionId) : null;
    let session = null;
    // (Only when opened directly, from the Library or Go to; a typed message gets its session from the chat.)
    if (!sid && direct) { session = await createSession(source.ref); sid = session.id; }
    if (sid) await addSource(sid, source).catch(() => {});
    return NextResponse.json({ source, session });
  } catch (e) {
    return NextResponse.json({ source: null, message: `Sefaria didn't answer: ${(e as Error).message}` });
  }
}
