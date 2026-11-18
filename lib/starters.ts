// The suggested questions fit the kind of text (Nov 15): a pasuk, a Mishnah, the Gemara, or any other sefer.
const TANACH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles) \d/;
const HALACHA = /^(Shulchan Arukh|Mishneh Torah|Mishnah Berurah|Kitzur Shulchan Arukh|Chayyei Adam|Chayei Adam|Arukh HaShulchan|Aruch HaShulchan|Tur|Shemirat Shabbat|Ben Ish Chai|Kaf HaChaim|Peninei Halakhah|Halachipedia|Sefer HaChinukh|Magen Avraham|Taz|Shakh|Mishnah Berurah)\b|^(Rif|Rosh|Mordechai) /;
export function startersFor(ref: string): string[] {
  // "What is the halacha?" wherever a halacha can come out of it (Nov 18): Chumash (the mitzvos), Mishnah, Gemara and
  // the seforim of halacha.
  if (/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d/.test(ref)) return ['What is the pasuk saying?', 'What is bothering Rashi?', 'What do other meforshim say?', 'What is the halacha?', 'Where else does this idea come up?', 'Ask me a kashya', 'Is there a chakira here?'];
  if (HALACHA.test(ref)) return ['What is he saying here?', 'What is the halacha?', 'What is the source?', 'Who argues?', 'Ask me a kashya'];
  if (TANACH.test(ref)) return ['What is the pasuk saying?', 'What is bothering Rashi?', 'What do other meforshim say?', 'Where else does this idea come up?', 'Ask me a kashya', 'Is there a chakira here?'];
  if (/^Mishnah /.test(ref)) return ['What is the case?', 'What does the Bartenura add?', 'Who holds what?', 'What is the halacha?', 'Ask me a kashya', 'Is there a chakira here?'];
  if (/^[A-Z][\w' ]* \d+[ab]:\d+$/.test(ref) && !/ on /.test(ref)) return ['Who is asking, and why?', 'What does Rashi add?', 'What does Tosafos ask?', 'What do the Rishonim ask?', 'Is there a chakira here?', 'What is the halacha?', 'Ask me a kashya'];
  return ['What is he saying here?', 'Bring another source', 'Where else does this idea come up?', 'How do I live this?', 'Ask me a kashya'];
}

/** Every suggested question, by kind of text (for Settings → Extras, to hide the ones the learner doesn't want). */
export const ALL_STARTERS: [string, string[]][] = [
  ['Chumash', startersFor('Genesis 1:1')],
  ['Nach', startersFor('Joshua 1:1')],
  ['Mishnah', startersFor('Mishnah Berakhot 1:1')],
  ['Gemara', startersFor('Berakhot 2a:1')],
  ['Halacha seforim', startersFor('Mishnah Berurah 1:1')],
  ['Other seforim', startersFor('Mesillat Yesharim 1:1')],
];
