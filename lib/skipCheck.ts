// Did the voice read all of the text it was handed? The app hears what the voice says (its own transcript), so after it
// reads, the text it was given is compared with what it said. The English words are the sure sign (the transcript of
// lashon kodesh can come back in Hebrew letters or in English spelling, so it is used only when it is in Hebrew
// letters). When the end of the text clearly never came out, this returns the part that was left out, to be read now.
// Careful by design: when unsure, it says nothing (a false alarm, re-reading what was already read, is worse).

const STOP = new Set('the and of to in that is he it for with as his they this from by be on not are was but one all who what said says him her she them their there then than when which will would shall have has had you your we our us its into upon unto also any may can do does did so if or an at no yes'.split(' '));
const NIKUD = /[֑-ׇ]/g;

const enWords = (t: string) => (t.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? []).map((w) => w.replace(/'s$/, '')).filter((w) => !STOP.has(w));
const heWords = (t: string) => (t.replace(NIKUD, '').match(/[א-ת]{2,}/g) ?? []).map((w) => w.replace(/[ךםןףץ]$/, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' } as Record<string, string>)[c]));

// How much of a piece was heard: 0..1, or null when it can't be told (lashon kodesh with no Hebrew in the transcript).
// Words are looked for in order, from where the last heard piece ended, so a word that comes again later in the text
// ("ways… two ways") isn't counted as heard from its first time.
type Said = { en: string[]; he: string[] | null; atEn: number; atHe: number };
function heardShare(piece: string, said: Said): { share: number; endEn: number; endHe: number } | null {
  const look = (words: string[], from: string[], at: number) => {
    let found = 0, end = at;
    for (const w of words) { const k = from.indexOf(w, at); if (k >= 0 && k < at + 40) { found++; end = Math.max(end, k + 1); } }
    return { share: found / words.length, end };
  };
  const en = enWords(piece);
  if (en.length >= 2) { const r = look(en, said.en, said.atEn); return { share: r.share, endEn: r.end, endHe: said.atHe }; }
  const he = heWords(piece);
  if (he.length >= 2 && said.he) { const r = look(he, said.he, said.atHe); return { share: r.share, endEn: said.atEn, endHe: r.end }; }
  return null;
}

/** The text handed to the voice (the words inside ⟪ ⟫, phrases joined by " … ") and what it actually said.
 *  Returns the left-out end of the text (in the same form, ready to hand back), or null if nothing clear is missing. */
export function missingTail(text: string, said: string): string | null {
  const pieces = text.split(/\s*…\s*/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length < 2 || !said.trim()) return null;
  const heSaid = heWords(said);
  const st: Said = { en: enWords(said), he: heSaid.length >= 3 ? heSaid : null, atEn: 0, atHe: 0 };
  const share: (number | null)[] = [];
  let last = -1; // the last piece that clearly came out
  pieces.forEach((p, i) => {
    const r = heardShare(p, st);
    share.push(r ? r.share : null);
    if (r && r.share >= 0.5) { last = i; st.atEn = r.endEn; st.atHe = r.endHe; }
  });
  if (last < 0) return null;                    // nothing recognizable: can't tell (maybe the learner cut in)
  const tail = pieces.slice(last + 1);
  const tailShare = share.slice(last + 1);
  const known = tailShare.filter((s): s is number => s !== null);
  // Only a clear miss: at least two pieces we can judge after it, none of them heard, and a real amount of text.
  if (known.length < 2 || known.some((s) => s >= 0.25)) return null;
  const words = tail.join(' ').split(/\s+/).length;
  if (words < 6) return null;
  // The miss starts with the English of a lashon kodesh phrase that was read: read that phrase again with it.
  const isHe = (p: string) => !/[A-Za-z]/.test(p);
  if (!isHe(tail[0]) && isHe(pieces[last])) tail.unshift(pieces[last]);
  return tail.join(' … ');
}
