import 'server-only';
import { ApprovedEntry } from './approval';
import { SourceData } from './db';
import { getLinks, getText, resolveName, todaysLearning } from './sefaria';

// When the learner names a source ("Bava Metzia 21a") or asks for today's daf or this week's parsha,
// open it right away so the text appears instantly and the AI doesn't need an extra round trip to fetch it.

const TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

// "Genesis 1:1-6:8" -> "Genesis 1:1-5" (the opening of a long range)
function opening(ref: string): string {
  const m = ref.match(/^(.*?)\s(\d+):(\d+)/);
  return m ? `${m[1]} ${m[2]}:${m[3]}-${Number(m[3]) + 4}` : ref;
}

// Words that come before a name but aren't part of it ("let's learn Berachos 36b").
const LEAD = new Set(["let's", 'lets', 'let', 'us', 'learn', 'learning', 'open', 'start', 'show', 'bring', 'pull', 'do', 'try', 'the', 'in',
  'at', 'read', 'go', 'to', 'up', 'me', 'please', 'can', 'could', 'you', 'we', 'i', 'want', 'and', 'now', 'from', 'with', 'ok', 'okay', 'so']);
// Words between a name and its number ("Berachos daf 36b").
const UNIT = new Set(['daf', 'page', 'amud', 'perek', 'chapter', 'pasuk', 'posuk', 'passuk', 'verse', 'siman', 'mishna', 'mishnah']);

