import 'server-only';
// The no-AI path. Anything the app can do by itself (open a place, turn the page, open Rashi, switch style,
// repeat, say thanks…) is done here for free. Only real learning (explaining, asking, reasoning) goes to the AI.

import { ApprovedEntry, COMMENTARY_BOOK } from './approval';
import { MODELS, Provider, Settings, styleById, Tier } from './config';
import { listMessages, listSessions, listSources, Memory, MessageRow, sessionCost, SourceData, SourceRow } from './db';
import { isJustOpening, openingReply } from './prefetch';
import { getLinks, getText, todaysLearning } from './sefaria';
import { currentPlace, splitRef } from './place';
import { namesForSpeech, yeshivishTranslit } from './hebrew';

export interface RouteCtx {
  message: string;
  spoken: boolean;
  settings: Settings;
  sessionId: string;
  sources: SourceRow[];
  history: MessageRow[];
  memories: Memory[];
  approved: ApprovedEntry[];
  pre: SourceData | null;
}

export interface Routed {
  reply?: string;                 // a full answer: no AI needed
  source?: SourceData;            // a source the app opened (shown in the Sefer panel)
  settings?: Partial<Settings>;   // settings to save
  then?: 'ai';                    // apply the settings, then still let the AI answer this turn
  line?: LineText;                // the line the learner is now on (saved, so the AI gets it without a lookup)
  readThrough?: { mode: 'he-en' | 'shnayim' | 'he'; base: string; from: number }; // start reading straight through, no AI
}
export interface LineText { ref: string; he: string; en: string; translation: string | null }

// Lowercase, no punctuation, without polite padding at either end.
function norm(m: string): string {
  let s = m.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const lead = /^(ok(ay)?|so|now|please|hey|um+|uh+|can you|could you|would you|let's|lets|let us|i want to|i'd like to|go ahead and|just)\s+/;
  for (let i = 0; i < 4 && lead.test(s); i++) s = s.replace(lead, '');
  return s.replace(/\s+(please|now|thanks|thank you)$/, '').trim();
}

// True when nothing is left once the given words are removed.
function onlyWords(s: string, keep: RegExp, filler: Set<string>): boolean {
  const rest = s.replace(keep, ' ').split(' ').filter((w) => w && !filler.has(w));
  return rest.length === 0;
}

// The last main text (not a commentary) the learner has open.
function currentMain(sources: SourceRow[]): SourceData | null {
  for (let i = sources.length - 1; i >= 0; i--) if (!/ on /.test(sources[i].ref) && !COMMENTARY_BOOK.test(sources[i].ref)) return sources[i].data;
  return sources.length ? sources[sources.length - 1].data : null;
}

async function tryText(ref: string, approved: ApprovedEntry[]): Promise<SourceData | null> {
  try {
    const s = await getText(ref, approved);
    if (!s.verdict.allowed || (!s.he.length && !s.en.length)) return null;
    const src: SourceData & { verdict?: unknown } = { ...s };
    delete src.verdict;
    return src;
  } catch { return null; }
}

