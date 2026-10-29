import 'server-only';
import { ALL_WORKS, ApprovedEntry, IndexInfo, isArchaic, judgeWork, parseYear, translationApproved, translationRank, Verdict } from './approval';
import { SourceData } from './db';
import { yeshivishEnglish } from './hebrew';

const BASE = 'https://www.sefaria.org';
const enc = (ref: string) => encodeURIComponent(ref.trim().replace(/ /g, '_')).replace(/%2C/g, ',').replace(/%3A/g, ':');

async function getJson(url: string, init?: RequestInit, timeoutMs = 12_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Texts and book information rarely change, so plain lookups are kept in Vercel's shared cache for a week.
    const isGet = !init?.method || init.method === 'GET';
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      ...(isGet ? { next: { revalidate: url.includes('/api/calendars') ? 3600 : 604800 } } : { cache: 'no-store' as const }),
    } as RequestInit);
    if (!res.ok) throw new Error(`Sefaria returned ${res.status} for ${url.replace(BASE, '')}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Flatten Sefaria's nested text arrays into a list of lines.
// A version with no words at all counts as missing.
const nonEmpty = (lines: string[]) => (lines.some((l) => l.trim()) ? lines : []);

// Empty lines are kept (as ""), so the Hebrew and the English stay lined up line for line.
export function flatten(text: unknown): string[] {
  if (typeof text === 'string') return [text];
  if (Array.isArray(text)) return text.flatMap(flatten);
  return [];
}

// Sefaria's English marks the literal translation in bold and the added explanation in plain type.
// For display only, keep that as two private marks (B_ON … B_OFF); the AI and the voice get the plain text.
export const B_ON = '\u0002', B_OFF = '\u0003';
export function stripKeepBold(s: string): string {
  const t = stripHtml(s.replace(/<(b|strong)(\s[^>]*)?>/gi, B_ON).replace(/<\/(b|strong)>/gi, B_OFF));
  return t.replace(new RegExp(`${B_ON}\\s*${B_OFF}`, 'g'), '');
}
const hasBold = (lines: string[]) => lines.some((l) => l.includes(B_ON));

export function stripHtml(s: string): string {
  return s.replace(/<sup[^>]*>.*?<\/sup>/gi, '').replace(/<i class="footnote">.*?<\/i>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

// ---------- Index metadata (for approval) ----------
const indexCache = new Map<string, IndexInfo>();

export function bookTitleFromRef(ref: string): string {
  // "Rashi on Berakhot 2a:1:1" -> "Rashi on Berakhot"; "Shulchan Arukh, Orach Chayim 1:1" -> "Shulchan Arukh, Orach Chayim"
  return ref.replace(/[_]/g, ' ').replace(/\s+\d+[ab]?(?:[:.]\d+)*(?:-\S+)?\s*$/i, '').trim();
}

export async function indexInfo(title: string): Promise<IndexInfo> {
  const cached = indexCache.get(title);
  if (cached) return cached;
  let data: any;
  try {
    data = await getJson(`${BASE}/api/v2/raw/index/${enc(title)}`);
  } catch {
    data = await getJson(`${BASE}/api/v2/index/${enc(title)}`);
  }
  const authors: string[] = [];
  for (const a of Array.isArray(data?.authors) ? data.authors : []) {
    if (typeof a === 'string') authors.push(a.replace(/-/g, ' '));
    else if (a && typeof a === 'object') { if (a.en) authors.push(a.en); if (a.slug) authors.push(String(a.slug).replace(/-/g, ' ')); }
  }
  const info: IndexInfo = {
    title: data?.title ?? title,
    categories: Array.isArray(data?.categories) ? data.categories : [],
    authors,
    year: parseYear(data?.compDate) ?? parseYear(data?.pubDate),
  };
  indexCache.set(title, info);
  return info;
}

export async function judgeRef(ref: string, list: ApprovedEntry[], indexTitle?: string): Promise<Verdict & { title: string }> {
  const title = indexTitle ?? bookTitleFromRef(ref);
  try {
    const info = await indexInfo(title);
    return { ...judgeWork(info, list), title: info.title };
  } catch {
    // If we cannot read metadata, only allow it when the title itself is on the approved list.
    return { ...judgeWork({ title, categories: [], authors: [], year: null }, list), title };
  }
}

// ---------- Texts ----------
interface V3Version { text: unknown; language?: string; actualLanguage?: string; versionTitle?: string; direction?: string }

function pick(versions: V3Version[], lang: 'he' | 'en'): V3Version | undefined {
  return versions.find((v) => (lang === 'he'
    ? (v.direction === 'rtl' || v.language === 'he' || v.actualLanguage === 'he' || v.actualLanguage === 'arc')
    : (v.language === 'en' || v.actualLanguage === 'en')));
}

export async function getText(ref: string, list: ApprovedEntry[]): Promise<SourceData & { verdict: Verdict }> {
  const r = enc(ref);
  // Start the approval check at the same time as the text, instead of after it.
  const earlyVerdict = judgeRef(ref, list).catch(() => null);
  // The usual format (not text_only), so the bold in the English comes through; tags are cleaned here.
  const first = await getJson(`${BASE}/api/v3/texts/${r}?version=source&version=english`);
  const versions: V3Version[] = Array.isArray(first?.versions) ? first.versions : [];
  const heV = pick(versions, 'he') ?? versions.find((v) => v.versionTitle && !pick([v], 'en'));
  let enV = pick(versions, 'en');

  // Use only an approved translation, and among those prefer plain modern English (e.g. Metsudah over
  // the "thou / hath" style of the Koren Jerusalem Bible).
  // Sefaria's default English, kept aside if it isn't approved: the learner can see it (labeled) and approve it.
  const defaultEn = enV;
  if (!translationApproved(enV?.versionTitle, list)) enV = undefined;
  const available: { versionTitle?: string; language?: string; actualLanguage?: string }[] = Array.isArray(first?.available_versions) ? first.available_versions : [];
  const best = available
    .filter((v) => (v.language === 'en' || v.actualLanguage === 'en') && translationApproved(v.versionTitle, list))
    .sort((a, b) => translationRank(a.versionTitle) - translationRank(b.versionTitle))[0];
  if (best?.versionTitle && best.versionTitle !== enV?.versionTitle && translationRank(best.versionTitle) < translationRank(enV?.versionTitle)) {
    try {
      const second = await getJson(`${BASE}/api/v3/texts/${r}?version=${encodeURIComponent(`english|${best.versionTitle}`)}`);
      enV = pick(Array.isArray(second?.versions) ? second.versions : [], 'en') ?? enV;
    } catch { /* keep what we have */ }
  }

  const canonical: string = first?.ref ?? ref;
  const indexTitle = first?.indexTitle ?? first?.book;
  const early = await earlyVerdict;
  const verdict = early && (!indexTitle || early.title === indexTitle) ? early : await judgeRef(canonical, list, indexTitle);
  return {
    ref: canonical,
    heRef: first?.heRef ?? canonical,
    he: nonEmpty(flatten(heV?.text).map(stripHtml)),
    en: enV ? nonEmpty(flatten(enV.text).map(stripHtml).map(yeshivishEnglish)) : [],
    ...(() => {
      const src = enV ?? defaultEn;
      if (!src) return {};
      const b = flatten(src.text).map(stripKeepBold).map(yeshivishEnglish);
      return hasBold(b) ? { enB: b } : {};
    })(),
    translation: enV?.versionTitle ?? null,
    ...(!enV && defaultEn?.versionTitle && nonEmpty(flatten(defaultEn.text)).length
      ? { altEn: nonEmpty(flatten(defaultEn.text).map(stripHtml).map(yeshivishEnglish)), altTitle: defaultEn.versionTitle } : {}),
    archaic: enV ? isArchaic(flatten(enV.text).slice(0, 40).join(' ')) : false,
    url: `${BASE}/${enc(canonical)}`,
    verdict,
  };
}

// ---------- Connections ----------
export interface LinkItem { ref: string; category: string; title: string; anchor?: string }

export async function getLinks(ref: string, list: ApprovedEntry[], categories?: string[], max = 80): Promise<{ allowed: LinkItem[]; excluded: string[] }> {
  const data = await getJson(`${BASE}/api/links/${enc(ref)}?with_text=0`);
  const raw: any[] = Array.isArray(data) ? data : [];
  let items: LinkItem[] = raw.map((l) => ({
    ref: String(l.ref ?? l.sourceRef ?? ''),
    category: String(l.category ?? ''),
    title: String(l.collectiveTitle?.en ?? l.index_title ?? ''),
    index: String(l.index_title ?? ''),
    anchor: String(l.anchorRef ?? ''),
  })).filter((l) => l.ref) as (LinkItem & { index: string })[];
  if (categories?.length) {
    const want = categories.map((c) => c.toLowerCase());
    items = items.filter((l) => want.some((c) => l.category.toLowerCase().includes(c)));
  }

  // Judge each distinct book once (in parallel), drop anything not approved.
  // With "allow every sefer" on (and no blocked authors to check), no need to look each book up: much faster.
  const quick = list.some((e) => e.kind === 'work' && e.status === 'approved' && e.name === ALL_WORKS) && !list.some((e) => e.kind === 'author' && e.status === 'blocked');
  const books = [...new Set(items.map((l) => (l as any).index || bookTitleFromRef(l.ref)))].slice(0, quick ? 1000 : max > 80 ? 120 : 40);
  const verdicts = new Map<string, boolean>();
  await Promise.all(books.map(async (b) => verdicts.set(b, quick
    ? judgeWork({ title: b, categories: [], authors: [], year: null }, list).allowed
    : (await judgeRef(`${b} 1`, list, b)).allowed)));
  const allowed: LinkItem[] = [];
  const excluded = new Set<string>();
  for (const l of items) {
    const b = (l as any).index || bookTitleFromRef(l.ref);
    if (verdicts.get(b) === true) allowed.push({ ref: l.ref, category: l.category, title: l.title, anchor: l.anchor });
    else excluded.add(b);
  }
  return { allowed: allowed.slice(0, max), excluded: [...excluded] };
}

// ---------- Search ----------
export async function search(query: string, list: ApprovedEntry[], size = 12): Promise<{ ref: string; snippet: string }[]> {
  const data = await getJson(`${BASE}/api/search-wrapper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, type: 'text', size: size * 2, field: 'naive_lemmatizer', source_proj: true, filters: [], filter_fields: [] }),
  });
  const hits: any[] = data?.hits?.hits ?? [];
  const seen = new Set<string>();
  const out: { ref: string; snippet: string; book: string }[] = [];
  for (const h of hits) {
    const ref = h?._source?.ref;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const hl = h?.highlight ? Object.values(h.highlight).flat()[0] : '';
    out.push({ ref, snippet: stripHtml(String(hl ?? '')).slice(0, 200), book: h?._source?.index_title ?? bookTitleFromRef(ref) });
  }
  const results: { ref: string; snippet: string }[] = [];
  for (const r of out) {
    if (results.length >= size) break;
    if ((await judgeRef(r.ref, list, r.book)).allowed) results.push({ ref: r.ref, snippet: r.snippet });
  }
  return results;
}

