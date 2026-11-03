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
// Sefaria's English starts a section with "GEMARA:" / "MISHNA:", which the Hebrew already says (גמ׳ / מתני׳): drop it
// for the voice, so it isn't said twice.
export const dropSectionLabel = (s: string) => s.replace(/^\s*(GEMARA|GEMORA|MISHNA|MISHNAH)\s*:\s*/i, '');
export function namesForSpeechEn(s: string): string {
  return yeshivishEnglish(dropSectionLabel(s)).replace(/\bthe LORD\b/g, 'Hashem').replace(/\bLORD\b/g, 'Hashem').replace(/\bthe Lord\b/g, 'Hashem');
}

// ---------- Yeshivish transliteration (for the voice) ----------
// Turns Hebrew with nikud into Ashkenazi English letters with the stressed (second-to-last) syllable in capitals:
// בְּרֵאשִׁית בָּרָא אֱלֹקִים -> be-REI-shis BAW-raw e-LO-kim. Spoken text in this form makes the voice stress the
// yeshivish way instead of the modern Israeli way. (Approximate: it follows the nikud, not every rule of dikduk.)
const V = {
  shva: 'ְ', chatafSegol: 'ֱ', chatafPatach: 'ֲ', chatafKamatz: 'ֳ', chirik: 'ִ', tzeirei: 'ֵ',
  segol: 'ֶ', patach: 'ַ', kamatz: 'ָ', cholam: 'ֹ', cholamHaser: 'ֺ', kubutz: 'ֻ', dagesh: 'ּ',
  shinDot: 'ׁ', sinDot: 'ׂ', kamatzKatan: 'ׇ',
};
const VOWEL_SOUND: Record<string, string> = {
  [V.chatafSegol]: 'e', [V.chatafPatach]: 'a', [V.chatafKamatz]: 'o', [V.chirik]: 'i', [V.tzeirei]: 'ei', [V.segol]: 'e',
  [V.patach]: 'a', [V.kamatz]: 'aw', [V.cholam]: 'oi', [V.cholamHaser]: 'oi', [V.kubutz]: 'u', [V.kamatzKatan]: 'o',
};
// Spelling options for the voice (Settings → Voice → Hebrew reading test): the original "simple" vowels (a / o, as the
// brain used to write them) or the yeshivish ones (aw / oi), and the throat sound as "kh" or "ch".
let OPT: { vowels: 'yeshivish' | 'simple'; throat: 'kh' | 'ch' } = { vowels: 'yeshivish', throat: 'kh' };
const SIMPLE: Record<string, string> = { aw: 'a', oi: 'o' };
const vowelOf = (v: string) => (OPT.vowels === 'simple' ? SIMPLE[v] ?? v : v);
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
    // The throat sound is spelled "kh" for the voice: it read "ch" before e/i like "sh" (b'chesef heard as
    // "besheff"). At worst "kh" comes out as a k, which is still right enough (b'kesef).
    case 'ח': return OPT.throat;
    case 'ט': return 't';
    case 'י': return 'y';
    case 'כ': return dg ? 'k' : OPT.throat;
    case 'ך': return OPT.throat;
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
    if (i === 0 && l === 'ו' && m.includes(V.dagesh) && !hasVowel(m)) { syl.push({ on: '', v: 'u', coda: '' }); continue; }     // וּ at the start: "u" (u-ve-VI-aw, not vve-VI-aw)
    if (i > 0 && l === 'ו' && m.includes(V.cholam)) { vowelSyllable(vowelOf('oi')); continue; }                            // cholam male
    if (i > 0 && l === 'ו' && m.includes(V.dagesh) && !hasVowel(m) && !hasVowel(units[i - 1].m)) { vowelSyllable('u'); continue; } // shuruk
    if (l === 'י' && !hasVowel(m) && !m.includes(V.shva) && i > 0 && /[\u05B4\u05B5\u05B6]/.test(units[i - 1].m)) continue;    // yud of chirik/tzeirei
    const c = consonant(l, m, last);
    let vowel = '';
    for (const k of Object.keys(VOWEL_SOUND)) if (m.includes(k)) { vowel = vowelOf(VOWEL_SOUND[k]); break; }
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
      // Joined (the natural way the voice reads best): a shva at the start is just a quick breath, the yeshivish way:
      // p'rutaw, b'chesef, d'rawchim, v'koinaw (not pe-ru-taw, be-che-sef).
      if (!marks) return syl.map((x, i) => (i === 0 && x.shva && x.on && syl.length > 1 ? `${x.on}'${x.coda}` : x.on + x.v + x.coda)).join('') + punct;
      // Stress the second-to-last syllable; but never a said shva (p'NEI, not PE-nei): then the last one.
      if (parts.length > 1) {
        const k = syl[parts.length - 2].shva ? parts.length - 1 : parts.length - 2;
        parts[k] = parts[k].toUpperCase();
      }
      return parts.join('-') + punct;
    })
    .join(' ');
}

