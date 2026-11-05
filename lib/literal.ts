// Sefaria's literal (word-for-word) translation: the words its English marks in bold (\u0002 … \u0003), and the
// English the voice reads with the text by the learner's choice. Shared by the server and the page.
const B_ON = '\u0002', B_OFF = '\u0003';

/** Just the literal translation: the words Sefaria's English marks in bold (its word-for-word part), without the
 *  explanation it adds in plain type. Empty when nothing is marked. */
export function literalOf(enB: string | undefined): string {
  if (!enB || !enB.includes(B_ON)) return '';
  const parts = [...enB.matchAll(new RegExp(`${B_ON}([\\s\\S]*?)(?:${B_OFF}|$)`, 'g'))].map((m) => m[1].trim()).filter(Boolean);
  return parts.join(' ').replace(/\s+([,.;:?!])/g, '$1').replace(/\s+/g, ' ').trim();
}
/** The literal (bold) words of just one stretch of the English: the part of the bold-marked English whose plain text
 *  is `piece` (a part of a long line, already cut from the plain English). Empty when it can't be placed. */
export function literalOfPiece(enB: string | undefined, piece: string): string {
  if (!enB || !enB.includes(B_ON) || !piece.trim()) return '';
  // The plain text with each character's bold or not, so the piece can be found by its plain words.
  let plain = '', bold: boolean[] = [], on = false;
  for (const ch of enB) {
    if (ch === B_ON) { on = true; continue; }
    if (ch === B_OFF) { on = false; continue; }
    plain += ch; bold.push(on);
  }
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const start = plain.indexOf(piece.trim().slice(0, 40));
  if (start < 0) return '';
  const end = Math.min(plain.length, start + piece.trim().length);
  let out = '';
  for (let i = start; i < end; i++) out += bold[i] ? plain[i] : (bold[i - 1] && !bold[i] ? ' ' : '');
  return norm(out.replace(/\s+([,.;:?!])/g, '$1'));
}
/** The English for the voice to read with the text, by the learner's choice (the literal words when Sefaria marks them).
 *  If the literal words would be far too few for the Hebrew (so the voice might start translating by itself), the full
 *  English is kept. */
export function englishFor(full: string, enB: string | undefined, translate?: string, piece = false, he = ''): string {
  if (translate !== 'literal' && translate !== 'own') return full;
  const lit = piece ? literalOfPiece(enB, full) : literalOf(enB);
  if (!lit) return full;
  const heWords = he.trim() ? he.trim().split(/\s+/).length : 0;
  if (heWords && lit.split(/\s+/).length < heWords * 0.5) return full;
  return lit;
}

