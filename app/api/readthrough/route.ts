import { NextRequest, NextResponse } from 'next/server';
import { addMessage, approvedList, getSession, touchSession } from '@/lib/db';
import { getText } from '@/lib/sefaria';

// Keep the vowels (nikud) but drop the trop marks, which only confuse the voice.
const noTrop = (s: string) => s.replace(/[\u0591-\u05AF\u05BD\u05C0]/g, '').replace(/\s+/g, ' ').trim();

export const runtime = 'nodejs';

// Read-through (say over the pesukim, or shnayim mikra v'echad targum): serves the next few lines in order,
// straight from Sefaria. No AI is used. Each piece is saved so the session keeps the learner's place.
export type ReadMode = 'he-en' | 'shnayim' | 'he';

type Line = { n: number; he: string; en: string; tg: string };

async function section(ref: string) {
  const s = await getText(ref, await approvedList());
  return s.verdict.allowed ? s : null;
}

// "Genesis 1" -> "Genesis 2"; "Berakhot 2a" -> "Berakhot 2b" -> "Berakhot 3a"
function nextSection(base: string): string | null {
  const t = base.match(/^(.*?) (\d+)([ab])$/);
  if (t) return t[3] === 'a' ? `${t[1]} ${t[2]}b` : `${t[1]} ${Number(t[2]) + 1}a`;
  const c = base.match(/^(.*?) (\d+)$/);
  return c ? `${c[1]} ${Number(c[2]) + 1}` : null;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  let base = String(p.get('base') ?? '');
  let from = Math.max(1, Number(p.get('from') ?? 1) || 1);
  const mode = (['he-en', 'shnayim', 'he'].includes(String(p.get('mode'))) ? p.get('mode') : 'he-en') as ReadMode;
  const count = Math.min(6, Math.max(1, Number(p.get('count') ?? (mode === 'shnayim' ? 1 : 2)) || 2));
  const sid = p.get('session');
  if (!base) return NextResponse.json({ error: 'Nothing to read yet. Open a place first.' }, { status: 400 });

  try {
    let sec = await section(base);
    if (sec && from > sec.he.length) {
      // Past the end of this perek/amud: move on to the next one.
      const nb = nextSection(base);
      const next = nb ? await section(nb).catch(() => null) : null;
      if (!next || !next.he.length) return NextResponse.json({ done: true });
      base = nb as string; from = 1; sec = next;
    }
    if (!sec || !sec.he.length) return NextResponse.json({ done: true });
    const tg = mode === 'shnayim' ? await section(`Onkelos ${base}`).catch(() => null) : null;
    const end = Math.min(sec.he.length, from + count - 1);
    const lines: Line[] = [];
    for (let n = from; n <= end; n++) lines.push({ n, he: noTrop(sec.he[n - 1] ?? ''), en: sec.en[n - 1] ?? '', tg: noTrop(tg?.he[n - 1] ?? '') });

    const ref = `${base}:${from}${end > from ? `-${end}` : ''}`;
    const text = lines.map((l) => mode === 'shnayim'
      ? `> ${l.he}\n> ${l.he}${l.tg ? `\n> ${l.tg}` : ''}`
      : mode === 'he' ? `> ${l.he}` : `> ${l.he}${l.en ? `\n> "${l.en}"` : ''}`).join('\n\n');
    if (sid && (await getSession(sid))) {
      await addMessage(sid, 'assistant', `**${ref}**\n\n${text}`, { usage: { ai: false, reason: 'Read-through, straight from Sefaria' }, pos: { base, n: end }, readThrough: true });
      await touchSession(sid);
    }
    return NextResponse.json({ ref, base, lines, next: end + 1, text, targum: mode === 'shnayim' ? !!tg : undefined });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
