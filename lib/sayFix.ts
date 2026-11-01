// The text the voice reads aloud comes from the sefer, never from the AI's own copy.
// In a spoken turn the brain marks what to read in a [[say]] … [[/say]] block: short phrases of the lashon kodesh
// (in Hebrew letters, copied from the text) each with its English, separated by " | ". Before anything goes to the
// voice, the app (1) finds those phrases in the real text, (2) checks that every word of the line (or of the part of a
// long line) is covered, in order, and (3) writes each phrase out in the app's own yeshivish transliteration from the
// real text with its vowels. If the brain skipped or changed anything, the whole
// piece is read from the sefer instead (the Hebrew, then its approved English). Free, no AI.
import { namesForSpeech, namesForSpeechEn, yeshivishTranslit } from './hebrew';
import { splitPieces } from './pieces';

export interface Section { base: string; he: string[]; en: string[] }
/** Where the learner is (the line, and part of a long line, he finished on), when he asked to go on. */
export interface Expect { base: string; n: number; part?: number }
interface Tok { line: number; raw: string; key: string; piece: number }
interface Pc { start: number; end: number; he: string; en: string; line: number; part: number; parts: number }

const key = (w: string) => w.replace(/[^\u05D0-\u05EA]/g, '');
const split = (t: string) => t.split(/[\s\u05BE]+/).filter((w) => key(w));
// Headings the brain may put in a block that aren't words of the text itself.
const LABELS: [RegExp, string][] = [[/^(גמרא|גמ|גמרה)$/, "g'mohrah"], [/^(מתני|מתניתין|משנה|משנא)$/, 'masnisin']];

function tokens(sec: Section): { toks: Tok[]; pieces: Pc[] } {
  const toks: Tok[] = [];
  const pieces: Pc[] = [];
  sec.he.forEach((line, li) => {
    const ps = splitPieces(line ?? '', sec.en[li] ?? '');
    ps.forEach((p, pi) => {
      const start = toks.length;
      for (const w of split(p.he)) toks.push({ line: li, raw: w, key: key(w), piece: pieces.length });
      if (toks.length > start) pieces.push({ start, end: toks.length - 1, he: p.he, en: p.en, line: li, part: pi + 1, parts: ps.length });
    });
  });
  return { toks, pieces };
}

// Find one phrase's words in the text from `from` on: its first word, then the rest close behind (small slips allowed).
function find(toks: Tok[], words: string[], from: number): { at: number[] } | null {
  let best: number[] | null = null;
  const lastStart = Math.min(toks.length - 1, from + 40);
  for (let s = from; s <= lastStart; s++) {
    if (toks[s].key !== words[0]) continue;
    const at = [s];
    let cur = s;
    for (let i = 1; i < words.length; i++) {
      for (let j = cur + 1; j <= Math.min(toks.length - 1, cur + 4); j++) if (toks[j].key === words[i]) { at.push(j); cur = j; break; }
    }
    if (!best || at.length > best.length) best = at;
    if (at.length === words.length) break;
  }
  return best && best.length >= Math.max(1, Math.ceil(words.length * 0.6)) ? { at: best } : null;
}

// Plain, joined spelling (hawishaw nikneis), the way the voice sounded most natural; the learner's spelling choice and
// word lists are applied on the way to the voice.
const labelOf = (w: string) => LABELS.find(([re]) => re.test(key(w)))?.[1] ?? null;
const say = (he: string) => he.split(/\s+/).filter(Boolean).map((w) => labelOf(w) ?? yeshivishTranslit(namesForSpeech(w), false)).filter(Boolean).join(' ');
const line = (he: string, en: string) => `${say(he)}${en ? ` — ${namesForSpeechEn(en)}` : ''}`;

