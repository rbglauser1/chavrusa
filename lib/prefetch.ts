import 'server-only';
import { ApprovedEntry } from './approval';
import { SourceData } from './db';
import { getLinks, getText, resolveName, todaysLearning } from './sefaria';
import { namesForSpeech, namesForSpeechEn, stripNikud, yeshivishTranslit } from './hebrew';
import { splitPieces } from './pieces';

// For the voice: the line itself, lashon kodesh then English, inside [[say]] so it is read exactly, not retold.
// A long line: just its first bite-size piece ("next" goes on to the rest).
const sayLine = (he: string, en: string) => {
  const p = splitPieces(he, en)[0];
  return `[[say]]${yeshivishTranslit(namesForSpeech(p.he.trim()), false)}${p.en ? ` — ${namesForSpeechEn(p.en.trim())}` : ''}[[/say]]`;
};

// Where the learner is after an opening was read aloud: on piece 1 of a long first line (so "next" goes to piece 2).
export function openingPlace(s: SourceData): { base: string; n: number; part: number } | null {
  if (/\d+[ab](:|$)/.test(s.ref)) return null; // a Gemara amud opens with a question, not a reading
  const single = /:\d+$/.test(s.ref);
  const he = single ? s.he.join(' ') : s.he[0] ?? '', en = single ? s.en.join(' ') : s.en[0] ?? '';
  if (splitPieces(he, en).length < 2) return null;
  const m = s.ref.match(/^(.*):(\d+)$/);
  return m ? { base: m[1], n: Number(m[2]), part: 1 } : { base: s.ref, n: 1, part: 1 };
}

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

