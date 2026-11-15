// Pure rules for deciding whether a source may be quoted. No network or database calls here,
// so the rules are easy to read, test, and change.

// Commentaries Sefaria names without "X on Y" (Mishnah Berurah 239:1, Magen Avraham 239:1…): treat them as
// commentaries, so the text we're learning stays the Shulchan Aruch / Chumash they comment on.
export const COMMENTARY_BOOK = /^(Mishnah Berurah|Magen Avraham|Turei Zahav|Siftei Kohen|Biur Halacha|Sha'ar HaTziyun|Ba'?er Hetev|Be'?er Hetev|Kaf HaChayim|Kaf HaChaim|Sha'arei Teshuvah|Pri Megadim|Machatzit HaShekel|Be'er HaGolah|Pithei Teshuva|Pitchei Teshuvah|Kesef Mishneh|Maggid Mishneh|Hagahot Maimoniyot|Mesorat HaShas)\b/i;

import { CLASSIC_CUTOFF_YEAR } from './config';

export interface ApprovedEntry { kind: 'work' | 'author' | 'translation' | 'site'; name: string; status: 'approved' | 'blocked'; lean: string }

export interface IndexInfo {
  title: string;
  categories: string[];
  authors: string[];          // author names and/or slugs
  year: number | null;        // earliest composition year, if known
}

// Always blocked, even with "Allow all" (review, Nov 11): academic, critical or non-Orthodox works and authors that
// Sefaria carries. Your own list (Settings, the approved sources) can block more; it can't unblock these. A rav
// should still review the full list.
export const ALWAYS_BLOCKED: ApprovedEntry[] = [
  ...['Cassuto', 'A New Israeli Commentary', 'Brown-Driver-Briggs', 'BDB', 'Klein Dictionary', 'The Torah: A Modern Commentary', 'Siddur Sim Shalom', "Mishkan T'filah", 'Kol Haneshamah', 'Lev Shalem', 'Legends of the Jews', 'Plaut']
    .map((name) => ({ kind: 'work' as const, name, status: 'blocked' as const, lean: 'academic or non-Orthodox' })),
  ...['Umberto Cassuto', 'Abraham Cohen', 'Abraham Joshua Heschel', 'Mordecai Kaplan', 'Martin Buber', 'Franz Rosenzweig', 'Hermann Cohen', 'Solomon Schechter', 'Louis Ginzberg', 'Gunther Plaut', 'Arthur Green', 'Zalman Schachter-Shalomi', 'Elliot Dorff', 'Shmuel Safrai', 'Francis Brown', 'Samuel Rolles Driver', 'Charles Augustus Briggs', 'Ernest Klein', 'Saul Lieberman', 'Joshua Kulp', 'Zeev Safrai', 'Everett Fox', 'Hayim Nahman Bialik', 'Eliezer Ben Yehuda', 'Naphtali Herz Wessely', 'Nachman Krochmal', 'Philo of Alexandria', 'Josephus', 'Yariv Ben Aharon']
    .map((name) => ({ kind: 'author' as const, name, status: 'blocked' as const, lean: 'academic or non-Orthodox' })),
  // Nov 14: the learner asked to drop Peninei Halakhah (Rav Eliezer Melamed, Religious Zionist).
  ...['Peninei Halakhah', 'Peninei Halakha'].map((name) => ({ kind: 'work' as const, name, status: 'blocked' as const, lean: 'not in the learner\'s path' })),
  { kind: 'author' as const, name: 'Eliezer Melamed', status: 'blocked' as const, lean: 'not in the learner\'s path' },
];

// Women authors (Nov 14: the learner asked that nothing written by women be used), blocked even if approved by mistake.
// Modern works are blocked anyway unless approved (below); this covers older ones and any approved by accident.
export const WOMEN_AUTHORS = ['Nechama Leibowitz', 'Nehama Leibowitz', 'Glückel of Hameln', 'Gluckel of Hameln', 'Glikl', 'Sarah Rebecca Rachel Leah Horowitz', 'Leah Horowitz', 'Rachel Bluwstein', 'Judith Plaskow', 'Tamar Ross', 'Rachel Adler', 'Blu Greenberg', 'Avivah Gottlieb Zornberg', 'Aviva Zornberg', 'Ruth Calderon', 'Tova Hartman', 'Bonna Devora Haberman', 'Malka Simkovich', 'Dvora Weisberg', 'Rivka Ulmer', 'Chana Kasachkoff', 'Sarah Schenirer', 'Lea Goldberg', 'Esther Jungreis', 'Hannah Senesh', 'Henrietta Szold', 'Emma Lazarus', 'Rachel Elior', 'Ilana Pardes', 'Tikva Frymer-Kensky', 'Adele Berlin', 'Ellen Frankel', 'Sandy Eisenberg Sasso', 'Danya Ruttenberg', 'Elana Stein Hain', 'Tamar Biala', 'Erica Brown', 'Deena Zimmerman', 'Michal Tikochinsky', 'Chana Safrai', 'Judith Hauptman', 'Simi Peters', 'Susan Handelman', 'Tamar Weissman', 'Tamara Cohn Eskenazi', 'Nehama Weingarten Mintz', 'Yoatzot Halakhah']
  .map((name) => ({ kind: 'author' as const, name, status: 'blocked' as const, lean: 'written by a woman' }));

// Works written after 1900 that are in the Orthodox, yeshiva path and may be used without asking (Nov 14). Every other
// modern work, and anything Sefaria files as modern, needs the learner's (or his rav's) approval — even with "Allow
// all", which now covers only the classic seforim.
export const ORTHODOX_MODERN: ApprovedEntry[] = [
  ...['Mishnah Berurah', 'Biur Halacha', "Sha'ar HaTziyun", 'Arukh HaShulchan', 'Aruch HaShulchan', 'Kaf HaChayim', 'Kaf HaChaim', 'Ben Ish Hai', 'Ben Ish Chai', 'Chafetz Chaim', 'Shemirat HaLashon', 'Ahavat Chesed', 'Igrot Moshe', 'Iggrot Moshe', 'Chazon Ish', 'Sefat Emet', 'Sfat Emet', 'Shem MiShmuel', 'Meshekh Chokhmah', 'Meshech Chochmah', 'Or Sameach', 'Ohr Sameach', 'Chiddushei Rabbi Chaim', 'Kovetz Shiurim', 'Kovetz Ha\'arot', 'Michtav MeEliyahu', 'Torah Temimah', 'Netivot Shalom', 'Avnei Nezer', 'Steinsaltz', 'Kehati', 'Mishnah Yomit', 'Sifrei Zuta', 'Koren Shalem Siddur']
    .map((name) => ({ kind: 'work' as const, name, status: 'approved' as const, lean: 'Orthodox (built in)' })),
  ...['Yisrael Meir Kagan', 'Moshe Feinstein', 'Avraham Yeshayahu Karelitz', 'Yehudah Aryeh Leib Alter', 'Shmuel Bornsztain', 'Meir Simcha of Dvinsk', 'Chaim Soloveitchik', 'Elchonon Wasserman', 'Eliyahu Eliezer Dessler', 'Baruch Epstein', 'Adin Even-Israel Steinsaltz', 'Adin Steinsaltz', 'Pinhas Kehati', 'Yaakov Chaim Sofer', 'Yosef Chaim of Baghdad', 'Yechiel Michel Epstein', 'Israel Meir Kagan', 'Barukh HaLevi Epstein', 'Barukh Epstein', 'Yosef Hayyim', 'Solomon Sirilio', 'Abraham Isaac HaCohen Kook', 'Avraham Yitzchak HaKohen Kook', 'Jonathan Sacks']
    .map((name) => ({ kind: 'author' as const, name, status: 'approved' as const, lean: 'Orthodox (built in)' })),
];

// A marker in the approved list meaning "allow every sefer" (from Settings).
export const ALL_WORKS = '__all_sefaria__';

export interface Verdict { allowed: boolean; reason: string; lean: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9א-ת]+/g, ' ').trim();