// Possible references in what the learner typed or said, longest first. Works in any letter case
// ("berachos 36B", "Bava Metzia 21a", "Rashi on Berachos 2a").
export function candidateRefs(message: string): string[] {
  const out: string[] = [];
  const words = message.replace(/[’]/g, "'").split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length && out.length < 6; i++) {
    const m = words[i].match(/^(\d{1,3}[abAB]?(?::\d{1,3}(?:-\d{1,3})?)?)[.,!?;:]*$/);
    if (!m) continue;
    const num = m[1].replace(/[AB]$/, (c) => c.toLowerCase());
    const before: string[] = [];
    for (let j = i - 1; j >= 0 && before.length < 5; j--) {
      const w = words[j].replace(/[.,!?;:"()]/g, '');
      if (!w || /^\d/.test(w)) break;
      before.unshift(w);
    }
    while (before.length && UNIT.has(before[before.length - 1].toLowerCase())) before.pop();
    while (before.length && LEAD.has(before[0].toLowerCase())) before.shift();
    for (let k = before.length; k >= 1; k--) {
      const ws = before.slice(before.length - k);
      if (LEAD.has(ws[0].toLowerCase()) || ws[0].toLowerCase() === 'on') continue;
      out.push(`${ws.join(' ')} ${num}`);
    }
  }
  return out.slice(0, 6);
}

// Yeshivish spellings (often how speech-to-text writes them) -> the names Sefaria knows.
const ALIASES: [RegExp, string][] = [
  [/\b(b'?e?rachos|brochos|berochos|brachot)\b/i, 'Berakhot'], [/\bshabbos\b/i, 'Shabbat'], [/\bpesachim\b/i, 'Pesachim'],
  [/\bsukk?os\b/i, 'Sukkah'], [/\bbeitza\b/i, 'Beitzah'], [/\bta'?anis\b/i, 'Taanit'], [/\bmegil?la\b/i, 'Megillah'],
  [/\bmoed katan\b/i, 'Moed Katan'], [/\bchagiga\b/i, 'Chagigah'], [/\byevamos\b/i, 'Yevamot'], [/\bk[e']?subos\b/i, 'Ketubot'],
  [/\bmakkos\b/i, 'Makkot'], [/\bshevuos\b/i, 'Shevuot'], [/\bavoda(h)? zara(h)?\b/i, 'Avodah Zarah'], [/\bhoriyos\b/i, 'Horayot'],
  [/\bmenachos\b/i, 'Menachot'], [/\bbechoros\b/i, 'Bekhorot'], [/\barachin\b/i, 'Arakhin'], [/\bkerisos\b/i, 'Keritot'],
  [/\bbava basra\b/i, 'Bava Batra'], [/\bbaba (kamma|metzia|batra|basra)\b/i, 'Bava $1'], [/\bbava basra\b/i, 'Bava Batra'],
  [/\bbereishis\b/i, 'Genesis'], [/\bshemos\b/i, 'Exodus'], [/\bvayikra\b/i, 'Leviticus'], [/\bbamidbar\b/i, 'Numbers'], [/\bdevarim\b/i, 'Deuteronomy'],
];
function sefariaName(cand: string): string {
  let c = cand;
  for (const [re, to] of ALIASES) c = c.replace(re, to);
  return c.replace(/\bBava basra\b/i, 'Bava Batra');
}

export async function findRef(message: string, direct = false): Promise<string | null> {
  if (/daf\s*yomi|today'?s\s+daf/i.test(message)) {
    const items = await todaysLearning();
    return items.find((i) => /daf yomi/i.test(i.title))?.ref ?? null;
  }
  if (/\b(parsh|parash|sedra|sidra)/i.test(message) && /(this week|week'?s|today|current)/i.test(message)) {
    const items = await todaysLearning();
    const p = items.find((i) => /parash/i.test(i.title));
    return p ? opening(p.ref) : null;
  }
  // When the learner typed just a reference (Go to box), try the whole text first.
  if (direct) {
    const r = await resolveName(message.trim()).catch(() => null);
    if (r?.isRef && r.ref) return r.ref;
  }
  // Check all the possible readings at once (each lookup is cached), and take the longest that is a real place.
  const cands = candidateRefs(message);
  const results = await Promise.all(cands.map(async (c) => {
    const r = await resolveName(sefariaName(c)).catch(() => null);
    if (r?.isRef && r.ref) return r.ref;
    return null;
  }));
  return results.find(Boolean) ?? null;
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

// The main commentaries most sugyos go to first. Fetching their list now saves the AI a lookup step,
// and loading their text in the background makes later lookups nearly instant (it's cached for a week).
const FIRST_COMMENTARIES = /^(Rashi|Tosafot|Rashbam|Ran|Rosh|Ramban|Ibn Ezra|Sforno|Rashbatz|Bartenura|Tosafot Yom Tov|Mishnah Berurah|Magen Avraham|Taz|Shakh|Be'er Heitev)/i;

export async function prepareCommentaries(ref: string, approved: ApprovedEntry[]): Promise<{ list: string; refs: string[] } | null> {
  const res = await withTimeout(getLinks(ref, approved, ['Commentary']), 3000);
  if (!res || !res.allowed.length) return null;
  const preferred = res.allowed.filter((l) => FIRST_COMMENTARIES.test(l.title || l.ref));
  const chosen = (preferred.length ? preferred : res.allowed).slice(0, 24);
  const byTitle: Record<string, string[]> = {};
  for (const l of chosen) (byTitle[l.title || 'Commentary'] ??= []).push(l.ref);
  const list = Object.entries(byTitle).map(([t, refs]) => `${t}: ${refs.slice(0, 8).join('; ')}`).join('\n');
  return { list, refs: chosen.map((l) => l.ref) };
}

export function warmTexts(refs: string[], approved: ApprovedEntry[]): Promise<unknown> {
  return Promise.allSettled(refs.slice(0, 8).map((r) => getText(r, approved)));
}

// Is the learner only asking to open a place ("Berachos 36a", "let's learn Bava Kamma 2b", "bring up today's daf")?
// Then the app opens it with no AI call at all, and the AI joins on the next turn.
const FILLER = new Set(('let lets let\'s us learn learning open opening bring up pull show me go to goto start starting begin turn the a ' +
  'gemara gemora gemarah daf amud page side mishna mishnah perek chapter pasuk posuk passuk verse parsha parshah parasha sedra ' +
  'today todays today\'s this week weeks week\'s yomi please can could you would i want wanna to do with from at on in of ' +
  'and now ok okay so hi hello shalom again lets\' ready get let\'s').split(' '));
export function isJustOpening(message: string): boolean {
  let m = message.toLowerCase().replace(/[’]/g, "'");
  for (const c of candidateRefs(message)) m = m.replace(c.toLowerCase(), ' ');
  m = m.replace(/\b\d{1,3}[ab]?(?::\d{1,3}(?:-\d{1,3})?)?\b/g, ' ');
  const words = m.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  // Allow one leftover word (often part of a tractate name the pattern didn't catch).
  return words.length <= 1 && !/\?\s*$/.test(message.trim()) && !/\b(why|what|how|explain|meaning|mean|kashya|question)\b/i.test(message);
}

// What the Chavrusa says when the app opened the place by itself (no AI call).
export function openingReply(s: SourceData, spoken: boolean): string {
  const name = s.ref.replace(/ (\d+)([ab])\b/, (_, d, a) => ` ${d}${a === 'a' ? 'a' : 'b'}`);
  if (spoken) return `Okay, I've opened ${name}. Do you want to start from the top, or is there a specific place you want to look at?`;
  const first = (s.he[0] ?? '').replace(/\s+/g, ' ').trim();
  const line = first.length > 220 ? first.slice(0, 220).replace(/\s+\S*$/, '') + ' …' : first;
  return `Here's **${name}**. It opens:\n\n> ${line}\n\nShould we start from the top, or is there a specific place you want to look at (for example, "at the two dots" or "the line starting with…")?`;
}
