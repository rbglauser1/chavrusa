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

// ── Skipped Hebrew ─────────────────────────────────────────────────────────────────────────────────────────────
// The voice's transcript gives lashon kodesh in English letters ("u'Tzricha… d'i ashma'inan kol shehu"), so a Hebrew
// phrase is looked for by its consonants: each Hebrew word and each transcript word is boiled down to a rough sound
// skeleton (צריכא and "u'Tzricha" both become ZRK), and a Hebrew word counts as said when a transcript word, in order,
// has nearly the same skeleton. The letters that are vowels or silent (א ה ע ו י) are left out, and ת may be "t" or "s".

const HE_SK: Record<string, string> = {
  ב: 'B', פ: 'B', ף: 'B', ג: 'G', ד: 'D', ז: 'Z', צ: 'Z', ץ: 'Z', ט: 'T', ת: 'X', ס: 'S', ש: 'S',
  כ: 'K', ך: 'K', ח: 'K', ק: 'K', ל: 'L', מ: 'M', ם: 'M', נ: 'N', ן: 'N', ר: 'R',
};
const heSkel = (w: string) => [...w.replace(NIKUD, '')].map((c) => HE_SK[c] ?? '').join('');
const latSkel = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '')
  .replace(/tz|ts/g, 'Z').replace(/sh|sch/g, 'S').replace(/ch|kh/g, 'K').replace(/ph/g, 'B')
  .replace(/[bvfp]/g, 'B').replace(/g/g, 'G').replace(/d/g, 'D').replace(/t/g, 'T').replace(/z/g, 'Z').replace(/s/g, 'S')
  .replace(/[ckqx]/g, 'K').replace(/l/g, 'L').replace(/m/g, 'M').replace(/n/g, 'N').replace(/r/g, 'R')
  .replace(/[a-z]/g, '').replace(/(.)\1+/g, '$1'); // vowels, h, y, w dropped; a doubled sound counted once
const same = (a: string, b: string) => a === b || (a === 'X' && (b === 'T' || b === 'S')) || (b === 'X' && (a === 'T' || a === 'S'));
function near(he: string, lat: string): boolean {
  if (!lat) return false;
  if (he.length <= 2) return he.length === lat.length && [...he].every((c, i) => same(c, lat[i]));
  // Edit distance, with ת matching "t" or "s".
  const d: number[][] = Array.from({ length: he.length + 1 }, (_, i) => Array.from({ length: lat.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= he.length; i++) for (let j = 1; j <= lat.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (same(he[i - 1], lat[j - 1]) ? 0 : 1));
  return 1 - d[he.length][lat.length] / Math.max(he.length, lat.length) >= 0.6;
}

/** The text handed to the voice (phrases joined by " … ", each "Hebrew — English" or Hebrew alone) and what it said.
 *  Returns the stretch of the text whose Hebrew clearly never came out (from the first such phrase to the last, in the
 *  same form, ready to hand back), or null when nothing clear is missing or it can't be told. */
export function missingHebrew(text: string, said: string): string | null {
  const pieces = text.split(/\s*…\s*/).map((p) => p.trim()).filter(Boolean);
  if (!pieces.length || !said.trim()) return null;
  const heOf = (p: string) => (/[A-Za-z]/.test(p) ? p.split(/\s+[—–-]\s+/)[0] : p);
  const heSaid = heWords(said);
  const inHebrew = heSaid.length >= 3; // the transcript came back in Hebrew letters: compare letters with letters
  const stream = inHebrew ? heSaid : (said.match(/[A-Za-z][A-Za-z'’]*/g) ?? []).map(latSkel);
  let at = 0;
  const judged: { i: number; share: number; words: number }[] = [];
  pieces.forEach((p, i) => {
    const he = heOf(p);
    if (!/[א-ת]/.test(he)) return;
    const words = inHebrew ? heWords(he) : (he.replace(NIKUD, '').match(/[א-ת]+/g) ?? []).map(heSkel).filter((s) => s.length >= 2);
    if (!words.length || (words.length === 1 && words[0].length < 3 && !inHebrew)) return; // too little to tell
    let found = 0, end = at;
    for (const w of words) {
      for (let k = at; k < Math.min(stream.length, at + 40); k++) {
        if (inHebrew ? stream[k] === w : near(w, stream[k])) { found++; end = Math.max(end, k + 1); break; }
      }
    }
    if (found) at = end;
    judged.push({ i, share: found / words.length, words: words.length });
  });
  if (judged.length < 2) return null;
  const missed = judged.filter((j) => j.share === 0);
  // Only a clear miss: two phrases or more whose Hebrew never came out (or one long one), with at least 3 words between
  // them, and the transcript has to have something of the Hebrew in it, or the whole reading in English letters is
  // in doubt (then it's the English-only reading that the other check, and the brain's [[say]], catch).
  const heard = judged.filter((j) => j.share >= 0.5).length;
  const missedWords = missed.reduce((n, j) => n + j.words, 0);
  if (!(missed.length >= 2 || (missed.length === 1 && missedWords >= 3)) || missedWords < 3) return null;
  if (!heard && pieces.some((p) => /[A-Za-z]/.test(p))) {
    // No Hebrew heard at all, but the English is there: it read the English only. That's a clear miss too.
    const enHeard = enWords(said).length >= 6;
    if (!enHeard) return null;
  }
  return pieces.slice(missed[0].i, missed[missed.length - 1].i + 1).join(' … ');
}

/** Has the voice reached the end of the text it was handed (the last phrase's words are in what it said)? Used to
 *  hold what comes after a reading (the explanation) until the reading is done. */
export function endHeard(text: string, said: string): boolean {
  const pieces = text.split(/\s*…\s*/).map((p) => p.trim()).filter(Boolean);
  const last = pieces[pieces.length - 1] ?? '';
  const want = enWords(last);
  if (want.length) {
    const got = new Set(enWords(said));
    return want.filter((w) => got.has(w)).length / want.length >= 0.5;
  }
  const he = (last.replace(NIKUD, '').match(/[א-ת]+/g) ?? []).map(heSkel).filter((x) => x.length >= 2);
  if (!he.length) return said.trim().length > 0;
  const stream = (said.match(/[A-Za-z][A-Za-z'’]*/g) ?? []).map(latSkel);
  const heSaid = heWords(said);
  return he.filter((w) => stream.some((x) => near(w, x)) || heSaid.length > 0).length / he.length >= 0.5;
}
