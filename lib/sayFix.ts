// The text the voice reads aloud comes from the sefer, never from the AI's own copy.
// In a spoken turn the brain marks what to read in a [[say]] … [[/say]] block: short phrases of the lashon kodesh
// (in Hebrew letters, copied from the text) each with its English, separated by " | ". Before anything goes to the
// voice, the app (1) finds those phrases in the real text, (2) checks that every word of the line (or of the part of a
// long line) is covered, in order, and (3) writes each phrase out in the app's own yeshivish transliteration from the
// real text with its vowels. If the brain skipped or changed anything, the whole
// piece is read from the sefer instead (the Hebrew, then its approved English). Free, no AI.
import { isHebrewLetters, namesForSpeechEn, voiceHe, type HeRead } from './hebrew';
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
let MODE: HeRead = 'join-kh'; // how the voice gets the lashon kodesh (set by fixSay)
const say = (he: string) => (isHebrewLetters(MODE) ? voiceHe(he, MODE) : he.split(/\s+/).filter(Boolean).map((w) => labelOf(w) ?? voiceHe(w, MODE)).filter(Boolean).join(' '));
const line = (he: string, en: string) => `${say(he)}${en ? ` — ${namesForSpeechEn(en)}` : ''}`;

/** Rebuild one [[say]] body from the real text, or null if its phrases can't be found in these sections. */
export function fixSayBody(body: string, sections: Section[], expect?: Expect | null): { out: string; how: string; last: Expect } | null {
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
    // Runs of words the brain left out.
    const runs: [number, number][] = [];
    for (let i = spanLo; i <= spanHi; i++) {
      if (covered.has(i)) continue;
      const r = runs[runs.length - 1];
      if (r && r[1] === i - 1) r[1] = i; else runs.push([i, i]);
    }
    const words = (a: number, b: number) => toks.slice(a, b + 1).map((t) => t.raw).join(' ');
    let out: string, how: string;
    if (!runs.length) {
      // Every word read: the brain's phrasing and English, with the real words and the yeshivish pronunciation.
      out = ranges.map((r) => line(words(r.lo, r.hi), r.en)).join(' | ');
      how = `exact, ${ranges.length} phrase${ranges.length > 1 ? 's' : ''}`;
    } else if (runs.every(([a, b]) => b - a + 1 <= 3)) {
      // A word or three missing here and there: put them back into the phrase next to them (keeps phrase by phrase).
      const rs = ranges.map((r) => ({ ...r }));
      for (const [a, b] of runs) {
        const k = rs.findIndex((r) => r.lo > b);
        if (k === 0) rs[0].lo = Math.min(rs[0].lo, a);
        else { const j = k === -1 ? rs.length - 1 : k - 1; rs[j].hi = Math.max(rs[j].hi, b); }
      }
      out = rs.map((r) => line(words(r.lo, r.hi), r.en)).join(' | ');
      how = `patched, ${ranges.length} phrases; put back: ${runs.map(([a, b]) => words(a, b)).join(' / ')}`;
    } else {
      // Something real was skipped or changed: read those whole pieces from the sefer (the Hebrew, then its English).
      out = pieces.slice(fromP, toP + 1).map((pc) => line(pc.he, pc.en)).join(' | ');
      how = `whole piece from the sefer; the brain left out: ${runs.map(([a, b]) => words(a, b)).join(' / ').slice(0, 300)}`;
    }
    const lp = pieces[toP];
    return { out: lead && !out.startsWith(lead) ? `${lead} | ${out}` : out, how: `${sec.base} line ${pieces[fromP].line + 1}${pieces[fromP].parts > 1 ? `.${pieces[fromP].part}` : ''}–${lp.line + 1}${lp.parts > 1 ? `.${lp.part}` : ''}: ${how}`, last: { base: sec.base, n: lp.line + 1, ...(lp.parts > 1 ? { part: lp.part } : {}) } };
  }
  return null;
}

/** Every [[say]] block in a spoken reply, made exact from the real text. A block that can't be found in the text keeps
 *  only its English (the voice never gets Hebrew letters to guess at). */
export function fixSay(reply: string, sections: Section[], expect?: Expect | null, mode: HeRead = 'join-kh'): { text: string; fixed: number; unmatched: number; last: Expect | null; notes: string[] } {
  MODE = mode;
  let fixed = 0, unmatched = 0, first = true;
  const notes: string[] = [];
  let last: Expect | null = null;
  const text = reply.replace(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/gi, (all, body: string) => {
    const out = fixSayBody(body, sections, first ? expect : null);
    first = false;
    if (out) { fixed++; last = out.last; notes.push(out.how); return `[[say]]${out.out}[[/say]]`; }
    if (!/[\u05D0-\u05EA]/.test(body)) return all; // already spelled out (an older reply): leave it
    unmatched++;
    notes.push(`not found in the text (English only): ${body.slice(0, 120)}`);
    const en = body.split('|').map((p) => p.replace(/^[^—–]*[—–]\s*/, '').replace(/[\u0590-\u05FF"׳״]+/g, '').trim()).filter(Boolean).join(' ');
    return en;
  });
  return { text, fixed, unmatched, last, notes };
}

/** The piece that comes right after where the learner is (the next line, or the next part of a long line), or null at the
 *  end of the section. The app, not the brain, decides what "go on" reads. */
export function nextPiece(sec: Section, at: { n: number; part?: number }): { n: number; part?: number; he: string; en: string } | null {
  const { pieces } = tokens(sec);
  const i = pieces.findIndex((pc) => pc.line === at.n - 1 && (at.part ? pc.part === at.part : pc.part === pc.parts));
  const nx = at.n === 0 ? pieces[0] : i >= 0 ? pieces[i + 1] : null; // n 0: the start of the section
  return nx ? { n: nx.line + 1, ...(nx.parts > 1 ? { part: nx.part } : {}), he: nx.he, en: nx.en } : null;
}
