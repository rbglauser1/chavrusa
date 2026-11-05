// Phrase by phrase ("interlinear"): a line of the text cut into short Hebrew phrases, each with its own English right
// under it. Free, no AI. The Hebrew is cut at its punctuation (Sefaria's Hebrew is punctuated: commas, colons,
// periods); the English is cut at its own punctuation, and the two are lined up by length, counting only Sefaria's
// bold words (the word-for-word translation) where it marks them, so the added explanation doesn't throw it off.
// The same mark of punctuation in both places (a colon or question mark most, a comma or period a little) pulls the
// cut there.
// Tanach has no punctuation in the Hebrew: there a pasuk is cut at its major trop breaks (etnachta, segol, zakef), and
// when the English has too few commas to match, it is cut between words, by length, preferring a cut after a comma or
// before "and", "that", "for"… (roughly right; it can land a word or two off).
// When it can't line them up with confidence, it returns null and the line is shown the usual way.

const B_ON = '\u0002', B_OFF = '\u0003';
const END = /[,:.?!;׃]["'״׳)\]]*$/;

export interface Pair { he: string; en: string } // en keeps the bold marks (\u0002 … \u0003)

// The major disjunctive trop: etnachta, segol, zakef katan, zakef gadol (and shalshelet).
const BREAK = /[\u0591\u0592\u0593\u0594\u0595]/;
// The next level (revia, tipcha, pashta, yetiv, tevir), used only to cut a long stretch.
const BREAK2 = /[\u0597\u0596\u0599\u059A\u059B]/;
function tropPhrases(he: string): string[] {
  const toks = he.trim().split(/\s+/).filter(Boolean);
  const cut = (ws: string[], re: RegExp) => {
    const out: string[][] = [];
    let cur: string[] = [];
    const n = (xs: string[]) => xs.join(' ').split(/[\s\u05BE]+/).filter((w) => /[\u05D0-\u05EA]/.test(w)).length; // words joined by a maqaf count
    ws.forEach((t, i) => { cur.push(t); if (re.test(t) && n(cur) >= 2 && n(ws.slice(i + 1)) >= 2) { out.push(cur); cur = []; } });
    if (cur.length) out.push(cur);
    return out;
  };
  // A stretch of 7 words or more is cut again at the next level of trop.
  return cut(toks, BREAK).flatMap((p) => (p.length >= 7 ? cut(p, BREAK2) : [p])).map((p) => p.join(' ').replace(/\s+/g, ' '));
}

function hebrewPhrases(he: string): string[] {
  const toks = he.trim().split(/\s+/).filter(Boolean);
  const out: string[][] = [];
  let cur: string[] = [];
  for (const t of toks) {
    // A quotation (a pasuk, a Mishnah) is its own phrase: cut before its opening quote mark and after its closing one,
    // and at a dash standing alone.
    if (/^["“״]/.test(t) && cur.length >= 2) { out.push(cur); cur = []; }
    cur.push(t);
    if (END.test(t) || /^[-–—]$/.test(t) || (/[^"“”״]["”״]$/.test(t) && !/^["“״]/.test(t))) { out.push(cur); cur = []; }
  }
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
    let q = i + 1; while (chars[q] && /["'”’)]/.test(chars[q].c)) q++; // closing quote marks after it
    const next = chars[q]?.c;
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
  if (hp.length < 2 && BREAK.test(he)) hp = tropPhrases(he);
  if (hp.length < 2) return null;
  // First by the English's own punctuation; if that can't be lined up, between words.
  const units = englishUnits(enB, en);
  return (units.length >= 2 ? align(hp.slice(), units, false) : null) ?? align(hp.slice(), wordUnits(units), true);
}

// The English one word at a time (for a cut between words), keeping the bold marks and the punctuation.
const WEAK_END = /^(the|a|an|and|of|to|in|his|her|their|my|your|our|its|this|that|these|those|from|with|by|upon|unto|on|for|at|as)$/i;
const SOFT_START = /^["'“‘(]*(and|but|that|for|who|which|when|whom|whose|so|then|because|saying|until|as|if|or|nor|to|from|in|upon|with|by|on|over|before|after)\b/i;
function wordUnits(units: Unit[]): Unit[] {
  const chars = units.flatMap((u) => u.chars);
  const out: Unit[] = [];
  let cur: { c: string; b: boolean }[] = [];
  const marked = chars.some((x) => x.b);
  const push = () => {
    if (!cur.some((x) => x.c.trim())) { if (out.length) out[out.length - 1].chars.push(...cur); cur = []; return; }
    const text = cur.map((x) => x.c).join('');
    const w = cur.filter((x) => /[A-Za-z0-9]/.test(x.c) && (!marked || x.b)).length;
    out.push({ chars: cur, w, punct: (text.trim().match(/([,:.?!;])["'”’)]*$/)?.[1]) ?? '' });
    cur = [];
  };
  for (const ch of chars) { if (ch.c === ' ' && cur.some((x) => x.c.trim())) { cur.push(ch); push(); } else cur.push(ch); }
  push();
  // Words with no translation in them go with the word before.
  const merged: Unit[] = [];
  for (const u of out) { if (u.w === 0 && merged.length) { const p = merged[merged.length - 1]; p.chars.push(...u.chars); p.punct = u.punct || p.punct; } else merged.push(u); }
  if (merged.length > 1 && merged[0].w === 0) { merged[1].chars.unshift(...merged[0].chars); merged.shift(); }
  return merged;
}

function align(hp: string[], units: Unit[], byWord: boolean): Pair[] | null {
  // More Hebrew phrases than English pieces: join two neighbors, choosing the join that lines up best.
  while (hp.length > units.length) {
    let best: string[] | null = null, bestC = Infinity;
    for (let m = 0; m < hp.length - 1; m++) {
      const t = [...hp.slice(0, m), `${hp[m]} ${hp[m + 1]}`, ...hp.slice(m + 2)];
      const c = t.length <= units.length ? solve(t, units, byWord)?.cost ?? Infinity : heLen(hp[m]) + heLen(hp[m + 1]);
      if (c < bestC) { bestC = c; best = t; }
    }
    if (!best) return null;
    hp = best;
  }
  if (hp.length < 2) return null;
  return solve(hp, units, byWord)?.pairs ?? null;
}

function solve(hp: string[], units: Unit[], byWord: boolean): { pairs: Pair[] | null; cost: number } | null {
  const k = hp.length, n = units.length;
  const H = hp.reduce((a, h) => a + heLen(h), 0), T = units.reduce((a, u) => a + u.w, 0);
  if (!H || !T) return null;
  const cumH: number[] = []; hp.reduce((a, h, j) => (cumH[j] = a + heLen(h)), 0);
  const cumE: number[] = []; units.reduce((a, u, i) => (cumE[i] = a + u.w), 0);
  const startsSoft = (i: number) => SOFT_START.test(units[i + 1]?.chars.map((x) => x.c).join('').trim() ?? '');
  // Best cuts: Hebrew phrase j ends where English unit i ends. Cost: how far apart the two places are (as a share of
  // the whole), less something when both end on the same mark of punctuation (between words: when the English ends
  // on any punctuation, or the next English word starts a new clause).
  const cost = (j: number, i: number) => {
    const d = cumE[i] / T - cumH[j] / H;
    const p = heEnd(hp[j]), q = units[i].punct;
    if (byWord) {
      const word = units[i].chars.map((x) => x.c).join('').trim().replace(/[^A-Za-z']/g, '');
      return d * d - (q ? 0.012 : 0) - (startsSoft(i) ? 0.01 : 0) + (!q && WEAK_END.test(word) ? 0.03 : 0);
    }
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
  const total = dp[k - 1][n - 1];
  const ends: number[] = [];
  for (let j = k - 1, i = n - 1; j >= 0; i = from[j][i], j--) ends.unshift(i);
  const pairs: Pair[] = [];
  let start = 0;
  ends.forEach((e, j) => { pairs.push({ he: hp[j], en: rebuild(units.slice(start, e + 1).flatMap((u) => u.chars)) }); start = e + 1; });
  // Lined up badly somewhere (a phrase with far too much or too little English for its length): don't show it this way.
  const limit = byWord ? 2.5 : 3.5;
  const bad = pairs.some((p, j) => {
    const share = units.slice(j === 0 ? 0 : ends[j - 1] + 1, ends[j] + 1).reduce((a, u) => a + u.w, 0) / T;
    const heShare = heLen(hp[j]) / H;
    return share > heShare * limit + 0.08 || heShare > share * limit + 0.08;
  });
  return { pairs: bad ? null : pairs, cost: bad ? total + 1 : total };
}
