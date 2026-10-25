import 'server-only';
// "Text in hand": the app keeps track of which line the learner is on, and hands the AI just the few lines
// around that spot with every question, so it never has to go and look the text up.

import { ApprovedEntry } from './approval';
import { MessageRow, SourceData, SourceRow } from './db';
import { stripNikud } from './hebrew';
import { getText } from './sefaria';

export interface Place { base: string; n: number }  // base: "Berakhot 36b" / "Genesis 1"; n: line (segment) number

// "Berakhot 36b:3" -> Berakhot 36b, line 3. "Genesis 1:1-5" -> Genesis 1, line 1. "Berakhot 36b" -> line 1.
export function splitRef(ref: string): Place {
  const m = ref.match(/^(.*?):(\d+)(?:-\d+)?$/);
  return m ? { base: m[1], n: Number(m[2]) } : { base: ref, n: 1 };
}

const isMain = (ref: string) => !/ on /i.test(ref) && !/^(onkelos|targum)/i.test(ref);

// Where is the learner now? The newest place the app recorded (a line it showed, or the line the AI said it
// finished on), unless the AI looked up a later line of the main text since then.
export function currentPlace(history: MessageRow[], sources: SourceRow[]): Place | null {
  const msg = [...history].reverse().find((m) => m.role === 'assistant' && (m.meta?.pos || (m.meta as { line?: unknown } | null)?.line || m.meta?.opened));
  let place: Place | null = null;
  let since = '';
  if (msg) {
    const meta = msg.meta as { pos?: Place; line?: { ref: string }; opened?: string };
    place = meta.pos ?? (meta.line ? splitRef(meta.line.ref) : meta.opened ? splitRef(meta.opened) : null);
    since = msg.created_at;
  }
  // A line the AI (or app) opened since then: either a line ref, or a whole perek/amud shown at a line (focus).
  const at = (x: SourceRow): Place => (x.data?.focus ? { base: x.ref, n: x.data.focus } : splitRef(x.ref));
  const later = sources.filter((x) => isMain(x.ref) && (/:\d+$/.test(x.ref) || !!x.data?.focus) && x.created_at > since);
  if (later.length) {
    const base = at(later[later.length - 1]).base;
    const n = Math.max(...later.map(at).filter((p) => p.base === base).map((p) => p.n));
    return { base, n };
  }
  if (place) return place;
  const main = [...sources].reverse().find((x) => isMain(x.ref));
  return main ? splitRef(main.ref) : null;
}

// The whole section (amud / perek) the place is in: from this session's sources if we have it, otherwise Sefaria (cached).
async function section(base: string, sources: SourceRow[], approved: ApprovedEntry[]): Promise<SourceData | null> {
  const have = sources.find((x) => x.ref === base)?.data;
  if (have) return have;
  try {
    const s = await getText(base, approved);
    if (!s.verdict.allowed || (!s.he.length && !s.en.length)) return null;
    const src: SourceData & { verdict?: unknown } = { ...s };
    delete src.verdict;
    return src;
  } catch { return null; }
}

const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' …' : t);

// For the Sefer panel: a single line of a main text is shown as its whole perek / amud, scrolled to that line,
// so the learner can see what comes before and after. (Commentaries are shown as they are.)
export async function forPanel(src: SourceData, approved: ApprovedEntry[]): Promise<SourceData> {
  if (!isMain(src.ref) || !/:\d+(-\d+)?$/.test(src.ref)) return src;
  const p = splitRef(src.ref);
  const whole = await getText(p.base, approved).catch(() => null);
  if (!whole || !whole.verdict.allowed || !whole.he.length) return src;
  const out: SourceData & { verdict?: unknown } = { ...whole, focus: p.n };
  delete out.verdict;
  return out;
}

// The lines around the learner's place, numbered, for the AI: one line before, the line itself, and three after.
export async function textInHand(place: Place, sources: SourceRow[], approved: ApprovedEntry[], from?: number, count = 5): Promise<string | null> {
  const sec = await section(place.base, sources, approved);
  if (!sec || !sec.he.length) return null;
  const total = Math.max(sec.he.length, sec.en.length);
  const start = Math.max(1, from ?? place.n - 1);
  const end = Math.min(total, start + count - 1);
  const lines: string[] = [];
  for (let k = start; k <= end; k++) {
    const he = clip(stripNikud(sec.he[k - 1] ?? ''), 500);
    const en = sec.en[k - 1] ? clip(sec.en[k - 1], 450) : '';
    lines.push(`[${k}] ${he}${en ? `\n    ${en}` : ''}`);
  }
  return `[TEXT IN HAND: ${place.base}${sec.translation ? ` (translation: ${sec.translation.replace(/,.*$/, '')})` : ''}. The learner is on line ${place.n} of ${total}. These numbered lines are the real text; use and quote them, and do not call get_text for ${place.base} unless you need a line not shown.]\n${lines.join('\n')}`;
}

// The AI ends its reply with [[line:N]] (the line it finished on). The app reads it and hides it.
export const LINE_MARK = /\s*\[\[\s*line\s*:\s*(\d+)\s*\]\]\s*/gi;
export function readMark(text: string): { text: string; n: number | null } {
  let n: number | null = null;
  const clean = text.replace(LINE_MARK, (_, d) => { n = Number(d); return ' '; }).replace(/[ \t]+\n/g, '\n').trim();
  return { text: clean, n };
}

// Streaming: pass text through, but hold back anything that might be the start of a [[line:N]] mark.
export function markFilter(emit: (s: string) => void) {
  let hold = '';
  return {
    push(d: string) {
      let buf = (hold + d).replace(LINE_MARK, ' ');
      hold = '';
      const j = buf.lastIndexOf('[[');
      if (j >= 0 && !buf.slice(j).includes(']]') && buf.length - j < 24) { hold = buf.slice(j); buf = buf.slice(0, j); }
      else if (buf.endsWith('[')) { hold = '['; buf = buf.slice(0, -1); }
      if (buf) emit(buf);
    },
    flush() { const h = hold.replace(LINE_MARK, ''); hold = ''; if (h && !/^\[\[/.test(h)) emit(h); },
  };
}