// "Peah, first perek" / "perek alef of Peah" / "chapter one" -> "Peah perek 1", so the place can be found.
const ORD: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  alef: 1, aleph: 1, beis: 2, bais: 2, bet: 2, beit: 2, gimmel: 3, gimel: 3, daled: 4, dalet: 4, hei: 5, heh: 5, vav: 6, zayin: 7, ches: 8, chet: 8, tes: 9, tet: 9, yud: 10, yod: 10,
};
const UNIT_WORDS = 'perek|chapter|mishna|mishnah|pasuk|posuk|verse|siman|daf';
export function normalizePlaceText(message: string): string {
  let m = message.replace(/[’]/g, "'").replace(/[,;]/g, ' ');
  const ord = Object.keys(ORD).join('|');
  m = m.replace(new RegExp(`\\b(${ord})\\s+(${UNIT_WORDS})\\b`, 'gi'), (_, o, u) => `${u} ${ORD[o.toLowerCase()]}`);   // first perek -> perek 1
  m = m.replace(new RegExp(`\\b(${UNIT_WORDS})\\s+(${ord})\\b`, 'gi'), (_, u, o) => `${u} ${ORD[o.toLowerCase()]}`);   // perek alef -> perek 1
  m = m.replace(/\b(\d{1,3})(st|nd|rd|th)\s+(perek|chapter|mishnah?|pasuk|posuk|verse)\b/gi, '$3 $1');
  // "mishna 4 (of) perek 1" / "perek 1 mishna 4" -> "1:4"
  m = m.replace(/\b(?:mishna|mishnah)\s+(\d{1,3})\s+(?:of\s+)?(?:the\s+)?(?:perek|chapter)\s+(\d{1,3})\b/gi, '$2:$1');
  m = m.replace(/\b(?:perek|chapter)\s+(\d{1,3})\s+(?:,\s*)?(?:mishna|mishnah|pasuk|posuk|verse)\s+(\d{1,3})\b/gi, '$1:$2');
  m = m.replace(/\b(\d{1,3}:\d{1,3})\s+(?:of|in)\s+((?:[A-Za-z']+\s?){1,3})/gi, (_, r, name) => `${name.trim()} ${r} `);
  // "perek 1 of Peah" -> "Peah perek 1"
  m = m.replace(new RegExp(`\\b(${UNIT_WORDS})\\s+(\\d{1,3})\\s+(?:of|in)\\s+((?:[A-Za-z']+\\s?){1,3})`, 'gi'), (_, u, n, name) => `${name.trim()} ${u} ${n} `);
  return m.replace(/\s+/g, ' ').trim();
}

// Tractates that are only Mishnah (no Bavli): "Peah 1" means Mishnah Peah.
const MISHNAH_ONLY = /^(Peah|Demai|Kilayim|Sheviit|Terumot|Maasrot|Maaser Sheni|Challah|Orlah|Bikkurim|Eduyot|Pirkei Avot|Avot|Middot|Kinnim|Kelim|Oholot|Negaim|Parah|Tahorot|Mikvaot|Makhshirin|Zavim|Tevul Yom|Yadayim|Oktzin)\b/i;

// Yeshivish spellings (often how speech-to-text writes them) -> the names Sefaria knows.
const ALIASES: [RegExp, string][] = [
  [/\b(b'?e?rachos|brochos|berochos|brachot)\b/i, 'Berakhot'], [/\bshabbos\b/i, 'Shabbat'], [/\bpesachim\b/i, 'Pesachim'],
  [/\bsukk?os\b/i, 'Sukkah'], [/\bbeitza\b/i, 'Beitzah'], [/\bta'?anis\b/i, 'Taanit'], [/\bmegil?la\b/i, 'Megillah'],
  [/\bmoed katan\b/i, 'Moed Katan'], [/\bchagiga\b/i, 'Chagigah'], [/\byevamos\b/i, 'Yevamot'], [/\bk[e']?subos\b/i, 'Ketubot'],
  [/\bmakkos\b/i, 'Makkot'], [/\bshevuos\b/i, 'Shevuot'], [/\bavoda(h)? zara(h)?\b/i, 'Avodah Zarah'], [/\bhoriyos\b/i, 'Horayot'],
  [/\bmenachos\b/i, 'Menachot'], [/\bbechoros\b/i, 'Bekhorot'], [/\barachin\b/i, 'Arakhin'], [/\bkerisos\b/i, 'Keritot'],
  [/\bbava basra\b/i, 'Bava Batra'], [/\bbaba (kamma|metzia|batra|basra)\b/i, 'Bava $1'], [/\bbava basra\b/i, 'Bava Batra'],
  [/\b(paya|pe'?[ae]h|peya|pe ah|peiah)\b/i, 'Peah'], [/\bmishnayos\b|\bmishnayot\b|\bmishnais\b|\bmishnas\b/i, 'Mishnah'],
  [/\bterumos\b/i, 'Terumot'], [/\bmaasros\b/i, 'Maasrot'], [/\bbikkurim\b/i, 'Bikkurim'], [/\beduyos\b/i, 'Eduyot'], [/\bavos\b/i, 'Pirkei Avot'],
  [/\bmiddos\b/i, 'Middot'], [/\boholos\b/i, 'Oholot'], [/\btaharos\b|\btohoros\b/i, 'Tahorot'], [/\bmikvaos\b/i, 'Mikvaot'], [/\bshviis\b|\bsheviis\b/i, 'Sheviit'],
  [/\bbereishis\b/i, 'Genesis'], [/\bshemos\b/i, 'Exodus'], [/\bvayikra\b/i, 'Leviticus'], [/\bbamidbar\b/i, 'Numbers'], [/\bdevarim\b/i, 'Deuteronomy'],
];
function sefariaName(cand: string, mishnah = false): string {
  let c = cand;
  for (const [re, to] of ALIASES) c = c.replace(re, to);
  c = c.replace(/\bBava basra\b/i, 'Bava Batra');
  // "Mishnayos Berachos 1" / a Mishnah-only tractate -> the Mishnah.
  if (!/^(Mishnah|Jerusalem|Tosefta|Rashi|Tosafot)\b/i.test(c) && !/\d+[ab]\b/.test(c) && (mishnah || MISHNAH_ONLY.test(c))) c = `Mishnah ${c}`;
  return c;
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
  // "Mishnayos Berachos 1" means the Mishnah; but a daf ("Berachos 2a", "daf beis", "the Mishnah on 2a") is the Gemara.
  const normalized = normalizePlaceText(message);
  const gemara = /\b\d{1,3}[ab]\b|\bdaf\b|\bamud\b|\bgemara\b|\bgemora\b/i.test(normalized);
  const mishnah = !gemara && /\bmishn(a|ah|ayos|ayot|ais|as)\b/i.test(message);
  const cands = candidateRefs(normalized);
  const results = await Promise.all(cands.map(async (c) => {
    for (const name of [...new Set([sefariaName(c, mishnah), sefariaName(c, false)])]) {
      const r = await resolveName(name).catch(() => null);
      if (r?.isRef && r.ref) return r.ref;
    }
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
  // Just a short table of contents (who comments here, and how much), not every reference:
  // the AI fetches a specific one with get_text only when it actually brings it.
  const section = ref.match(/\s(\d.*)$/)?.[1] ?? '';
  const list = Object.entries(byTitle).slice(0, 6).map(([t, refs]) => {
    const index = refs[0].replace(/\s\d.*$/, '');
    return `${t} (${refs.length} comment${refs.length > 1 ? 's' : ''}; get_text "${section ? `${index} ${section}` : refs[0]}")`;
  }).join('\n');
  return { list, refs: chosen.map((l) => l.ref) };
}

// Lamdan: the actual words of the Rishonim and Acharonim on the line(s) we're on, for the AI to work from.
// Straight from Sefaria (free); kept to a sensible size so each turn doesn't get expensive.
const LAMDAN_ORDER = ['Rashi', 'Tosafot', 'Rashbam', 'Ramban', 'Rashba', 'Ritva', 'Ran', 'Rosh', 'Meiri', 'Tosafot HaRosh', 'Rabbeinu Chananel', 'Shita Mekubetzet', 'Maharsha', 'Maharam', 'Maharshal', 'Penei Yehoshua', 'Rabbi Akiva Eiger', 'Tosafot Yom Tov', 'Bartenura', 'Tiferet Yisrael', 'Mishnah Berurah', 'Magen Avraham', 'Turei Zahav', 'Siftei Kohen', 'Ibn Ezra', 'Sforno', 'Or HaChaim', 'Kli Yakar'];
export async function prepareLamdan(base: string, lines: number[], approved: ApprovedEntry[], budget = 9000): Promise<string | null> {
  const res = await withTimeout(getLinks(base, approved, ['Commentary'], 600), 3500);
  if (!res || !res.allowed.length) return null;
  const want = new Set(lines);
  const at = (a?: string) => Number(a?.match(/:(\d+)(?:-\d+)?$/)?.[1] ?? 0);
  const hits = res.allowed.filter((l) => want.has(at(l.anchor)));
  if (!hits.length) return '(No commentaries on these lines on Sefaria.)';
  const rank = (t: string) => { const i = LAMDAN_ORDER.findIndex((x) => t.toLowerCase().startsWith(x.toLowerCase())); return i < 0 ? 99 : i; };
  // Group by commentator and line, best-known first.
  const groups = new Map<string, { title: string; line: number; refs: string[] }>();
  for (const l of hits) {
    const k = `${l.title}|${at(l.anchor)}`;
    if (!groups.has(k)) groups.set(k, { title: l.title, line: at(l.anchor), refs: [] });
    groups.get(k)!.refs.push(l.ref);
  }
  const ordered = [...groups.values()].sort((a, b) => a.line - b.line || rank(a.title) - rank(b.title)).slice(0, 10);
  const texts = await Promise.all(ordered.map(async (g) => {
    const got = await Promise.all(g.refs.slice(0, 4).map((r) => withTimeout(getText(r, approved), 4000).catch(() => null)));
    const he = got.filter((x) => x && x.verdict.allowed).map((x) => x!.he.map(stripNikud).join(' ')).join(' ').trim();
    return { g, he };
  }));
  let used = 0;
  const out: string[] = [];
  for (const { g, he } of texts) {
    if (!he) continue;
    const room = Math.min(1800, budget - used);
    if (room < 300) break;
    const t = he.length > room ? he.slice(0, room).replace(/\s+\S*$/, '') + ' …' : he;
    used += t.length;
    out.push(`${g.title} on line ${g.line}: ${t}`);
  }
  const others = [...new Set(hits.map((l) => l.title))].filter((t) => !out.some((o) => o.startsWith(`${t} on`)));
  return out.join('\n') + (others.length ? `\n(Also on these lines, not shown: ${others.slice(0, 12).join(', ')}. Open one with get_text if the learner wants more.)` : '');
}
const stripNikudLocal = (t: string) => t.replace(/[֑-ׇ]/g, '');

export function warmTexts(refs: string[], approved: ApprovedEntry[]): Promise<unknown> {
  return Promise.allSettled(refs.slice(0, 8).map((r) => getText(r, approved)));
}

// Is the learner only asking to open a place ("Berachos 36a", "let's learn Bava Kamma 2b", "bring up today's daf")?
// Then the app opens it with no AI call at all, and the AI joins on the next turn.
const FILLER = new Set(('mishnayos mishnayot mishnais perek chapter of the ' + 'let lets let\'s us learn learning open opening bring up pull show me go to goto start starting begin turn the a ' +
  'gemara gemora gemarah daf amud page side mishna mishnah perek chapter pasuk posuk passuk verse parsha parshah parasha sedra ' +
  'today todays today\'s this week weeks week\'s yomi please can could you would i want wanna to do with from at on in of ' +
  'and now ok okay so hi hello shalom again lets\' ready get let\'s').split(' '));
export function isJustOpening(message: string): boolean {
  const normalized = normalizePlaceText(message);
  let m = normalized.toLowerCase();
  for (const c of candidateRefs(normalized)) m = m.replace(c.toLowerCase(), ' ');
  m = m.replace(/\b\d{1,3}[ab]?(?::\d{1,3}(?:-\d{1,3})?)?\b/g, ' ');
  const words = m.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  // Allow one leftover word (often part of a tractate name the pattern didn't catch).
  return words.length <= 1 && !/\?\s*$/.test(message.trim()) && !/\b(why|what|how|explain|meaning|mean|kashya|question)\b/i.test(message);
}

// What the Chavrusa says when the app opened the place by itself (no AI call).
export function openingReply(s: SourceData, spoken: boolean): string {
  const name = s.ref.replace(/ (\d+)([ab])\b/, (_, d, a) => ` ${d}${a === 'a' ? 'a' : 'b'}`);
  // One mishnah / pasuk (e.g. "Peah 1:4"): show it whole, with its translation.
  if (!/\d+[ab](:|$)/.test(s.ref) && /:\d+$/.test(s.ref)) {
    const unit = /^Mishnah /.test(s.ref) ? 'mishnah' : 'pasuk';
    const en = s.en.join(' ').trim();
    if (spoken) return `${name}. ${sayLine(s.he.join(' '), en)} ${en ? `Any question on it, or next ${unit}?` : `There's no approved translation for this one. Want me to explain it?`}`;
    return `**${name}**\n\n> ${s.he.join(' ').trim()}${en ? `\n> "${en}"` : ''}\n\n${en ? `Any question on this ${unit}, or next ${unit}?` : `Want me to explain this ${unit}, or go on to the next?`}`;
  }
  // A perek of Mishnah (or of Tanach): start right in, with the first mishnah / pasuk and its translation.
  if (!/\d+[ab](:|$)/.test(s.ref) && s.he.length > 1) {
    const unit = /^Mishnah /.test(s.ref) ? 'mishnah' : 'pasuk';
    const en = (s.en[0] ?? '').trim();
    if (spoken) return `${name}. ${sayLine(s.he[0] ?? '', en)} ${en ? `Any question on it, or next ${unit}?` : `There's no approved translation for this one. Want me to explain it?`}`;
    return `**${name}:1**\n\n> ${(s.he[0] ?? '').trim()}${en ? `\n> "${en}"` : ''}\n\n${en ? `Any question on this ${unit}, or next ${unit}?` : `Want me to explain this ${unit}, or go on to the next?`}`;
  }
  if (spoken) return `Okay, I've opened ${name}. Do you want to start from the top, or is there a specific place you want to look at?`;
  const first = (s.he[0] ?? '').replace(/\s+/g, ' ').trim();
  const line = first.length > 220 ? first.slice(0, 220).replace(/\s+\S*$/, '') + ' …' : first;
  return `Here's **${name}**. It opens:\n\n> ${line}\n\nShould we start from the top, or is there a specific place you want to look at (for example, "at the two dots" or "the line starting with…")?`;
}
