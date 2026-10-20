import 'server-only';
import { ApprovedEntry } from './approval';
import { SourceData } from './db';
import { getText, resolveName, todaysLearning } from './sefaria';

// When the learner names a source ("Bava Metzia 21a") or asks for today's daf or this week's parsha,
// open it right away so the text appears instantly and the AI doesn't need an extra round trip to fetch it.

const TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

// "Genesis 1:1-6:8" -> "Genesis 1:1-5" (the opening of a long range)
function opening(ref: string): string {
  const m = ref.match(/^(.*?)\s(\d+):(\d+)/);
  return m ? `${m[1]} ${m[2]}:${m[3]}-${Number(m[3]) + 4}` : ref;
}

export function candidateRefs(message: string): string[] {
  const out: string[] = [];
  const re = /((?:[A-Z][\w'’]*(?:[ -]|$)){1,3}(?:on (?:[A-Z][\w'’]*[ -]?){1,3})?)(\d{1,3}[ab]?(?::\d{1,3}(?:-\d{1,3})?)?)(?![\w])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) && out.length < 3) {
    const cand = `${m[1].trim()} ${m[2]}`.replace(/\s+/g, ' ').replace(/^(?:Let'?s|Learn|Open|Start|Show|Bring|Do|Try|The|In|On|At|Read)\s+/i, '');
    if (cand.split(' ').length >= 2) out.push(cand);
  }
  return out;
}

async function findRef(message: string): Promise<string | null> {
  if (/daf\s*yomi|today'?s\s+daf/i.test(message)) {
    const items = await todaysLearning();
    return items.find((i) => /daf yomi/i.test(i.title))?.ref ?? null;
  }
  if (/\b(parsh|parash|sedra|sidra)/i.test(message) && /(this week|week'?s|today|current)/i.test(message)) {
    const items = await todaysLearning();
    const p = items.find((i) => /parash/i.test(i.title));
    return p ? opening(p.ref) : null;
  }
  for (const cand of candidateRefs(message)) {
    const r = await resolveName(cand).catch(() => null);
    if (r?.isRef && r.ref) return r.ref;
  }
  return null;
}

export async function prefetchSource(message: string, approved: ApprovedEntry[]): Promise<SourceData | null> {
  return withTimeout((async () => {
    const ref = await findRef(message);
    if (!ref) return null;
    const s = await getText(ref, approved);
    if (!s.verdict.allowed || (s.he.length === 0 && s.en.length === 0)) return null;
    const { verdict, ...source } = s;
    return source;
  })(), TIMEOUT_MS);
}
