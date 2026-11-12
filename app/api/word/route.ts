import { NextRequest, NextResponse } from 'next/server';
import { stripNikud } from '@/lib/hebrew';

export const runtime = 'nodejs';

// Tap a word for its meaning (Settings → Extras → Word meanings): Sefaria's dictionary lookup, the entries from the
// dictionaries that are free to use: Jastrow (1903, for the Gemara, Targum and Midrash) and Brown-Driver-Briggs
// (1906, for Tanach). No AI, so it costs nothing. Klein (a modern dictionary, under copyright) is left out.
const OK = /^Jastrow Dictionary$/; // Nov 11: Brown-Driver-Briggs removed (written by Christian Bible scholars)
const NAME = (_l: string) => 'Jastrow';

type Sense = { definition?: string; senses?: Sense[]; number?: string };
type Entry = { headword?: string; parent_lexicon?: string; content?: { morphology?: string; senses?: Sense[] } };

const clean = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function flat(senses: Sense[] | undefined, out: string[] = []): string[] {
  for (const s of senses ?? []) {
    if (s.definition) { const d = clean(s.definition); if (d) out.push(d); }
    flat(s.senses, out);
    if (out.length >= 12) break;
  }
  return out;
}

// The meaning in a few words: the first sense, up to its first stop, without the references Jastrow lists after it.
function shortOf(senses: string[]): string {
  for (const s0 of senses) {
    const s = s0.replace(/\s*\[[^\]]*\]/g, '').replace(/^[\d.)\s—-]+/, '').trim();
    const cut = s.search(/[;:]|\.\s|\s(?:Gen|Ex|Lev|Num|Deut|Targ|Y\.|B\.|Ber|Shabb|Ab\. Zar|Sabb|Pes|Yoma|Keth|Gitt|Kidd|B\. Kam|B\. Mets|B\. Bath|Sanh|Men|Hull|Nidd|Bets|Erub|Meg|Taan|Succ|Yeb|Sot|Ned|Naz|Shebu|Ab|Zeb|Bekh|Ker|Tem|Ar|Tosef|Sifra|Sifre|Mekh|Pesik|Midr|Lam|Koh|Ruth|Esth|Cant|Prov|Ps|Job|Is|Jer|Ez|Dan|Ezra|Neh|Chr)\b/);
    const t = (cut > 3 ? s.slice(0, cut) : s).replace(/[,\s]+$/, '').trim();
    if (t.length >= 2) return t.length > 140 ? `${t.slice(0, 140)}…` : t;
  }
  return '';
}

async function look(w: string, ref: string): Promise<Entry[]> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const r = await fetch(`https://www.sefaria.org/api/words/${encodeURIComponent(w)}${ref ? `?lookup_ref=${encodeURIComponent(ref)}` : ''}`, { signal: ac.signal, next: { revalidate: 60 * 60 * 24 * 30 } } as RequestInit);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d.filter((e: Entry) => OK.test(e.parent_lexicon ?? '')) : [];
  } catch { return []; } finally { clearTimeout(t); }
}

// GET ?w=דמפרשינן&ref=Yoma 6a:11
export async function GET(req: NextRequest) {
  const raw = String(req.nextUrl.searchParams.get('w') ?? '');
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').slice(0, 120);
  const w = stripNikud(raw).replace(/[^א-ת"'״׳]/g, '').replace(/^["'״׳]+|["'״׳]+$/g, '');
  if (!w || w.length > 30) return NextResponse.json({ word: raw, entries: [] });
  let found = await look(w, ref);
  // Not found: try without a prefix letter or two (ו, ד, ב, ל, מ, ש, ה, כ), as a learner would.
  for (let k = 1; !found.length && k <= 2 && w.length - k >= 2; k++) {
    if (!/^[ודבלמשהכ]+$/.test(w.slice(0, k))) break;
    found = await look(w.slice(k), ref);
  }
  // The same entry can come back more than once (found through different forms): keep each once.
  const seen = new Set<string>();
  found = found.filter((e) => { const k = `${e.parent_lexicon}|${e.headword}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const entries = found.slice(0, 5).map((e) => ({
    headword: e.headword ?? '', dictionary: NAME(e.parent_lexicon ?? ''), morphology: clean(e.content?.morphology ?? ''),
    senses: [...new Set(flat(e.content?.senses))].map((s) => (s.length > 600 ? `${s.slice(0, 600)}…` : s)),
  })).filter((e) => e.senses.length).map((e) => ({ ...e, short: shortOf(e.senses) }));
  return NextResponse.json({ word: w, entries }, { headers: { 'Cache-Control': 'private, max-age=86400' } });
}