/** Rebuild one [[say]] body from the real text, or null if its phrases can't be found in these sections. */
export function fixSayBody(body: string, sections: Section[], expect?: Expect | null): string | null {
  const all = body.split('|').map((p) => {
    const m = p.match(/^([\s\S]*?)\s+[—–]\s+([\s\S]*)$/) ?? p.match(/^([\s\S]*?)\s+-\s+([\s\S]*)$/);
    return { he: (m ? m[1] : p).trim(), en: (m ? m[2] : '').trim() };
  }).filter((p) => p.he || p.en);
  const label = (he: string) => { const k = split(he).map(key); return k.length === 1 ? LABELS.find(([re]) => re.test(k[0]))?.[1] ?? null : null; };
  const lead = all.length && label(all[0].he) ? label(all[0].he)! : '';
  const phrases = all.filter((p) => key(p.he) && !label(p.he));
  if (!phrases.length) return null;
  for (const sec of sections) {
    const { toks, pieces } = tokens(sec);
    if (!toks.length) continue;
    const phraseWords = phrases.map((p) => split(p.he).map(key));
    // Try every place the first phrase could start; keep the reading that matches the most words, then the tightest.
    // A short phrase that can't be found (one or two words) is let go; a longer one means this isn't the place.
    const follow = (start: number) => {
      const out: { lo: number; hi: number; en: string }[] = [];
      let cursor = start, words = 0;
      for (let i = 0; i < phrases.length; i++) {
        const f = find(toks, phraseWords[i], i === 0 ? start : cursor);
        if (!f) { if (i > 0 && phraseWords[i].length <= 2) continue; return null; }
        const lo = Math.min(...f.at), hi = Math.max(...f.at);
        out.push({ lo, hi, en: phrases[i].en });
        words += f.at.length;
        cursor = hi + 1;
      }
      return out.length ? { out, words, span: out[out.length - 1].hi - out[0].lo } : null;
    };
    let best: { out: { lo: number; hi: number; en: string }[]; words: number; span: number } | null = null;
    for (let s0 = 0; s0 < toks.length; s0++) {
      if (toks[s0].key !== phraseWords[0][0]) continue;
      const r = follow(s0);
      if (r && (!best || r.words > best.words || (r.words === best.words && r.span < best.span))) best = r;
    }
    if (!best) continue;
    const ranges = best.out;
    // The whole pieces the brain was reading: from the start of the first one to the end of the last one.
    let fromP = toks[ranges[0].lo].piece;
    const toP = toks[ranges[ranges.length - 1].hi].piece;
    // He asked to go on: the reading starts right after where he is. If the brain jumped ahead (skipping a piece or
    // a few), the skipped pieces are read too.
    if (expect && expect.base === sec.base) {
      const at = pieces.findIndex((pc) => pc.line === expect.n - 1 && (expect.part ? pc.part === expect.part : pc.part === pc.parts));
      const next = at >= 0 ? at + 1 : -1;
      if (next >= 0 && next < fromP && fromP - next <= 4) fromP = next;
    }
    const spanLo = pieces[fromP].start, spanHi = pieces[toP].end;
    const covered = new Set<number>();
    ranges.forEach((r) => { for (let i = r.lo; i <= r.hi; i++) covered.add(i); });
    toks.forEach((t, i) => { if (labelOf(t.raw)) covered.add(i); }); // a heading like גמ׳ in the text isn't a skipped word
    let missing = 0;
    for (let i = spanLo; i <= spanHi; i++) if (!covered.has(i)) missing++;
    const out = !missing
      // Every word read: the brain's phrasing and English, with the real words and the yeshivish pronunciation.
      ? ranges.map((r) => line(toks.slice(r.lo, r.hi + 1).map((t) => t.raw).join(' '), r.en)).join(' | ')
      // Something was skipped or changed: read those whole pieces from the sefer (the Hebrew, then its English).
      : pieces.slice(fromP, toP + 1).map((pc) => line(pc.he, pc.en)).join(' | ');
    return lead && !out.startsWith(lead) ? `${lead} | ${out}` : out;
  }
  return null;
}

/** Every [[say]] block in a spoken reply, made exact from the real text. A block that can't be found in the text keeps
 *  only its English (the voice never gets Hebrew letters to guess at). */
export function fixSay(reply: string, sections: Section[], expect?: Expect | null): { text: string; fixed: number; unmatched: number } {
  let fixed = 0, unmatched = 0, first = true;
  const text = reply.replace(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/gi, (all, body: string) => {
    const out = fixSayBody(body, sections, first ? expect : null);
    first = false;
    if (out) { fixed++; return `[[say]]${out}[[/say]]`; }
    if (!/[\u05D0-\u05EA]/.test(body)) return all; // already spelled out (an older reply): leave it
    unmatched++;
    const en = body.split('|').map((p) => p.replace(/^[^—–]*[—–]\s*/, '').replace(/[\u0590-\u05FF"׳״]+/g, '').trim()).filter(Boolean).join(' ');
    return en;
  });
  return { text, fixed, unmatched };
}
