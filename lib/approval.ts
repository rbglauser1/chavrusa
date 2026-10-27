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

  // 1b. The learner chose to allow every sefer on Sefaria (Settings).
  if (works.some((e) => e.status === 'approved' && e.name === ALL_WORKS)) return { allowed: true, reason: 'All Sefaria seforim allowed (Settings).', lean: 'general' };

  // 2. Explicitly approved work or author.
  const okWork = works.find((e) => e.status === 'approved' && matches(e.name, info.title));
  if (okWork) return { allowed: true, reason: 'Approved work.', lean: okWork.lean };
  const okAuthor = authors.find((e) => e.status === 'approved' && info.authors.some((a) => matches(e.name, a)));
  if (okAuthor) return { allowed: true, reason: 'Approved author.', lean: okAuthor.lean };

  // 3. Modern or reference categories need explicit approval.
  if (info.categories.some((c) => MODERN_MARKERS.some((m) => c.includes(m)))) {
    return { allowed: false, reason: `"${info.title}" is a modern work that is not on the approved list.`, lean: 'general' };
  }

  // 4. Foundational texts are approved as a group (commentaries on them are judged by date below).
  const isCommentary = info.categories.some((c) => /Commentary|Rishonim|Acharonim|Halakhah|Responsa|Chasidut|Musar|Jewish Thought|Kabbalah/.test(c));
  if (!isCommentary && CLASSIC_ROOTS.includes(info.categories[0] ?? '')) {
    return { allowed: true, reason: 'Foundational text.', lean: 'general' };
  }

  // 5. Classic by date.
  if (info.year !== null) {
    if (info.year < CLASSIC_CUTOFF_YEAR) return { allowed: true, reason: 'Classic work.', lean: 'general' };
    return { allowed: false, reason: `"${info.title}" was written in ${info.year}, after ${CLASSIC_CUTOFF_YEAR}, and is not on the approved list.`, lean: 'general' };
  }

  // 6. Unknown date: allow if Sefaria files it under Rishonim/Acharonim-era categories, otherwise require approval.
  // Musar, Chasidut, Halakhah, Kabbalah and Liturgy on Sefaria are traditional works; modern ones are already caught by date above.
  if (info.categories.some((c) => /Rishonim|Acharonim|Geonim|Tannaim|Amoraim/.test(c)) || CLASSIC_ROOTS.includes(info.categories[0] ?? '') || /^(Musar|Chasidut|Halakhah|Kabbalah|Liturgy)$/.test(info.categories[0] ?? '')) {
    return { allowed: true, reason: 'Classic work (by category).', lean: 'general' };
  }
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
