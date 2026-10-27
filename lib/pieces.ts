// Long lines in bite-size pieces. Sefaria's "lines" are uneven: in the Gemara one can be three words, or a whole
// statement with a question and an answer. For reading aloud, a long line is split at its natural stops (the two dots,
// a period, a question), with its English split to match, so each turn is a comfortable size. Works anywhere, no AI.

export interface Piece { he: string; en: string }

const SPLIT_OVER = 24;   // Hebrew words: a line this long or longer is split
const MIN_PIECE = 8;     // a piece shorter than this is joined to its neighbor
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

function cutHebrew(he: string): string[] {
  const w = words(he);
  if (w.length < SPLIT_OVER) return [he.trim()];
  const out: string[][] = [];
  let cur: string[] = [];
  for (const tok of w) {
    cur.push(tok);
    const n = cur.length;
    const strong = /[:.?!;׃]["'״׳)]*$/.test(tok);   // the two dots, a period, a question
    const soft = /[,—–-]["'״׳)]*$/.test(tok) || tok === '—' || tok === '–';
    if ((strong && n >= 10) || (soft && n >= 18) || n >= 30) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  // Join a short tail (or any very short piece) onto its neighbor.
  for (let i = out.length - 1; i > 0; i--) if (out[i].length < MIN_PIECE) { out[i - 1].push(...out[i]); out.splice(i, 1); }
  if (out.length > 1 && out[0].length < MIN_PIECE) { out[1].unshift(...out[0]); out.shift(); }
  return out.map((p) => p.join(' '));
}

// The English, cut into as many parts as the Hebrew, at sentence (or clause) breaks closest to the same proportions.
function cutEnglish(en: string, sizes: number[]): string[] | null {
  const k = sizes.length;
  if (k === 1) return [en.trim()];
  const split = (re: RegExp) => en.trim().split(re).map((x) => x.trim()).filter(Boolean);
  let units = split(/(?<=[.?!;]["”’']?)\s+(?=["'“‘(A-Z0-9])/);
  if (units.length < k) units = split(/(?<=[.?!;:,])\s+/);
  if (units.length < k) return null;
  const len = (u: string) => u.replace(/\[[^\]]*\]/g, '').replace(/[^A-Za-z0-9]/g, '').length; // [added words] don't count
  const total = units.reduce((a, u) => a + len(u), 0);
  const heTotal = sizes.reduce((a, b) => a + b, 0);
  // Cumulative English letters at the end of each unit.
  const ends: number[] = [];
  units.reduce((a, u, i) => (ends[i] = a + len(u)), 0);
  const cuts: number[] = [];
  let acc = 0, from = 0;
  for (let j = 0; j < k - 1; j++) {
    acc += sizes[j];
    const target = (acc / heTotal) * total;
    let best = from, bestD = Infinity;
    for (let i = from; i <= units.length - (k - j); i++) { const d = Math.abs(ends[i] - target); if (d < bestD) { bestD = d; best = i; } }
    cuts.push(best);
    from = best + 1;
  }
  const parts: string[] = [];
  let start = 0;
  for (const c of [...cuts, units.length - 1]) { parts.push(units.slice(start, c + 1).join(' ')); start = c + 1; }
  return parts;
}

export function splitPieces(he: string, en: string): Piece[] {
  const hp = cutHebrew(he);
  if (hp.length === 1) return [{ he: he.trim(), en: en.trim() }];
  if (!en.trim()) return hp.map((h) => ({ he: h, en: '' }));
  const heLen = (h: string) => h.replace(/[^\u05D0-\u05EA]/g, '').length;
  let sizes = hp.map(heLen);
  let ep = cutEnglish(en, sizes);
  // Not enough English sentences to go around: use fewer, bigger Hebrew pieces.
  let heP = hp;
  while (!ep && heP.length > 1) {
    const merged = heP.slice();
    let m = 0;
    for (let i = 1; i < merged.length - 1; i++) if (words(merged[i]).length + words(merged[i + 1]).length < words(merged[m]).length + words(merged[m + 1]).length) m = i;
    merged.splice(m, 2, `${merged[m]} ${merged[m + 1]}`);
    heP = merged;
    sizes = heP.map(heLen);
    ep = cutEnglish(en, sizes);
  }
  if (!ep) return [{ he: he.trim(), en: en.trim() }];
  return heP.map((h, i) => ({ he: h, en: ep![i] ?? '' }));
}