// ---------- Yeshivish English names ----------
// Sefaria's English uses academic / modern spellings (Moses, Jacob, Rabbi Yoḥanan, Shabbat, Berakhot).
// Shown and read the yeshivish way instead: Moshe, Yaakov, Rabbi Yochanan, Shabbos, Brachos. Free, no AI.
const YESHIVISH_WORDS: [string, string][] = [
  // Chumash and Tanach
  ['Moses', 'Moshe'], ['Aaron', 'Aharon'], ['Abraham', 'Avraham'], ['Abram', 'Avram'], ['Sarai', 'Sarai'], ['Isaac', 'Yitzchak'],
  ['Jacob', 'Yaakov'], ['Rebekah', 'Rivkah'], ['Rebecca', 'Rivkah'], ['Rachel', 'Rochel'], ['Laban', 'Lavan'], ['Esau', 'Eisav'],
  ['Joseph', 'Yosef'], ['Reuben', 'Reuven'], ['Simeon', 'Shimon'], ['Judah', 'Yehudah'], ['Issachar', 'Yissachar'],
  ['Zebulun', 'Zevulun'], ['Naphtali', 'Naftali'], ['Benjamin', 'Binyamin'], ['Ephraim', 'Efraim'], ['Manasseh', 'Menasheh'],
  ['Noah', 'Noach'], ['Eve', 'Chava'], ['Cain', 'Kayin'], ['Abel', 'Hevel'], ['Enoch', 'Chanoch'], ['Methuselah', 'Mesushelach'],
  ['Japheth', 'Yefes'], ['Ishmael', 'Yishmael'], ['Pharaoh', 'Paroh'], ['Joshua', 'Yehoshua'], ['Caleb', 'Calev'],
  ['Korah', 'Korach'], ['Balaam', 'Bilam'], ['Phinehas', 'Pinchas'], ['Eleazar', 'Elazar'], ['Ithamar', 'Isamar'],
  ['Nadab', 'Nadav'], ['Abihu', 'Avihu'], ['Jethro', 'Yisro'], ['Zipporah', 'Tzipporah'], ['Samuel', 'Shmuel'], ['Saul', 'Shaul'],
  ['David', 'Dovid'], ['Solomon', 'Shlomo'], ['Elijah', 'Eliyahu'], ['Isaiah', 'Yeshayahu'], ['Jeremiah', 'Yirmiyahu'],
  ['Ezekiel', 'Yechezkel'], ['Mordecai', 'Mordechai'], ['Ahasuerus', 'Achashverosh'], ['Nebuchadnezzar', 'Nevuchadnetzar'],
  ['Jerusalem', 'Yerushalayim'], ['Egyptians', 'Mitzrim'], ['Egyptian', 'Mitzri'], ['Egypt', 'Mitzrayim'],
  ['the children of Israel', 'Bnei Yisrael'], ['the Children of Israel', 'Bnei Yisrael'], ['the Israelites', 'Bnei Yisrael'],
  ['Israelites', 'Bnei Yisrael'], ['the land of Israel', 'Eretz Yisrael'], ['the Land of Israel', 'Eretz Yisrael'], ['Israel', 'Yisrael'],
  ['Sabbath', 'Shabbos'], ['Tabernacle', 'Mishkan'], ['Passover', 'Pesach'], ['Tabernacles', 'Sukkos'],
  // Gemara and Mishnah
  ['Shabbat', 'Shabbos'], ['Shabbatot', 'Shabbosos'], ['Beit', 'Beis'], ['peruta', 'pruta'], ['perutah', 'pruta'], ['perutot', 'prutos'], ['Peruta', 'Pruta'], ['Rosh Ḥodesh', 'Rosh Chodesh'], ['Sukkot', 'Sukkos'], ['Shavuot', 'Shavuos'],
  ['Berakhot', 'Brachos'], ['berakhot', 'brachos'], ['berakha', 'bracha'], ['Berakha', 'Bracha'], ['Ketubot', 'Kesubos'],
  ['Yevamot', 'Yevamos'], ['Makkot', 'Makkos'], ['Shevuot', 'Shevuos'], ['Horayot', 'Horiyos'], ['Menaḥot', 'Menachos'],
  ['Bekhorot', 'Bechoros'], ['Arakhin', 'Erchin'], ['Keritot', 'Kerisos'], ['Taanit', 'Taanis'], ['Terumot', 'Terumos'],
  ['Maasrot', 'Maasros'], ['Oholot', 'Ohalos'], ['Teharot', 'Taharos'], ['Mikvaot', 'Mikvaos'],
  ['mitzvot', 'mitzvos'], ['Mitzvot', 'Mitzvos'], ['mitzva', 'mitzvah'], ['halakhot', 'halachos'], ['halakha', 'halacha'], ['Halakha', 'Halacha'],
  ['tefillot', 'tefillos'], ['matzot', 'matzos'], ['kashrut', 'kashrus'], ['baraita', 'braisa'], ['baraitot', 'braisos'],
  ['teruma', 'terumah'], ['Toseftot', 'Tosefos'], ['Tosafot', 'Tosafos'], ['Shema', 'Shema'],
];
const YESHIVISH_RE = new RegExp(`\\b(${YESHIVISH_WORDS.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
const YESHIVISH_MAP = new Map(YESHIVISH_WORDS);
export function yeshivishEnglish(s: string): string {
  if (!s) return s;
  return s
    .replace(YESHIVISH_RE, (w) => YESHIVISH_MAP.get(w) ?? w)
    .replace(/ḥ/g, 'ch').replace(/Ḥ/g, 'Ch')                       // Yoḥanan -> Yochanan, Ḥisda -> Chisda
    .replace(/\b([A-Z][a-z]*?)kh([a-z]*)\b/g, '$1ch$2')              // Arakhin, Mekhilta -> ch
    .replace(/\b([a-z]+)kh([a-z]*)\b/g, (m, a, b) => (/^(sheikh|khaki)$/.test(m) ? m : `${a}ch${b}`));
}

// ---------- How the voice gets the lashon kodesh (Settings → Voice → Hebrew reading test) ----------
// he: the Hebrew letters with nikud (the voice reads Hebrew itself, told to read it the yeshivish way);
// he-plain: the same, without that note (how the voice reads Hebrew on its own);
// dash-simple: syllables with dashes, simple vowels, "ch" (like the brain used to write it: ve-ko-nah);
// join-kh: joined, yeshivish vowels, "kh" (b'khesef: the app's spelling since Nov 1);
// join-ch: joined, yeshivish vowels, "ch" (b'chesef).
export type HeRead = 'he' | 'he-bare' | 'he-key' | 'he-plain' | 'dash-simple' | 'join-kh' | 'join-ch';
export const HE_READS: { id: HeRead; name: string }[] = [
  { id: 'he', name: 'Hebrew letters, read the yeshivish way' },
  // Without the vowels: the way the words look in a Gemara and in most of the Hebrew the voice learned from. With all
  // the vowel marks, each word reaches the voice chopped into many small pieces it rarely saw, which may be why some
  // words come out badly garbled, not just in the wrong accent.
  { id: 'he-bare', name: 'Hebrew letters without vowels (like a Gemara)' },
  { id: 'he-key', name: 'Hebrew letters with a pronunciation key' },
  { id: 'he-plain', name: 'Hebrew letters, the voice on its own' },
  { id: 'dash-simple', name: 'Spelled out with dashes (ve-ko-nah)' },
  { id: 'join-kh', name: 'Spelled out, joined, with kh (b\'khesef)' },
  { id: 'join-ch', name: 'Spelled out, joined, with ch (b\'chesef)' },
];
export const hasNikud = (he: string) => /[\u05B0-\u05BC\u05C1\u05C2\u05C7]/.test(he);
export const isHebrewLetters = (m?: HeRead) => m === 'he' || m === 'he-bare' || m === 'he-plain' || m === 'he-key';
export function voiceHe(he: string, mode: HeRead = 'join-kh'): string {
  // Hebrew with a key: the Hebrew letters (so it reads fluently) and, in brackets, how to say them (so it says them
  // the same way every time).
  if (mode === 'he-key') return `${namesForSpeech(he).replace(/[\u0591-\u05AF\u05BD\u05C0]/g, '')} [${voiceHe(he, 'join-kh')}]`;
  if (mode === 'he-bare') return stripNikud(namesForSpeech(he)); // the Names first (they're found by their vowels)
  if (isHebrewLetters(mode)) return namesForSpeech(he).replace(/[\u0591-\u05AF\u05BD\u05C0]/g, ''); // vowels kept, trop dropped
  const prev = OPT;
  OPT = { vowels: mode === 'dash-simple' ? 'simple' : 'yeshivish', throat: mode === 'join-kh' ? 'kh' : 'ch' };
  try {
    const out = mode === 'dash-simple' ? yeshivishTranslit(namesForSpeech(he), true).toLowerCase() : yeshivishTranslit(namesForSpeech(he), false);
    // Without nikud there's nothing to spell out from: give the voice the Hebrew letters rather than nothing.
    return hasNikud(he) || !/[\u05D0-\u05EA]/.test(he) ? out : namesForSpeech(he);
  } finally { OPT = prev; }
}
/** The note in the voice's instructions that goes with each way of giving it the lashon kodesh. */
export function heReadNote(mode: HeRead = 'join-kh'): string {
  const yeshivish = 'Read it the yeshivish Ashkenazi way, never modern Israeli, and the same way every time a word comes: kamatz as "aw" (BAW-ruch), cholam as "oi" (TOI-rah), tzeirei as "ei" (beis), segol and chataf segol as a short "eh" as in "bed" (שֶׁ is "sheh", never "shei" or "sha"), patach and chataf patach as "a", chirik as "i" as in "sit" or "ee", shuruk and kubutz as "u", tav without a dagesh as "s" (Shabbos), ches and a chof without a dagesh as the throat sound in "Bach" (never "sh"), a shva at the start of a word as a quick breath (b\'reishis), and the stress usually on the second-to-last syllable. Say "Hashem" for the Name and "Elokim" where it is written with a kuf.';
  if (mode === 'he') return `The lashon kodesh between ⟪ ⟫ comes in Hebrew letters with vowels. ${yeshivish} Read it in your own voice and accent, the American yeshiva bochur you always are: Hebrew letters never make you sound Israeli or change your accent.`;
  if (mode === 'he-bare') return `The lashon kodesh between ⟪ ⟫ comes in Hebrew letters without vowels, the way it is printed in a Gemara. Read it the way a yeshiva bochur reads a Gemara or a pasuk he knows, with the right vowels. ${yeshivish} Read it in your own voice and accent, the American yeshiva bochur you always are: Hebrew letters never make you sound Israeli or change your accent.`;
  if (mode === 'he-key') return `The lashon kodesh between ⟪ ⟫ comes in Hebrew letters with vowels, and right after each piece, in square brackets, how to say it in English letters (hawishaw nikneis = ha-ISH-aw NIK-neis). Read the Hebrew, saying every word exactly as the brackets spell it, smoothly and fluently. The brackets are only a guide: never read them as extra words and never say a word twice. ${yeshivish}`;
  if (mode === 'he-plain') return 'The lashon kodesh between ⟪ ⟫ comes in Hebrew letters with vowels: read it as written.';
  if (mode === 'dash-simple') return 'The lashon kodesh between ⟪ ⟫ is spelled out in English letters with dashes between syllables (ve-ko-nah es atz-mah): read each word smoothly as one word, never syllable by syllable.';
  return 'The lashon kodesh between ⟪ ⟫ is spelled out in English letters the yeshivish way (hawishaw nikneis): say each word smoothly as one word, never syllable by syllable.';
}

// ---------- Who reads the text in a call (Settings → Voice, and the ⋯ menu) ----------
// all: the chavrusa reads the lashon kodesh and its English; english: you read the lashon kodesh yourself and he reads
// only the English; gist: you read it yourself and he only gives the gist, then goes on with the learning.
export type VoiceReads = 'all' | 'english' | 'gist';
/** A spoken reply, with its text blocks cut to what the chavrusa reads aloud in this mode. */
export function forReader(text: string, mode: VoiceReads = 'all'): string {
  if (mode === 'all') return text;
  return text.replace(/\[\[say\]\]([\s\S]*?)\[\[\/say\]\]/gi, (_m, body: string) => {
    if (mode === 'gist') return ' ';
    const en = body.split('|').map((p) => { const m = p.match(/\s[—–]\s([\s\S]*)$/); return m ? m[1].trim() : ''; }).filter(Boolean).join(' | ');
    return en ? `[[say]]${en}[[/say]]` : ' ';
  }).replace(/\s{2,}/g, ' ').trim();
}
/** The note in the voice's instructions for each mode. */
export function voiceReadsNote(mode: VoiceReads = 'all'): string {
  if (mode === 'english') return 'WHO READS: the learner reads the lashon kodesh himself. You read only the English of the text (what comes between ⟪ ⟫ is the English only); never read or say the lashon kodesh of the text yourself.';
  if (mode === 'gist') return 'WHO READS: the learner reads the text himself. You never read the text aloud, not in lashon kodesh and not in English: give the gist of each piece in your own words, then go on with the learning in your style.';
  return '';
}
