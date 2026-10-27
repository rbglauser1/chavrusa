// Remove nikud (vowels) and cantillation marks, keeping letters and punctuation like maqaf.
export function stripNikud(s: string): string {
  return s.replace(/[֑-ֽֿ-ׂׄ-ׇ]/g, '');
}

export function hasHebrew(s: string): boolean {
  return /[א-ת]/.test(s);
}

// For reading aloud: say "Hashem" for the four-letter Name (and Onkelos's יְיָ), and "Elokim" for Elohim
// (and its forms: Elokeinu, Elokecha… and the Aramaic Elokah), never the Names as written.
const MARKS = '[\\u0591-\\u05C7]*';
const SHEM = new RegExp(`י${MARKS}ה${MARKS}ו${MARKS}ה${MARKS}`, 'g');
const SHEM_TARGUM = new RegExp(`(^|[\\s\\u05BE])י${MARKS}י${MARKS}(?=[\\s\\u05BE.,:׃]|$)`, 'g');
// Alef, lamed with cholam or kamatz, then hei followed by more letters: אֱלֹהִים, אֱלֹהֶיךָ, אֱלָהָא (not אֵלֶּה, "these").
const ELOKIM = new RegExp(`(א${MARKS}ל[\\u05B0-\\u05C7]*[\\u05B8\\u05B9][\\u05B0-\\u05C7]*)ה(?=${MARKS}[\\u05D0-\\u05EA])`, 'g');
export function namesForSpeech(s: string): string {
  return s.replace(SHEM, 'הַשֵּׁם').replace(SHEM_TARGUM, '$1הַשֵּׁם').replace(ELOKIM, '$1ק')
    // "elohim acherim" (idols) is said as written.
    .replace(new RegExp(`(א${MARKS}ל${MARKS})ק(\\S*\\s+א${MARKS}ח${MARKS}ר${MARKS}י)`, 'g'), '$1ה$2');
}
// English: "the LORD" / "LORD" -> Hashem.
export function namesForSpeechEn(s: string): string {
  return s.replace(/\bthe LORD\b/g, 'Hashem').replace(/\bLORD\b/g, 'Hashem').replace(/\bthe Lord\b/g, 'Hashem');
}