function matches(entryName: string, candidate: string): boolean {
  const a = norm(entryName), b = norm(candidate);
  return a.length > 0 && b.length > 0 && (a === b || b.includes(a));
}

// Categories that are always classic (foundational texts), regardless of metadata.
const CLASSIC_ROOTS = ['Tanakh', 'Mishnah', 'Talmud', 'Tosefta', 'Midrash', 'Targum'];

// Categories Sefaria uses for modern or reference material, never approved as a group.
const MODERN_MARKERS = ['Modern', 'Contemporary', 'Reference', 'Second Temple', 'Dictionary', 'Academic', 'Translations'];

export function judgeWork(info: IndexInfo, list: ApprovedEntry[]): Verdict {
  const works = list.filter((e) => e.kind === 'work');
  const authors = list.filter((e) => e.kind === 'author');

  // 1. Blocked always wins.
  const blockedWork = works.find((e) => e.status === 'blocked' && matches(e.name, info.title));
  if (blockedWork) return { allowed: false, reason: `"${info.title}" is on the blocked list.`, lean: blockedWork.lean };
  const blockedAuthor = authors.find((e) => e.status === 'blocked' && info.authors.some((a) => matches(e.name, a)));
  if (blockedAuthor) return { allowed: false, reason: `The author of "${info.title}" is on the blocked list.`, lean: blockedAuthor.lean };

  // 2. Explicitly approved work or author (the learner's list, then the built-in Orthodox modern list).
  const okWork = works.find((e) => e.status === 'approved' && e.name !== ALL_WORKS && matches(e.name, info.title));
  if (okWork) return { allowed: true, reason: 'Approved work.', lean: okWork.lean };
  const okAuthor = authors.find((e) => e.status === 'approved' && info.authors.some((a) => matches(e.name, a)));
  if (okAuthor) return { allowed: true, reason: 'Approved author.', lean: okAuthor.lean };

  const builtIn = ORTHODOX_MODERN.find((e) => (e.kind === 'work' ? matches(e.name, info.title) : info.authors.some((a) => matches(e.name, a))));
  if (builtIn) return { allowed: true, reason: 'Orthodox work (built in).', lean: builtIn.lean };
  const allowAll = works.some((e) => e.status === 'approved' && e.name === ALL_WORKS);

  // 3. Modern or reference categories need explicit approval.
  const oldReference = info.year !== null && info.year < CLASSIC_CUTOFF_YEAR && info.categories.some((c) => /Reference|Dictionar/.test(c))
    && !info.categories.some((c) => /Modern|Contemporary|Second Temple|Academic/.test(c));
  if (!oldReference && info.categories.some((c) => MODERN_MARKERS.some((m) => c.includes(m)))) {
    return { allowed: false, reason: `"${info.title}" is a modern work that is not on the approved list.`, lean: 'general' };
  }

  // 4. Foundational texts are approved as a group (commentaries on them are judged by date below).
  const isCommentary = info.categories.some((c) => /Commentary|Rishonim|Acharonim|Halakhah|Responsa|Chasidut|Musar|Jewish Thought|Kabbalah/.test(c));
  if (!isCommentary && CLASSIC_ROOTS.includes(info.categories[0] ?? '')) {
    return { allowed: true, reason: 'Foundational text.', lean: 'general' };
  }

  // 5. Classic by era: Sefaria files books under Rishonim / Acharonim / Geonim by the author's era, while the date it
  // gives is often only the first printing (Eshkol HaKofer, Gevurat Ari, Be'er Sheva "1906"…), so the era wins.
  if (isCommentary && info.categories.some((c) => /Rishonim|Acharonim|Geonim/.test(c))) {
    return { allowed: true, reason: 'Classic work (by era).', lean: 'general' };
  }
  // 6. Classic by date.
  if (info.year !== null) {
    if (info.year < CLASSIC_CUTOFF_YEAR) return { allowed: true, reason: 'Classic work.', lean: 'general' };
    return { allowed: false, reason: `"${info.title}" was written in ${info.year}, after ${CLASSIC_CUTOFF_YEAR}, and is not on the approved list.`, lean: 'general' };
  }

  // 6. Unknown date: allow if Sefaria files it under Rishonim/Acharonim-era categories, otherwise require approval.
  // Musar, Chasidut, Halakhah, Kabbalah and Liturgy on Sefaria are traditional works; modern ones are already caught by date above.
  if (info.categories.some((c) => /Rishonim|Acharonim|Geonim|Tannaim|Amoraim/.test(c)) || CLASSIC_ROOTS.includes(info.categories[0] ?? '') || /^(Musar|Chasidut|Halakhah|Kabbalah|Liturgy)$/.test(info.categories[0] ?? '')) {
    return { allowed: true, reason: 'Classic work (by category).', lean: 'general' };
  }
  // 7. "Allow all" (Settings): the rest — of unknown date and not filed as modern.
  if (allowAll) return { allowed: true, reason: 'All classic Sefaria seforim allowed (Settings).', lean: 'general' };
  return { allowed: false, reason: `Could not confirm that "${info.title}" is a classic work, and it is not on the approved list.`, lean: 'general' };
}