// ---------- Resolve a name to a ref ----------
export async function resolveName(q: string): Promise<{ isRef: boolean; ref?: string; suggestions: string[] }> {
  const data = await getJson(`${BASE}/api/name/${encodeURIComponent(q)}?limit=8`);
  return {
    isRef: !!data?.is_ref,
    ref: data?.ref,
    suggestions: (Array.isArray(data?.completions) ? data.completions : []).slice(0, 8),
  };
}

// ---------- Today's learning (Daf Yomi, parsha, etc.) ----------
export async function todaysLearning(): Promise<{ title: string; display: string; ref: string }[]> {
  const data = await getJson(`${BASE}/api/calendars`);
  return (data?.calendar_items ?? []).map((c: any) => ({
    title: c?.title?.en ?? '', display: c?.displayValue?.en ?? '', ref: c?.ref ?? '',
  })).filter((c: { ref: string }) => c.ref);
}


// When a reference doesn't work: how is this book divided? Many seforim (Nefesh HaChayim, Kuzari, Shulchan Aruch…)
// have named parts, so their references look like "Nefesh HaChayim, Gate III 1" rather than "Nefesh HaChayim 3:1".
export async function bookOutline(ref: string): Promise<string | null> {
  const guess = bookTitleFromRef(ref).replace(/,.*$/, '').trim();
  const r = await resolveName(guess).catch(() => null);
  const titles = [...new Set([guess, ...(r?.suggestions ?? [])])].slice(0, 4);
  for (const t of titles) {
    let data: any = null;
    try { data = await getJson(`${BASE}/api/v2/raw/index/${enc(t)}`); } catch { continue; }
    if (!data?.title) continue;
    const nodeTitle = (n: any): string | null => n?.title ?? n?.titles?.find((x: any) => x.lang === 'en' && x.primary)?.text ?? null;
    const nodes: any[] = Array.isArray(data?.schema?.nodes) ? data.schema.nodes : [];
    if (!nodes.length) return `"${data.title}" uses references like "${data.title} 1:1" (chapter:section).`;
    const parts = nodes.map((n) => {
      const name = nodeTitle(n);
      const kids: any[] = Array.isArray(n?.nodes) ? n.nodes : [];
      return name ? (kids.length ? `${name} (subdivided: ${kids.map(nodeTitle).filter(Boolean).slice(0, 6).join(', ')})` : name) : null;
    }).filter(Boolean).slice(0, 14) as string[];
    const first = nodeTitle(nodes.find((n) => !/intro/i.test(nodeTitle(n) ?? '')) ?? nodes[0]);
    return `"${data.title}" is divided into named parts: ${parts.join('; ')}. A reference names the part, then the number: e.g. "${data.title}, ${first} 1".`;
  }
  return null;
}

// ---------- Library (Sefaria's table of contents) ----------
// The full table of contents is large, so it is also kept in memory for an hour.
let tocCache: { at: number; data: any[] } | null = null;
export async function sefariaToc(): Promise<any[]> {
  if (tocCache && Date.now() - tocCache.at < 3_600_000) return tocCache.data;
  const data = await getJson(`${BASE}/api/index`, { cache: 'no-store' } as RequestInit, 20_000);
  tocCache = { at: Date.now(), data: Array.isArray(data) ? data : [] };
  return tocCache.data;
}
export async function rawIndex(title: string): Promise<any> {
  return getJson(`${BASE}/api/v2/raw/index/${enc(title)}`);
}
// The index with the number of sections in each part (used when the plain index doesn't list lengths).
export async function indexWithCounts(title: string): Promise<any> {
  return getJson(`${BASE}/api/v2/index/${enc(title)}?with_content_counts=1`);
}
