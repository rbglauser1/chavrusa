// The text the voice reads aloud comes from the sefer, never from the AI's own copy.
// In a spoken turn the brain marks what to read in a [[say]] … [[/say]] block: short phrases of the lashon kodesh
// (in Hebrew letters, copied from the text) each with its English, separated by " | ". Before anything goes to the
// voice, the app (1) finds those phrases in the real text, (2) checks that every word of the line (or of the part of a
// long line) is covered, in order, and (3) writes each phrase out in the app's own yeshivish transliteration from the
// real text with its vowels, with the stressed syllable marked. If the brain skipped or changed anything, the whole
// piece is read from the sefer instead (the Hebrew, then its approved English). Free, no AI.
import { namesForSpeech, namesForSpeechEn, yeshivishTranslit } from './hebrew';
import { splitPieces } from './pieces';

export interface Section { base: string; he: string[]; en: string[] }
interface Tok { line: number; raw: string; key: string; piece: number }

const key = (w: string) => w.replace(/[^א-ת]/g, '');
const split = (t: string) => t.split(/[\s־]+/).filter((w) => key(w));

function tokens(sec: Section): { toks: Tok[]; pieces: { start: number; end: number; he: string; en: string }[] } {
  const toks: Tok[] = [];
  const pieces: { start: number; end: number; he: string; en: string }[] = [];
  sec.he.forEach((line, li) => {
    for (const p of splitPieces(line ?? '', sec.en[li] ?? '')) {
      const start = toks.length;
      for (const w of split(p.he)) toks.push({ line: li, raw: w, key: key(w), piece: pieces.length });
      if (toks.length > start) pieces.push({ start, end: toks.length - 1, he: p.he, en: p.en });
    }
  });
  return { toks, pieces };
}

// Find one phrase's words in the text from `from` on: its first word, then the rest close behind (small slips allowed).
function find(toks: Tok[], words: string[], from: number, anywhere: boolean): { at: number[] } | null {
  let best: number[] | null = null;
  const lastStart = anywhere ? toks.length - 1 : Math.min(toks.length - 1, from + 40);
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

const say = (he: string) => yeshivishTranslit(namesForSpeech(he), true);

/** Rebuild one [[say]] body from the real text, or null if its phrases can't be found in these sections. */
export function fixSayBody(body: string, sections: Section[]): string | null {
  const phrases = body.split('|').map((p) => {
    const m = p.match(/^([\s\S]*?)\s+[—–]\s+([\s\S]*)$/) ?? p.match(/^([\s\S]*?)\s+-\s+([\s\S]*)$/);
    return { he: (m ? m[1] : p).trim(), en: (m ? m[2] : '').trim() };
  }).filter((p) => p.he || p.en);
  if (!phrases.length || !phrases.some((p) => key(p.he))) return null;
  for (const sec of sections) {
    const { toks, pieces } = tokens(sec);
    if (!toks.length) continue;
    const phraseWords = phrases.map((p) => split(p.he).map(key));
    if (phraseWords.some((w) => !w.length)) continue;
    // Try every place the first phrase could start; keep the reading that matches the most words, then the tightest.
    const follow = (start: number) => {
      const out: { lo: number; hi: number; en: string }[] = [];
      let cursor = start, words = 0;
      for (let i = 0; i < phrases.length; i++) {
        const f = find(toks, phraseWords[i], cursor, false);
        if (!f) return null;
        const lo = Math.min(...f.at), hi = Math.max(...f.at);
        out.push({ lo, hi, en: phrases[i].en });
        words += f.at.length;
        cursor = hi + 1;
      }
      return { out, words, span: out[out.length - 1].hi - out[0].lo };
    };
    let best: { out: { lo: number; hi: number; en: string }[]; words: number; span: number } | null = null;
    for (let s0 = 0; s0 < toks.length; s0++) {
      if (toks[s0].key !== phraseWords[0][0]) continue;
      const r = follow(s0);
      if (r && (!best || r.words > best.words || (r.words === best.words && r.span < best.span))) best = r;
    }
    const ok = !!best;
    const ranges = best?.out ?? [];
    if (!ok || !ranges.length) continue;
    // The whole pieces the brain was reading: from the start of the first one to the end of the last one.
    const spanLo = pieces[toks[ranges[0].lo].piece].start;
    const spanHi = pieces[toks[ranges[ranges.length - 1].hi].piece].end;
    const covered = new Set<number>();
    ranges.forEach((r) => { for (let i = r.lo; i <= r.hi; i++) covered.add(i); });
    let missing = 0;
    for (let i = spanLo; i <= spanHi; i++) if (!covered.has(i)) missing++;
    if (!missing) {
      // Every word read: the brain's phrasing and English, with the real words and the yeshivish pronunciation.
      return ranges.map((r) => `${say(toks.slice(r.lo, r.hi + 1).map((t) => t.raw).join(' '))}${r.en ? ` — ${namesForSpeechEn(r.en)}` : ''}`).join(' | ');
    }
    // Something was skipped or changed: read those whole pieces from the sefer (the Hebrew, then its English).
    const fromP = toks[spanLo].piece, toP = toks[spanHi].piece;
    return pieces.slice(fromP, toP + 1).map((pc) => `${say(pc.he)}${pc.en ? ` — ${namesForSpeechEn(pc.en)}` : ''}`).join(' | ');
  }
  return null;
}

/** Every [[say]] block in a spoken reply, made exact from the real text (blocks that can't be matched stay as they are). */
export function fixSay(reply: string, sections: Section[]): { text: string; fixed: number; rebuilt: number } {
  let fixed = 0, rebuilt = 0;
  const text = reply.replace(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/gi, (all, body: string) => {
    const out = fixSayBody(body, sections);
    if (!out) return all;
    fixed++;
    if (!out.includes(' — ') || out.split('|').length !== body.split('|').length) rebuilt++;
    return `[[say]]${out}[[/say]]`;
  });
  return { text, fixed, rebuilt };
}