// ---------- Yeshivish transliteration (for the voice) ----------
// Turns Hebrew with nikud into Ashkenazi English letters with the stressed (second-to-last) syllable in capitals:
// בְּרֵאשִׁית בָּרָא אֱלֹקִים -> be-REI-shis BO-ro e-LO-kim. Spoken text in this form makes the voice stress the
// yeshivish way instead of the modern Israeli way. (Approximate: it follows the nikud, not every rule of dikduk.)
const V = {
  shva: 'ְ', chatafSegol: 'ֱ', chatafPatach: 'ֲ', chatafKamatz: 'ֳ', chirik: 'ִ', tzeirei: 'ֵ',
  segol: 'ֶ', patach: 'ַ', kamatz: 'ָ', cholam: 'ֹ', cholamHaser: 'ֺ', kubutz: 'ֻ', dagesh: 'ּ',
  shinDot: 'ׁ', sinDot: 'ׂ', kamatzKatan: 'ׇ',
};
const VOWEL_SOUND: Record<string, string> = {
  [V.chatafSegol]: 'e', [V.chatafPatach]: 'a', [V.chatafKamatz]: 'o', [V.chirik]: 'i', [V.tzeirei]: 'ei', [V.segol]: 'e',
  [V.patach]: 'a', [V.kamatz]: 'o', [V.cholam]: 'oh', [V.cholamHaser]: 'oh', [V.kubutz]: 'u', [V.kamatzKatan]: 'o',
};
function consonant(letter: string, marks: string, final: boolean): string {
  const dg = marks.includes(V.dagesh);
  switch (letter) {
    case 'א': case 'ע': return '';
    case 'ב': return dg ? 'b' : 'v';
    case 'ג': return 'g';
    case 'ד': return 'd';
    case 'ה': return final && !dg ? '' : 'h';
    case 'ו': return 'v';
    case 'ז': return 'z';
    case 'ח': return 'ch';
    case 'ט': return 't';
    case 'י': return 'y';
    case 'כ': return dg ? 'k' : 'ch';
    case 'ך': return 'ch';
    case 'ל': return 'l';
    case 'מ': case 'ם': return 'm';
    case 'נ': case 'ן': return 'n';
    case 'ס': return 's';
    case 'פ': return dg ? 'p' : 'f';
    case 'ף': return 'f';
    case 'צ': case 'ץ': return 'tz';
    case 'ק': return 'k';
    case 'ר': return 'r';
    case 'ש': return marks.includes(V.sinDot) ? 's' : 'sh';
    case 'ת': return dg ? 't' : 's';
    default: return '';
  }
}
type Syl = { on: string; v: string; coda: string; shva?: boolean };
function wordToSyllables(word: string): Syl[] {
  // Split into letters with their marks.
  const units: { l: string; m: string }[] = [];
  for (const ch of word) {
    if (/[\u05D0-\u05EA]/.test(ch)) units.push({ l: ch, m: '' });
    else if (/[\u0591-\u05C7]/.test(ch) && units.length) units[units.length - 1].m += ch;
  }
  const hasVowel = (m: string) => /[\u05B1-\u05BB\u05C7]/.test(m);
  const syl: Syl[] = [];
  let pending = '';
  let lastCoda = ''; // the consonant just added to the end of the previous syllable (it may really start the next one)
  const vowelSyllable = (v: string) => {
    // A vowel letter (וּ / וֹ) after a consonant with no vowel: that consonant starts this syllable (to-HU, not toh-U).
    let on = pending;
    if (!on && lastCoda && syl.length && syl[syl.length - 1].coda.endsWith(lastCoda)) {
      const prev = syl[syl.length - 1];
      prev.coda = prev.coda.slice(0, prev.coda.length - lastCoda.length);
      on = lastCoda;
    }
    syl.push({ on, v, coda: '' });
    pending = ''; lastCoda = '';
  };
  for (let i = 0; i < units.length; i++) {
    const { l, m } = units[i];
    const last = i === units.length - 1;
    if (i > 0 && l === 'ו' && m.includes(V.cholam)) { vowelSyllable('oh'); continue; }                            // cholam male
    if (i > 0 && l === 'ו' && m.includes(V.dagesh) && !hasVowel(m) && !hasVowel(units[i - 1].m)) { vowelSyllable('u'); continue; } // shuruk
    if (l === 'י' && !hasVowel(m) && !m.includes(V.shva) && i > 0 && /[\u05B4\u05B5\u05B6]/.test(units[i - 1].m)) continue;    // yud of chirik/tzeirei
    const c = consonant(l, m, last);
    let vowel = '';
    for (const k of Object.keys(VOWEL_SOUND)) if (m.includes(k)) { vowel = VOWEL_SOUND[k]; break; }
    if (last && vowel === 'a' && (l === 'ח' || l === 'ע')) { if (syl.length) syl[syl.length - 1].coda += `a${c}`; continue; } // furtive patach: ru-ach
    let shva = false;
    if (!vowel && m.includes(V.shva) && i === 0) { vowel = 'e'; shva = true; }                                    // shva at the start is said
    if (vowel) { syl.push({ on: pending + c, v: vowel, coda: '', shva }); pending = ''; lastCoda = ''; }
    else if (syl.length) { syl[syl.length - 1].coda += c; lastCoda = c; }
    else pending += c;
  }
  if (pending && syl.length) syl[syl.length - 1].coda += pending;
  return syl.filter((x) => x.on || x.v || x.coda);
}
export function yeshivishTranslit(hebrew: string, marks = true): string {
  return hebrew
    .replace(/[־]/g, ' ')                       // maqaf
    .replace(/[׃:.,;!?"״׳'()\[\]{}–-]/g, (p) => (p === '׃' || p === ':' ? '.' : /[.,;!?]/.test(p) ? p : ' '))
    .split(/\s+/).filter(Boolean)
    .map((w) => {
      const punct = w.match(/[.,;!?]+$/)?.[0] ?? '';
      const word = w.replace(/[.,;!?]+$/, '');
      if (/^ה[֑-ׇ]*ש[֑-ׇ]*ם[֑-ׇ]*$/.test(word)) return `${marks ? 'ha-SHEM' : 'Hashem'}${punct}`;
      if (!/[א-ת]/.test(word)) return w;
      const syl = wordToSyllables(word);
      if (!syl.length) return punct;
      const parts = syl.map((x) => x.on + x.v + x.coda);
      if (!marks) return parts.join('') + punct;
      // Stress the second-to-last syllable; but never a said shva (p'NEI, not PE-nei): then the last one.
      if (parts.length > 1) {
        const k = syl[parts.length - 2].shva ? parts.length - 1 : parts.length - 2;
        parts[k] = parts[k].toUpperCase();
      }
      return parts.join('-') + punct;
    })
    .join(' ');
}
