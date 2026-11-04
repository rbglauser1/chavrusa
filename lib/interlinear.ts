// Phrase by phrase ("interlinear"): a line of the text cut into short Hebrew phrases, each with its own English right
// under it. Free, no AI. The Hebrew is cut at its punctuation (Sefaria's Hebrew is punctuated: commas, colons,
// periods); the English is cut at its own punctuation, and the two are lined up by length, counting only Sefaria's
// bold words (the word-for-word translation) where it marks them, so the added explanation doesn't throw it off.
// The same mark of punctuation in both places (a colon or question mark most, a comma or period a little) pulls the
// cut there. When it can't line them up, it returns null and the
// line is shown the usual way.

const B_ON = '\u0002', B_OFF = '\u0003';
const END = /[,:.?!;׃]["'״׳)\]]*$/;

export interface Pair { he: string; en: string } // en keeps the bold marks (\u0002 … \u0003)

function hebrewPhrases(he: string): string[] {
  const toks = he.trim().split(/\s+/).filter(Boolean);
  const out: string[][] = [];
  let cur: string[] = [];
  for (const t of toks) { cur.push(t); if (END.test(t) && cur.length >= 2) { out.push(cur); cur = []; } }
  if (cur.length) { if (cur.length < 2 && out.length) out[out.length - 1].push(...cur); else out.push(cur); }
  return out.map((p) => p.join(' '));
}

type Unit = { chars: { c: string; b: boolean }[]; w: number; punct: string };

function englishUnits(enB: string | undefined, en: string): Unit[] {
  const src = enB && enB.includes(B_ON) ? enB : en;
  const marked = src.includes(B_ON);
  const chars: { c: string; b: boolean }[] = [];
  let on = false;
  for (const ch of src) {
    if (ch === B_ON) { on = true; continue; }
    if (ch === B_OFF) { on = false; continue; }
    chars.push({ c: ch, b: on });
  }
  // Cut after a mark of punctuation that is followed by a space.
  const units: Unit[] = [];
  let cur: { c: string; b: boolean }[] = [];
  let bracket = 0;
  for (let i = 0; i < chars.length; i++) {
    const { c } = chars[i];
    if (c === '[') bracket++; else if (c === ']') bracket = Math.max(0, bracket - 1);
    cur.push(chars[i]);
    const next = chars[i + 1]?.c;
    if (!bracket && /[,:.?!;]/.test(c) && (next === ' ' || next === undefined)) {
      let j = i + 1; while (chars[j] && /["'”’)]/.test(chars[j].c)) { cur.push(chars[j]); j++; }
      i = j - 1;
      units.push({ chars: cur, w: 0, punct: c }); cur = [];
    }
  }
  if (cur.some((x) => x.c.trim())) units.push({ chars: cur, w: 0, punct: '' });
  for (const u of units) {
    let inBr = 0;
    u.w = u.chars.filter((x) => { if (x.c === '[') inBr++; else if (x.c === ']') inBr = Math.max(0, inBr - 1); return !inBr && /[A-Za-z0-9]/.test(x.c) && (!marked || x.b); }).length;
  }
  // A unit with no translation words in it (only added explanation) goes with the one before it.
  const merged: Unit[] = [];
  for (const u of units) {
    if (u.w === 0 && merged.length) { const p = merged[merged.length - 1]; p.chars.push(...u.chars); p.punct = u.punct || p.punct; }
    else merged.push(u);
  }
  if (merged.length > 1 && merged[0].w === 0) { merged[1].chars.unshift(...merged[0].chars); merged.shift(); }
  return merged;
}

function rebuild(all: { c: string; b: boolean }[]): string {
  let a = 0, z = all.length;
  while (a < z && !all[a].c.trim()) a++;
  while (z > a && !all[z - 1].c.trim()) z--;
  const chars = all.slice(a, z);
  let s = '', on = false;
  for (const { c, b } of chars) {
    if (b && !on) { s += B_ON; on = true; } else if (!b && on) { s += B_OFF; on = false; }
    s += c;
  }
  if (on) s += B_OFF;
  return s.trim();
}

const heLen = (h: string) => h.replace(/[^א-ת]/g, '').length;
const heEnd = (h: string) => (h.match(/([,:.?!;׃])["'״׳)\]]*$/)?.[1] ?? '').replace('׃', '.');

/** The line as phrase pairs, or null when it's one phrase or can't be lined up. */
export function pairPhrases(he: string, enB: string | undefined, en: string): Pair[] | null {
  if (!he.trim() || !(en || enB || '').trim()) return null;
  let hp = hebrewPhrases(he);
  const units = englishUnits(enB, en);
  if (units.length < 2 || hp.length < 2) return null;
  // More Hebrew phrases than English pieces: join the shortest neighbors.
  while (hp.length > units.length) {
    let m = 0;
    for (let i = 1; i < hp.length - 1; i++) if (heLen(hp[i]) + heLen(hp[i + 1]) < heLen(hp[m]) + heLen(hp[m + 1])) m = i;
    hp.splice(m, 2, `${hp[m]} ${hp[m + 1]}`);
  }
  if (hp.length < 2) return null;
  const k = hp.length, n = units.length;
  const H = hp.reduce((a, h) => a + heLen(h), 0), T = units.reduce((a, u) => a + u.w, 0);
  if (!H || !T) return null;
  const cumH: number[] = []; hp.reduce((a, h, j) => (cumH[j] = a + heLen(h)), 0);
  const cumE: number[] = []; units.reduce((a, u, i) => (cumE[i] = a + u.w), 0);
  // Best cuts: Hebrew phrase j ends where English unit i ends. Cost: how far apart the two places are (as a share of
  // the whole), less something when both end on the same mark of punctuation.
  const cost = (j: number, i: number) => {
    const d = cumE[i] / T - cumH[j] / H;
    const p = heEnd(hp[j]), q = units[i].punct;
    return d * d - (!p || p !== q ? 0 : p === ':' || p === '?' ? 0.03 : 0.008);
  };
  const INF = 1e9;
  const dp: number[][] = Array.from({ length: k }, () => Array(n).fill(INF));
  const from: number[][] = Array.from({ length: k }, () => Array(n).fill(-1));
  for (let i = 0; i <= n - k; i++) dp[0][i] = cost(0, i);
  for (let j = 1; j < k; j++) for (let i = j; i <= n - k + j; i++) for (let p = j - 1; p < i; p++) {
    const v = dp[j - 1][p] + (j === k - 1 && i !== n - 1 ? INF : cost(j, i));
    if (v < dp[j][i]) { dp[j][i] = v; from[j][i] = p; }
  }
  if (dp[k - 1][n - 1] >= INF) return null;
  const ends: number[] = [];
  for (let j = k - 1, i = n - 1; j >= 0; i = from[j][i], j--) ends.unshift(i);
  const pairs: Pair[] = [];
  let start = 0;
  ends.forEach((e, j) => { pairs.push({ he: hp[j], en: rebuild(units.slice(start, e + 1).flatMap((u) => u.chars)) }); start = e + 1; });
  // Lined up badly somewhere (a phrase with far too much or too little English for its length): don't show it this way.
  const bad = pairs.some((p, j) => {
    const share = units.slice(j === 0 ? 0 : ends[j - 1] + 1, ends[j] + 1).reduce((a, u) => a + u.w, 0) / T;
    const heShare = heLen(hp[j]) / H;
    return share > heShare * 3.5 + 0.08 || heShare > share * 3.5 + 0.08;
  });
  return bad ? null : pairs;
}
