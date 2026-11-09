import { NextResponse } from 'next/server';
import { nextUnlearned, progress } from '@/lib/progress';
import { todaysLearning } from '@/lib/sefaria';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Progress and plans (Settings → Extras): the books learned in, today's daf yomi.
export async function GET() {
  try {
    const [books, today] = await Promise.all([progress(), todaysLearning().catch(() => [])]);
    const daf = today.find((x) => /daf yomi/i.test(x.title));
    return NextResponse.json({ books: books.map((b) => ({ ...b, next: nextUnlearned(b) })), dafYomi: daf ? { ref: daf.ref, display: daf.display } : null });
  } catch (e) {
    return NextResponse.json({ books: [], dafYomi: null, error: (e as Error).message });
  }
}