// ---------- 1. Thanks, goodbye, greetings ----------
const THANKS = /^(thanks|thank you|thank you so much|thanks so much|thanks a lot|yasher koach|yasher koyach|yasher ko'ach|todah|toda|todah rabbah|great thanks|perfect thanks)$/;
const BYE = /^(bye|goodbye|good bye|good night|goodnight|that's it|that's it for (today|now|tonight)|i'm done|im done|done for (today|now|tonight)|gotta go|i have to go|i need to go|stop here|let's stop|stop for (today|now))$/;
const HELLO = /^(hi|hello|hey|hi there|shalom|shalom aleichem|good (morning|afternoon|evening)|boker tov|erev tov)$/;

async function greeting(ctx: RouteCtx): Promise<string> {
  const [today, last] = await Promise.all([
    Promise.race([todaysLearning().catch(() => []), new Promise<{ title: string; display: string; ref: string }[]>((r) => setTimeout(() => r([]), 1500))]),
    lastPlace(ctx.sessionId).catch(() => null),
  ]);
  const daf = today.find((i) => /daf yomi/i.test(i.title));
  const parsha = today.find((i) => /parash/i.test(i.title));
  const opts = [
    last ? `pick up where we left off (${last.source.ref})` : null,
    daf ? `today's daf (${daf.display || daf.ref})` : null,
    parsha ? `this week's parsha (${parsha.display || parsha.ref})` : null,
  ].filter(Boolean) as string[];
  const list = opts.length > 1 ? `${opts.slice(0, -1).join(', ')}, or ${opts[opts.length - 1]}` : opts[0] ?? 'anything you like';
  return `Shalom! What are we learning? We could ${list}. Or just tell me where.`;
}

// ---------- 2. Where we left off ----------
async function lastPlace(currentSession: string): Promise<{ source: SourceData; lastWords: string | null } | null> {
  const sessions = (await listSessions()).filter((s) => s.id !== currentSession).slice(0, 5);
  for (const s of sessions) {
    const srcs = await listSources(s.id);
    if (!srcs.length) continue;
    const main = currentMain(srcs);
    if (!main) continue;
    const msgs = await listMessages(s.id, 6);
    const lastBot = [...msgs].reverse().find((m) => m.role === 'assistant');
    return { source: main, lastWords: lastBot ? lastBot.content : null };
  }
  return null;
}
const RESUME = /\b(where were we|where did we (leave off|stop)|where we left off|pick up where|continue (from )?(where we|last time)|last time|resume|carry on from last time)\b/;

// ---------- 3. Turning pages ----------
type Unit = 'amud' | 'daf' | 'pasuk' | 'perek' | 'mishnah';
const NAV = /^(go |move |turn |let's go |on |onto |on to )?(to )?(the )?(next|previous|prev|last|back( to)?( the| an| a)?( previous)?|forward( to)?( the| an| a)?) ?(amud|omud|daf|page|side|pasuk|posuk|passuk|verse|line of the pasuk|perek|chapter|mishna|mishnah)$/;
const NAV2 = /^(go )?back (an?|one) (amud|omud|daf|page|pasuk|posuk|verse|perek|chapter|mishna|mishnah)$/;

function unitOf(w: string): Unit {
  if (/amud|omud|side/.test(w)) return 'amud';
  if (/daf|page/.test(w)) return 'daf';
  if (/pasuk|posuk|passuk|verse/.test(w)) return 'pasuk';
  if (/mishna/.test(w)) return 'mishnah';
  return 'perek';
}

function stepRef(ref: string, dir: 1 | -1, unit: Unit): string[] {
  // Talmud: "Berakhot 36b", "Berakhot 36b:3-7"
  const t = ref.match(/^(.*?) (\d+)([ab])(?::[\d-]+)?$/);
  if (t) {
    const [book, n, side] = [t[1], Number(t[2]), t[3]];
    if (unit === 'daf' || unit === 'perek') return [`${book} ${n + dir}a`];
    if (dir === 1) return [side === 'a' ? `${book} ${n}b` : `${book} ${n + 1}a`];
    return [side === 'b' ? `${book} ${n}a` : `${book} ${n - 1}b`];
  }
  // Tanakh / Mishnah: "Genesis 1:5", "Genesis 1:1-5", "Mishnah Berakhot 1:1", "Genesis 2"
  const v = ref.match(/^(.*?) (\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (v) {
    const [book, ch] = [v[1], Number(v[2])];
    const start = v[3] ? Number(v[3]) : null;
    const end = v[4] ? Number(v[4]) : start;
    if (unit === 'perek' || start === null) return [`${book} ${ch + dir}`];
    if (dir === 1) return [`${book} ${ch}:${(end ?? 0) + 1}`, `${book} ${ch + 1}:1`];
    return start > 1 ? [`${book} ${ch}:${start - 1}`] : ch > 1 ? [`${book} ${ch - 1}`] : [];
  }
  return [];
}

// ---------- 4. Opening a commentary on what's open ----------
const COMMENTARIES: [RegExp, RegExp][] = [
  [/\btosafos yom tov\b|\btosfos yom tov\b/, /Tosafot Yom Tov/i],
  [/\btiferes yisr[oa]el\b|\btiferet yisrael\b/, /Tiferet Yisrael/i],
  [/\bmelech?es shlomo\b|\bmelechet shlomo\b/, /Melechet Shlomo/i],
  [/\bmishna(h)? rishona(h)?\b/, /Mishnah Rishonah/i],
  [/\b(the )?rash\b|\brash mi ?shantz\b|\brabbeinu shimshon\b/, /Rash MiShantz|Rabbeinu Shimshon/i],
  [/\brashi\b/, /^Rashi$/i],
  [/\bto[iy]?s[aeo]?(?:f|ph)[aeo]?[st]s?\b/, /^Tosafot$/i], // Tosafos, Tosfos, Tosofos, Toisfos, Tosafot…
  [/\brashbam\b/, /^Rashbam$/i],
  [/\bramban\b/, /^Ramban$/i],
  [/\bibn ezra\b|\bevan ezra\b/, /^Ibn Ezra$/i],
  [/\bs'?e?forno\b/, /^Sforno$/i],
  [/\bo?h?r ha ?chaim\b|\bor hachayim\b/, /^Or HaChaim$/i],
  [/\bkli yakar\b|\bk'li yakar\b/, /^Kli Yakar$/i],
  [/\bbaal ha ?turim\b/, /^Baal HaTurim$/i],
  [/\bonkelos\b|\bonkeles\b|\btargum\b/, /Onkelos/i],
  [/\brashba\b/, /^Rashba$/i],
  [/\brambam\b/, /Rambam/i],
  [/\britva\b/, /^Ritva$/i],
  [/\bran\b/, /^Ran$/i],
  [/\bmaharsha\b/, /Maharsha/i],
  [/\bbartenura\b|\bbertinoro\b|\bbartenuro\b/, /^Bartenura$/i],
  [/\bmishna(h)? berura(h)?\b/, /Mishnah Berurah/i],
  // Shulchan Aruch
  [/\bmagen avra(ha|ho)m\b|\bmogen avrohom\b/, /Magen Avraham/i],
  [/\btaz\b|\bturei zahav\b/, /Turei Zahav/i],
  [/\bshach\b|\bsiftei kohen\b|\bsifsei kohen\b/, /Siftei Kohen/i],
  [/\bbiur hala(ch|kh)a(h)?\b|\bbeur hala(ch|kh)a(h)?\b/, /Biur Halacha/i],
  [/\bsha'?ar ha ?tziyun\b|\bshaar hatziun\b/, /Sha'ar HaTziyun/i],
  [/\bba'?er heitev\b|\bbe'?er hei?tev\b|\bbaer hetev\b/, /Ba'?er Hetev|Be'?er Hetev/i],
  [/\bkaf ha ?chaim\b|\bkaf hachayim\b/, /Kaf HaChayim|Kaf HaChaim/i],
  [/\bsha'?arei teshuva(h)?\b/, /Sha'arei Teshuvah/i],
  [/\bpri megadim\b/, /Pri Megadim/i],
  [/\bmachatzis ha ?shekel\b|\bmachatzit hashekel\b/, /Machatzit HaShekel/i],
  [/\b(the )?gr\"?a\b|\bbiur ha ?gra\b|\bvilna gaon\b/, /Gra|Vilna Gaon/i],
  [/\bbe'?er ha ?golah\b/, /Be'er HaGolah/i],
  [/\bpische teshuva(h)?\b|\bpitchei teshuva(h)?\b/, /Pithei Teshuva|Pitchei Teshuvah/i],
  [/\bhagahos maimon(i|ios)\b/, /Hagahot Maimoniyot/i],
  [/\bkesef mishneh\b/, /Kesef Mishneh/i],
  [/\bmaggid mishneh\b/, /Maggid Mishneh/i],
  // Gemara
  [/\b(the )?rif\b/, /^Rif$|Rif/i],
  [/\b(the )?rosh\b(?! ?hashana)/, /^Rosh$|Rosh/i],
  [/\bmeiri\b/, /Meiri/i],
  [/\brabbeinu chananel\b|\bthe ri ?ch\b/, /Rabbeinu Chananel/i],
  [/\bshita(h)? mekubetzes\b|\bshitah mekubetzet\b/, /Shita Mekubetzet/i],
  [/\bpnei yehoshua\b/, /Penei Yehoshua|Pnei Yehoshua/i],
  [/\bmaharam\b/, /Maharam/i],
  [/\bmaharshal\b/, /Maharshal/i],
  [/\bmesoras ha ?shas\b/, /Mesorat HaShas/i],
  // Chumash
  [/\brabbeinu ba(ch|h)ya\b/, /Rabbeinu Bahya/i],
  [/\bchizkuni\b/, /Chizkuni/i],
  [/\bda'?as zekeinim\b|\bdaat zkenim\b/, /Da'at Zekenim|Daat Zkenim/i],
  [/\bsiftei chachamim\b|\bsifsei chachamim\b/, /Siftei Chakhamim/i],
  [/\bmizrachi\b/, /Mizrachi/i],
  [/\bmalbim\b/, /Malbim/i],
  [/\bha'?amek davar\b|\bnetziv\b/, /Haamek Davar/i],
  [/\bmeshech chochma(h)?\b/, /Meshech Hokhmah|Meshech Chochma/i],
  [/\bradak\b/, /Radak/i],
  [/\bmetzudas\b|\bmetzudat\b/, /Metzudat/i],
  [/\bralbag\b/, /Ralbag/i],
];
const OPEN_FILLER = new Set(['open', 'show', 'bring', 'up', 'see', 'look', 'at', 'the', 'me', 'go', 'to', 'what', 'about', 'on', 'this', 'here', 'it', 'inside', 'in', 'pull', 'read', 'lets', "let's", 'there', 'have', 'a', 'let', 'us', 'check', 'out', 'and', 'too', 'also', 'now', 'next']);

// Find the commentary the learner named on the text that's open. Used by "open Tosafos" (free) and to hand the AI
// the commentary's text with a question like "what is Tosafos asking?" (so it doesn't have to find it itself).
// "Shulchan Arukh, Orach Chayim 239:1" / "Berakhot 36b:3-4" -> 1 / 3 (the line of the main text a comment is on).
const anchorLine = (a?: string) => { const m = a?.match(/:(\d+)(?:-\d+)?$/); return m ? Number(m[1]) : null; };

// Several comment refs of one commentary -> one reference to open: "Mishnah Berurah 239:1", ":2" -> "Mishnah Berurah 239:1-2".
function joinRefs(refs: string[]): string {
  const parts = refs.map((r) => r.match(/^(.*):(\d+)(?:-(\d+))?$/));
  if (parts.some((m) => !m) || new Set(parts.map((m) => m![1])).size !== 1) return refs[0];
  const lo = Math.min(...parts.map((m) => Number(m![2]))), hi = Math.max(...parts.map((m) => Number(m![3] ?? m![2])));
  return lo === hi ? `${parts[0]![1]}:${lo}` : `${parts[0]![1]}:${lo}-${hi}`;
}

export async function findCommentary(text: string, sources: SourceRow[], approved: ApprovedEntry[], history: MessageRow[] = []): Promise<{ src: SourceData; count: number; line?: number } | { missing: string; on: string; available: string[] } | null> {
  const s = norm(text);
  const hit = COMMENTARIES.find(([said]) => said.test(s));
  const main = currentMain(sources);
  if (!hit || !main) return null;
  const links = await getLinks(main.ref, approved, ['Commentary', 'Targum', 'Halakhah'], 600).catch(() => null);
  const ofIt = (links?.allowed ?? []).filter((l) => hit[1].test(l.title));

  // Jump to the commentary on the line we're on (or the line the learner named: "the Taz on se'if 3"),
  // not the whole amud / siman. If it has nothing on that line, the next line where it does.
  const said = s.match(/\b(?:se'?if|seif|line|mishna|mishnah|pasuk|posuk|halacha|halakha)\s+(\d+)\b/);
  const here = currentPlace(history, sources);
  const mainBase = main.ref.replace(/:\d+(-\d+)?$/, '');
  const n = said ? Number(said[1]) : here && here.base === mainBase ? here.n : null;
  if (n && ofIt.length) {
    const lines = [...new Set(ofIt.map((l) => anchorLine(l.anchor)).filter((x): x is number => x !== null))].sort((a, b) => a - b);
    const at = lines.find((x) => x >= n);
    if (at !== undefined) {
      const refs = ofIt.filter((l) => anchorLine(l.anchor) === at).map((l) => l.ref);
      const src = await tryText(joinRefs(refs), approved);
      if (src) return { src, count: refs.length, line: at };
    }
  }
  const name = hit[1].source.replace(/[\^$\\]/g, '').replace(/^Tosafot$/, 'Tosafos').replace(/^Or HaChaim$/, 'Ohr HaChaim');
  // Not there (e.g. no Rashi on Mishnah Peah): say which commentaries this text does have.
  const available = [...new Set((links?.allowed ?? []).map((l) => l.title).filter(Boolean))].slice(0, 8);
  if (!ofIt.length) return { missing: name, on: main.ref, available };
  const index = ofIt[0].ref.replace(/\s\d.*$/, '');               // "Rashi on Berakhot"
  const section = main.ref.match(/\s(\d.*)$/)?.[1] ?? '';          // "36b" or "1:1-5"
  const src = (section && await tryText(`${index} ${section}`, approved)) || await tryText(ofIt[0].ref, approved);
  return src ? { src, count: ofIt.length } : { missing: name, on: main.ref, available };
}

function missingReply(f: { missing: string; on: string; available: string[] }): string {
  return f.available.length
    ? `There's no ${f.missing} on ${f.on} on Sefaria. What it does have: ${f.available.join(', ')}. Which one would you like?`
    : `I couldn't find an approved ${f.missing} on ${f.on} on Sefaria. Sometimes there's none on that amud; try the next amud, or name a specific line.`;
}

async function openCommentary(ctx: RouteCtx, s: string): Promise<Routed | null> {
  const hit = COMMENTARIES.find(([said]) => said.test(s));
  if (!hit || !onlyWords(s, hit[0], OPEN_FILLER) || /\b(say|says|saying|mean|means|why|how|explain|ask|asking|bothered|hold|holds)\b/.test(s)) return null;
  const found = await findCommentary(s, ctx.sources, ctx.approved, ctx.history);
  if (!found) return null;
  if ('missing' in found) return { reply: missingReply(found) };
  const { src, count: n } = found;
  const reply = ctx.spoken
    ? `It's open${found.line ? ` on line ${found.line}` : ''}. ${n > 1 ? `${n} comments there. Which one?` : 'Take a look.'}`
    : `${openingReply(src, false).replace(/\n\nShould we start.*$/s, '')}\n\n${n > 1 ? `There are ${n} comments here. Which one do you want to look at?` : 'Take a look. What is it bothered by?'}`;
  return { reply, source: src };
}

// ---------- 5. Style and model ----------
const STYLE_WORDS: [RegExp, string][] = [
  [/\b(challenger|challenge me|sharp|push me( harder)?|harder)\b/, 'challenger'],
  [/\b(patient( teacher)?|gentle|gentler|go easy|easier on me)\b/, 'patient'],
  [/\b(sevara|svara|logic)\b/, 'sevara'],
  [/\b(iyun|b'?iyun|lomdus|lomdish)\b/, 'iyun'],
  [/\b(bekius|bekiyus|bekiut|quick review|review mode)\b/, 'bekius'],
  [/\b(mussar|inspirational|inspire me)\b/, 'mussar'],
  [/\b(farher|test me|quiz me|test mode|quiz mode)\b/, 'farher'],
  [/\b(read explain ask|read and explain|read (and|&) ask|read translate explain|reader)\b/, 'reader'],
  [/\b(follow my lead|follow me|my lead|i'?ll lead|let me lead)\b/, 'lead'],
  [/\b(simple( explainer)?|simpler|explainer)\b/, 'simple'],
  [/\b(chassidic|chasidic|chassidish|chasidish|chassidus|chasidus)\b/, 'chassidic'],
];
const STYLE_FILLER = new Set(['switch', 'change', 'to', 'the', 'style', 'mode', 'use', 'try', 'be', 'more', 'a', 'go', 'into', 'teacher', 'please', 'me', 'i', 'want', 'with', 'learn', 'learning', 'way', 'like', 'instead', 'can', 'you', 'now', 'do', 'lets', "let's", 'put', 'in', 'on', 'set', 'it', 'as']);
const MODEL_WORDS: [RegExp, Provider, Tier | null][] = [
  [/\bopus\b/, 'anthropic', 'top'], [/\bsonnet\b/, 'anthropic', 'middle'], [/\bhaiku\b/, 'anthropic', 'basic'],
  [/\bastra\b/, 'openai', 'top'], [/\bsol\b/, 'openai', 'middle'], [/\bluna\b/, 'openai', 'basic'],
  [/\bclaude\b|\banthropic\b/, 'anthropic', null], [/\bopen ?ai\b|\bchat ?gpt\b|\bgpt\b/, 'openai', null],
];

function styleSwitch(ctx: RouteCtx, s: string): Routed | null {
  // One of the learner's own styles, by its name ("switch to my Bekius plus").
  for (const c of ctx.settings.customStyles ?? []) {
    const name = norm(c.name);
    if (!name) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(s) && onlyWords(s, re, new Set([...STYLE_FILLER, 'my', 'own']))) {
      return { settings: { style: c.id, blend: null }, reply: ctx.spoken ? 'Sure.' : `Switched to ${c.name}.` };
    }
  }
  const hit = STYLE_WORDS.find(([re]) => re.test(s));
  if (!hit || !onlyWords(s, hit[0], STYLE_FILLER)) return null;
  const st = styleById(hit[1]);
  const explicit = /\b(style|mode|switch|change)\b/.test(s) || s === st.short.toLowerCase() || s === st.name.toLowerCase();
  if (explicit) {
    return { settings: { style: st.id }, reply: ctx.spoken ? 'Sure.' : `Switched to ${st.name}.` };
  }
  // "Quiz me", "push me harder": switch, and let the AI act on it right away.
  return { settings: { style: st.id }, then: 'ai' };
}

function modelSwitch(s: string): Routed | null {
  if (!/\b(use|switch|change|go|move|try)\b/.test(s)) return null;
  const hit = MODEL_WORDS.find(([re]) => re.test(s));
  if (!hit) return null;
  const filler = new Set([...STYLE_FILLER, 'model', 'ai', 'brain', 'claude', 'anthropic', 'openai', 'open', 'gpt', 'chatgpt', 'chat', 'over', 'back']);
  if (!onlyWords(s, hit[0], filler)) return null;
  const patch: Partial<Settings> = { provider: hit[1] };
  if (hit[2]) patch.tier = hit[2];
  return { settings: patch };
}

// ---------- 6. Line by line ----------
// The learner moves one line (one Sefaria segment, usually ending at the "two dots") at a time.
// The app shows the line with its approved translation itself; the AI is only needed for a question about it.
const NEXT_LINE = /^(the )?(next|following) (line|sentence|piece|part|statement)$|^(go |move |keep going |on )?(on )?(to )?the (next|following) (line|sentence|piece|statement)$|^read the next (line|piece)$/;
const PREV_LINE = /^(the )?(previous|last|prior) (line|sentence|piece|statement)$|^(go )?back (a|one) (line|sentence)$|^(go )?(back )?to the (previous|last) (line|sentence)$/;
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|next|go ahead|go on|please do|keep going|let's go|go for it|yes please|sounds good)$/;
const ASKED_NEXT = /\b(next line|next piece|next sentence|next mishna|next mishnah|next pasuk|next posuk|next verse|the next one|continue|keep going|go on|move on)\b[^.?!]*\?\s*$/i;

function lineFromSource(src: SourceData): LineText {
  return { ref: src.ref, he: src.he.join(' '), en: src.en.join(' '), translation: src.translation };
}

// Which line is the learner on? The line the app last showed, or the furthest line the AI looked up last turn.
function currentLine(ctx: RouteCtx): string | null {
  // Same tracking the AI's "text in hand" uses: the line shown last, the line the AI finished on, or a later lookup.
  const p = currentPlace(ctx.history, ctx.sources);
  return p ? `${p.base}:${p.n}` : null;
}

// What one step is called in this kind of text: a mishnah, a pasuk, or a line of Gemara.
const TANAKH_BOOK = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
function unitWord(ref: string): string {
  if (/^Mishnah /.test(ref)) return 'mishnah';
  if (TANAKH_BOOK.test(ref)) return 'pasuk';
  return 'line';
}

function lineReply(l: LineText, spoken: boolean): string {
  const u = unitWord(l.ref);
  if (spoken) {
    // Lashon kodesh first, then the English.
    const tr = yeshivishTranslit(namesForSpeech(l.he), false);
    return l.en ? `[[say]]${tr} — ${l.en}[[/say]] Any question on this, or next ${u}?` : `[[say]]${tr}[[/say]] There's no approved translation for this one. Want me to explain it?`;
  }
  const en = l.en ? `\n> "${l.en}"${l.translation ? `\n\n*Translation: ${l.translation.replace(/,.*$/, '')}*` : ''}` : '';
  const ask = l.en ? `Any question on this ${u}, or next ${u}?` : `There's no approved translation for this ${u}. Want me to explain it?`;
  return `**${l.ref}**\n\n> ${l.he}${en}\n\n${ask}`;
}

async function moveLine(ctx: RouteCtx, dir: 1 | -1): Promise<Routed | null> {
  const cur = currentLine(ctx);
  if (!cur) return null; // we don't know where they are: let the AI work it out
  const base = cur.replace(/:\d+$/, '');
  const n = Number(cur.split(':').pop());
  const tries = dir === 1 ? [`${base}:${n + 1}`, ...stepRef(base, 1, 'amud').map((r) => `${r}:1`)] : n > 1 ? [`${base}:${n - 1}`] : [];
  for (const ref of tries) {
    const src = await tryText(ref, ctx.approved);
    if (src) {
      const line = lineFromSource(src);
      // Show the whole perek / amud in the Sefer, scrolled to this line, so the learner can look around it.
      const p = splitRef(src.ref);
      const whole = await tryText(p.base, ctx.approved);
      // Went on into the next amud / perek: say so in a word, and carry straight on.
      const crossed = p.base !== base;
      const lead = crossed ? `${ctx.spoken ? '' : '**'}${p.base}${ctx.spoken ? '.' : '**'} ` : '';
      const reply = lineReply(line, ctx.spoken);
      return { reply: crossed && ctx.spoken ? `${lead}${reply}` : crossed ? reply.replace(/^\*\*[^*]+\*\*/, `**${src.ref}** (${p.base} begins)`) : reply, line, ...(whole ? { source: { ...whole, focus: p.n } } : {}) };
    }
  }
  return { reply: dir === 1 ? `That's the end of ${base.replace(/\s\d.*$/, '')}.` : `We're already at the first ${unitWord(base)}.` };
}

// ---------- 7. Read-through ----------
const READ_THROUGH = /\bshn?a?yim mikra\b|\bshnayim\b|\bmikra v'?echad targum\b|\bread (?:it |them |the (?:pesukim|psukim|pasuk(?:im)?|parsha|perek|mishna(?:h|yos)?|gemara|amud) )?(?:through|straight(?: through)?|along|all the way)\b|\bread the (?:pesukim|psukim|parsha)\b|\bsay over the (?:pesukim|psukim|pasuk|parsha)\b|\bkeep reading\b|\bcontinue reading\b|\bgo on reading\b|\bread (?:with|in) (?:the )?english\b|\bread (?:just|only) (?:the )?hebrew\b/;

// ---------- The router ----------
export async function routeWithoutAI(ctx: RouteCtx): Promise<Routed | null> {
  const { message, spoken, pre } = ctx;
  const s = norm(message);
  if (!s) return null;

  // "Read / say over the Tosafos (Rashi…)": read the commentary itself straight through, word for word, no AI.
  if (/\b(read|say over|say it over|read it|read me|go through|read out)\b/.test(s) && COMMENTARIES.some(([re]) => re.test(s)) && !/\b(why|explain|what|mean|means|asking|bothered|says|say about|translate|hold|holds)\b/.test(s)) {
    const found = await findCommentary(s, ctx.sources, ctx.approved, ctx.history);
    if (found && 'src' in found) {
      return { reply: spoken ? 'Sure.' : `Reading ${found.src.ref}.`, readThrough: { mode: found.src.en.length ? 'he-en' : 'he', base: found.src.ref, from: 1 }, source: found.src };
    }
    if (found && 'missing' in found) return { reply: missingReply(found) };
  }

  // Read straight through ("shnayim mikra", "read the pesukim", "keep reading"): the app reads, no AI, no questions.
  if (READ_THROUGH.test(s) && !/\b(why|explain|what does|what is|mean)\b/.test(s)) {
    const mode = /\bshn?a?yim mikra|\bshnayim\b|\btargum\b|\bonkelos\b/.test(s) ? 'shnayim' : /\b(just|only) (the )?hebrew\b|\bno english\b|\bwithout (the )?english\b/.test(s) ? 'he' : 'he-en';
    const place = pre ? splitRef(pre.ref) : currentPlace(ctx.history, ctx.sources);
    if (!place) return { reply: 'Which parsha or perek? Tell me the place (for example, "Bereishis 1") and say "read it through."' };
    const from = pre ? place.n : /\bfrom the (top|beginning)\b/.test(s) ? 1 : place.n + (/\bkeep reading|continue reading|go on reading\b/.test(s) ? 1 : 0);
    const what = mode === 'shnayim' ? "shnayim mikra v'echad targum" : mode === 'he' ? 'the Hebrew' : 'with the English';
    return { reply: spoken ? 'Sure.' : `Reading ${what} from ${place.base}:${from}.`, readThrough: { mode, base: place.base, from }, ...(pre ? { source: pre } : {}) };
  }

  // Open a named place ("Berachos 36b", "today's daf", "what's this week's parsha?").
  if (pre && (isJustOpening(message) || (/\b(today'?s daf|daf yomi|this week'?s parsha|parsha this week)\b/.test(s) && s.split(' ').length <= 8))) {
    return { reply: openingReply(pre, spoken), source: pre };
  }
  if (pre) return null; // a question about a named place: that's for the AI

  if (THANKS.test(s)) return { reply: ctx.sources.length ? 'Bevakasha! Ready for the next step whenever you are.' : 'Bevakasha!' };
  if (BYE.test(s)) {
    return { reply: ctx.history.length > 2 ? 'Kol tuv! Before you go, want a quick summary and a few review questions? Just say "summary."' : 'Kol tuv!' };
  }
  if (HELLO.test(s)) return { reply: await greeting(ctx) };

  if (/^(say (that|it) again|repeat( that| it)?( again)?|come again|what did you say|can you repeat( that)?|one more time|again|read (it|that) again|read it one more time)$/.test(s)) {
    const last = [...ctx.history].reverse().find((m) => m.role === 'assistant');
    if (last) return { reply: last.content };
  }

  if (/\bwhat do you (remember|know) about me\b|\bwhat have you saved\b|\bwhat are my (saved )?(requests|instructions|preferences)\b|\bwhat do you remember\b/.test(s)) {
    const sess = ctx.memories.filter((m) => m.scope === `session:${ctx.sessionId}`);
    const saved = ctx.memories.filter((m) => !m.scope?.startsWith('session:'));
    const lines = [
      ...(sess.length ? ['For this session:', ...sess.map((m) => `- ${m.content}`)] : []),
      ...(saved.length ? ['Saved for every session:', ...saved.map((m) => `- ${m.content}`)] : []),
    ];
    return { reply: lines.length ? lines.join('\n') : "I haven't saved anything yet. Tell me how you like to learn, and say \"always\" if you want me to remember it." };
  }

  if (/\bhow much (has|did|does|is) (this|it|today|this session|the session)( been)? cost|\bwhat (has|did) (this|the session) cost/.test(s)) {
    const usd = await sessionCost(ctx.sessionId);
    return { reply: `This session has cost $${usd.toFixed(usd < 0.1 ? 3 : 2)} so far (the AI and voice together).` };
  }

  if (RESUME.test(s) && s.split(' ').length <= 10) {
    const here = currentMain(ctx.sources);
    if (here) return { reply: `We're on ${here.ref}. It's open in the Sefer panel. Shall we keep going?` };
    const last = await lastPlace(ctx.sessionId).catch(() => null);
    if (!last) return { reply: "I don't have an earlier session to pick up from. What would you like to learn?" };
    const where = last.lastWords ? last.lastWords.replace(/\n+/g, ' ').replace(/[>*]/g, '').trim() : '';
    const tail = where ? (spoken ? '' : `\n\nWhere we stopped, I'd said: "${where.length > 240 ? where.slice(0, 240).replace(/\s+\S*$/, '') + '…' : where}"`) : '';
    return { reply: `Last time we were learning ${last.source.ref}. I've opened it again.${tail}\n\nWant to pick up from there?`.trim(), source: last.source };
  }

  // Line by line: "next line", or "yes" when the Chavrusa just asked whether to continue to the next line.
  const lastBotText = [...ctx.history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  if (NEXT_LINE.test(s) || (YES.test(s) && ASKED_NEXT.test(lastBotText.trim()))) {
    const r = await moveLine(ctx, 1);
    if (r) return r;
  }
  if (PREV_LINE.test(s) || /^(back|go back|previous|previous one|the previous one|last one)$/.test(s)) {
    const r = await moveLine(ctx, -1);
    if (r) return r;
  }
  // Plain "next": the next mishnah / pasuk / line, with its translation, for free. ("Continue" brings the AI in: the full formula.)
  if (/^(next|next one|the next one|next please|onward|onwards|forward|go on|keep going|moving on|move on)$/.test(s)) {
    const r = await moveLine(ctx, 1);
    if (r) return r;
  }

  const nav = s.match(NAV) ?? s.match(NAV2);
  if (nav) {
    const main = currentMain(ctx.sources);
    if (!main) return { reply: 'Which sefer are we in? Tell me the place (for example, "Berachos 36b") and I\'ll open it.' };
    const word = nav[nav.length - 1] as string;
    const dir: 1 | -1 = /\b(previous|prev|last|back)\b/.test(s) ? -1 : 1;
    // "Next mishnah" / "next pasuk": one step, like "next line".
    if (unitOf(word) === 'mishnah' || unitOf(word) === 'pasuk') {
      const r = await moveLine(ctx, dir);
      if (r) return r;
    }
    for (const ref of stepRef(main.ref, dir, unitOf(word))) {
      const src = await tryText(ref, ctx.approved);
      if (src) return { reply: openingReply(src, spoken), source: src };
    }
    return { reply: dir === 1 ? `That's the end of ${main.ref.replace(/\s\d.*$/, '')}.` : "We're already at the beginning." };
  }

  const comm = await openCommentary(ctx, s);
  if (comm) return comm;

  const style = styleSwitch(ctx, s);
  if (style) return style;

  const model = modelSwitch(s);
  if (model) {
    const p = { ...ctx.settings, ...model.settings } as Settings;
    return { ...model, reply: ctx.spoken ? 'Sure.' : `Now using ${MODELS[p.provider][p.tier].label}.` };
  }
  return null;
}
