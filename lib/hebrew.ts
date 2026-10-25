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