export function translationApproved(versionTitle: string | null | undefined, list: ApprovedEntry[]): boolean {
  if (!versionTitle) return false;
  const entries = list.filter((e) => e.kind === 'translation');
  if (entries.some((e) => e.status === 'blocked' && matches(e.name, versionTitle))) return false;
  return entries.some((e) => e.status === 'approved' && matches(e.name, versionTitle));
}

// Pull the earliest year out of Sefaria's compDate / era fields.
export function parseYear(compDate: unknown): number | null {
  const nums: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && isFinite(v)) nums.push(v);
    else if (typeof v === 'string') { const m = v.match(/-?\d{3,4}/); if (m) nums.push(Number(m[0])); }
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(compDate);
  return nums.length ? Math.min(...nums) : null;
}

// Among approved translations, prefer plain modern English. Some approved ones (e.g. the Koren Jerusalem Bible)
// use old-fashioned English ("thou", "hath", "unto"), so they are used only when nothing better exists.
const MODERN_FIRST = ['Metsudah', 'William Davidson', 'Steinsaltz'];
const OLD_STYLE = ['Koren Jerusalem Bible', 'JPS 1917', 'Rosenbaum and A.M. Silbermann'];
/** Order for choosing among a text's English translations (Nov 15, the learner: a translation is just a translation —
 *  it need not pass the seforim rules; the rules only decide which comes first): approved ones, then the rest, then
 *  ones on the blocked list; within each, plain modern English before old-style. */
export function translationOrder(versionTitle: string | null | undefined, list: ApprovedEntry[]): number {
  const entries = list.filter((e) => e.kind === 'translation');
  const tier = versionTitle && entries.some((e) => e.status === 'blocked' && matches(e.name, versionTitle)) ? 2
    : translationApproved(versionTitle, list) ? 0 : 1;
  return tier * 10 + translationRank(versionTitle);
}

export function translationRank(versionTitle: string | null | undefined): number {
  if (!versionTitle) return 9;
  if (MODERN_FIRST.some((n) => matches(n, versionTitle))) return 0;
  if (OLD_STYLE.some((n) => matches(n, versionTitle))) return 2;
  return 1;
}

// Old-fashioned English that a learner today should not have to wade through.
export function isArchaic(text: string): boolean {
  return /\b(thou|thee|thy|thine|hath|doth|ye|unto|shalt|hast|dost|wilt|saith|art thou)\b/i.test(text);
}
