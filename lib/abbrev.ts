// ראשי תיבות: the abbreviations a learner meets in the Gemara's meforshim, opened up (tap one in an open line or in a
// meforesh: components/WordBox.tsx). A fixed list, so it is instant and free (no AI). The key is the abbreviation
// without its marks (כה"ג → כהג); each has one or more readings [the words, in English], the commonest first.
// Not found as it stands: tried again without a prefix letter or two (ו ד ב ל כ מ ש ה): וכה"ג → כה"ג.
type Reading = [string, string];
const A: Record<string, Reading[]> = {
  // The give and take
  'את': [['אם תאמר', 'if you ask']], 'ואת': [['ואם תאמר', 'and if you ask']],
  'יל': [['יש לומר', 'one can answer']], 'ויל': [['ויש לומר', 'and one can answer']],
  'עיל': [['עוד יש לומר', 'one can also answer']],
  'ימ': [['יש מפרשים', 'some explain']], 'וימ': [['ויש מפרשים', 'and some explain']],
  'יא': [['יש אומרים', 'some say']], 'ויא': [['ויש אומרים', 'and some say']],
  'כת': [['כי תימא', 'if you say']], 'וכת': [['וכי תימא', 'and if you say']],
  'אל': [['אמר ליה / אמר לו', 'he said to him'], ['אין לומר', 'one cannot say']],
  'ואל': [['ואין לומר', 'and one cannot say'], ['ואמר ליה', 'and he said to him']],
  'צע': [['צריך עיון', 'this needs study']], 'וצע': [['וצריך עיון', 'and this needs study']],
  'צל': [['צריך לומר', 'one must say; it should read']], 'וצל': [['וצריך לומר', 'and one must say']],
  'כצל': [['כך צריך לומר', 'so it should read']],
  'קק': [['קצת קשה', 'it is somewhat difficult']], 'עק': [['עוד קשה', 'a further difficulty']],
  'לק': [['לא קשיא', 'it is no difficulty'], ['לישנא קמא', 'the first version']],
  'לקמ': [['לא קשה מידי', 'it is no difficulty at all']],
  'אש': [['אתי שפיר', 'it works out well']],
  'נל': [['נראה לי', 'it seems to me']], 'כנ': [['כן נראה', 'so it seems']], 'לכנ': [['לכן נראה', 'therefore it seems']],
  'רל': [['רצה לומר', 'he means'], ['ריש לקיש', 'Reish Lakish']],
  'הפ': [['הכי פירושו', 'this is what it means']], 'הק': [['הכי קאמר', 'this is what he is saying']],
  'הג': [['הכי גרסינן', 'this is the right text'], ['הלכות גדולות', 'Halachos Gedolos']],
  'לג': [['לא גרסינן', 'we do not have this in the text']],
  'סא': [['ספרים אחרים', 'other texts read']], 'לא': [['לשון אחר', 'another version']],
  'טס': [['טעות סופר', 'a copyist’s error']],
  'זא': [['זה אינו', 'that is not so']],
  'פה': [['פירש הקונטרס', 'Rashi explained']], 'פי': [['פירוש', 'meaning; he explained']],
  'פרשי': [['פירש רש"י', 'Rashi explained']], 'פרת': [['פירש רבינו תם', 'Rabbeinu Tam explained']], 'פרח': [['פירש רבינו חננאל', 'Rabbeinu Chananel explained']],
  'כדפה': [['כדפירש הקונטרס', 'as Rashi explained']], 'כדפי': [['כדפירש', 'as he explained']], 'כדפרשי': [['כדפירש רש"י', 'as Rashi explained']],
  'כמש': [['כמו שכתב / כמו שנאמר', 'as he wrote; as it says']], 'מש': [['מאי שנא', 'what is the difference'], ['מה שכתב', 'what he wrote'], ['מוצאי שבת', 'the night after Shabbos']],
  'משכ': [['מה שכתב', 'what he wrote']], 'משאכ': [['מה שאין כן', 'which is not so with']],
  'עכל': [['עד כאן לשונו', 'end of his words']], 'זל': [['זה לשונו', 'these are his words'], ['זכרונו לברכה', 'of blessed memory']],
  'עש': [['עיין שם', 'see there'], ['ערב שבת', 'the eve of Shabbos']], 'עייש': [['עיין שם', 'see there']], 'יעוש': [['יעויין שם', 'see there']],
  'הנל': [['הנזכר לעיל', 'mentioned above']], 'כנל': [['כנזכר לעיל', 'as mentioned above']],
  'דה': [['דיבור המתחיל', 'the piece that begins'], ['דברי הכל', 'all agree']],
  // The Gemara's own terms
  'הא': [['הוה אמינא', 'I would have said']], 'סד': [['סלקא דעתך', 'you might have thought']], 'סדא': [['סלקא דעתך אמינא', 'I might have thought']],
  'קמל': [['קא משמע לן', 'it teaches us']], 'שמ': [['שמע מינה', 'learn from this']], 'תש': [['תא שמע', 'come and hear (a proof)']],
  'תר': [['תנו רבנן', 'the Sages taught']], 'תל': [['תלמוד לומר', 'the verse teaches']], 'תנה': [['תניא נמי הכי', 'so too it was taught']],
  'מט': [['מאי טעמא', 'what is the reason']], 'הט': [['היינו טעמא', 'this is the reason']], 'הד': [['היכי דמי', 'what is the case']],
  'הבע': [['הכא במאי עסקינן', 'what are we dealing with here']], 'בדא': [['במה דברים אמורים', 'when is this said']],
  'המ': [['הני מילי', 'this applies only']], 'הנמ': [['הני מילי', 'this applies only']],
  'מנהמ': [['מנא הני מילי', 'from where do we know this']], 'מנל': [['מנא לן / מנא ליה', 'from where do we know']],
  'נמ': [['נפקא מינה', 'the practical difference']], 'למ': [['לא מיבעיא', 'it goes without saying']],
  'לש': [['לא שנא', 'there is no difference'], ['לא שנו', 'they taught this only']], 'לפ': [['לא פליגי', 'they do not disagree']],
  'לד': [['לאו דוקא', 'not exactly'], ['לא דמי', 'it is not similar']], 'לל': [['למה לי', 'why do I need it']], 'לה': [['לא הוי', 'it is not']],
  'מד': [['מאן דאמר', 'the one who says']], 'כמד': [['כמאן דאמר', 'like the one who says']], 'למד': [['למאן דאמר', 'according to the one who says']],
  'סל': [['סבירא ליה', 'he holds']], 'קל': [['קיימא לן', 'we hold'], ['קל להבין', 'easy to understand']], 'קיל': [['קיימא לן', 'we hold']],
  'כע': [['כולי עלמא', 'everyone']], 'לכע': [['לכולי עלמא', 'according to everyone']], 'דכע': [['דכולי עלמא', 'that everyone']],
  'תק': [['תנא קמא', 'the first Tanna']], 'קו': [['קל וחומר', 'all the more so (kal vachomer)']], 'גש': [['גזירה שוה', 'gezeirah shavah']],
  'כש': [['כל שכן', 'all the more so']], 'הה': [['הוא הדין', 'the same applies']], 'הנ': [['הכי נמי', 'so too']], 'אהנ': [['אין הכי נמי', 'yes, that is so']],
  'אה': [['אי הכי', 'if so']], 'אכ': [['אם כן', 'if so']], 'דאכ': [['דאם כן', 'for if so']], 'דאלכ': [['דאם לא כן', 'for otherwise']], 'אלכ': [['אם לא כן', 'otherwise']],
  'אנ': [['אי נמי', 'or else']], 'אבא': [['אי בעית אימא', 'if you wish, say']], 'אא': [['אי אפשר', 'it is impossible'], ['אי אמרת', 'if you say'], ['אשת איש', 'a married woman']],
  'אאכ': [['אלא אם כן', 'unless']], 'או': [['אלא ודאי', 'rather, certainly']], 'אעג': [['אף על גב', 'even though']], 'אעפ': [['אף על פי', 'even though']],
  'אעפכ': [['אף על פי כן', 'nevertheless']], 'אפה': [['אפילו הכי', 'even so']], 'אפי': [['אפילו', 'even']], 'אצ': [['אין צריך', 'there is no need']],
  'אר': [['אמר רבי / אמר רב', 'Rabbi … said']], 'אחכ': [['אחר כך', 'afterwards']],
  'מהת': [['מן התורה', 'from the Torah'], ['מהיכי תיתי', 'from where would you get that']], 'מדאו': [['מדאורייתא', 'from the Torah']],
  'ממ': [['מכל מקום', 'nevertheless'], ['מגיד משנה', 'Maggid Mishneh']], 'משה': [['משום הכי', 'because of this']],
  'עכ': [['על כרחך', 'you are forced to say'], ['עד כאן', 'until here']], 'עכפ': [['על כל פנים', 'in any case']],
  'עי': [['על ידי', 'by means of']], 'עמ': [['על מנת', 'on condition that']], 'עפ': [['על פי', 'according to'], ['ערב פסח', 'the eve of Pesach']],
  'עג': [['על גבי', 'on top of']], 'עז': [['עבודה זרה', 'idolatry'], ['על זה', 'on this']], 'לפז': [['לפי זה', 'according to this']],
  'עאכוכ': [['על אחת כמה וכמה', 'how much more so']],
  'הל': [['הוה ליה', 'he has; it is; he should have'], ['הלכות', 'the laws of']], 'הז': [['הרי זה', 'this is']], 'זאז': [['זה את זה', 'one another']],
  'כא': [['כל אחד', 'each one'], ['כי אם', 'but rather']], 'כז': [['כל זמן', 'as long as'], ['כל זה', 'all this']], 'ככ': [['כל כך', 'so much'], ['כמו כן', 'likewise']],
  'כמ': [['כל מקום', 'every place'], ['כסף משנה', 'Kesef Mishneh']], 'בכמ': [['בכל מקום', 'everywhere']], 'כה': [['כן הוא', 'so it is']],
  'כהג': [['כהאי גוונא', 'in a case like this'], ['כהן גדול', 'the Kohen Gadol']], 'כג': [['כהן גדול', 'the Kohen Gadol']],
  'גכ': [['גם כן', 'also']], 'דא': [['דבר אחר', 'another explanation'], ['דרך ארץ', 'the way of the world']],
  'בעכ': [['בעל כרחו', 'against his will']], 'בפע': [['בפני עצמו', 'by itself']], 'בעפ': [['בעל פה', 'by heart; oral']], 'אע': [['את עצמו', 'himself'], ['אבן עזרא', 'Ibn Ezra']],
  'וכו': [['וכולי', 'and so on']], 'כו': [['כולי', 'and so on']], 'וגו': [['וגומר', 'and the rest of the verse']], 'שנא': [['שנאמר', 'as it says']],
  'שד': [['שפיר דמי', 'it is fine'], ['שפיכות דמים', 'bloodshed']], 'חו': [['חס ושלום', 'Heaven forbid']],
  // Halacha and the world of the Gemara
  'בד': [['בית דין', 'a court']], 'דמ': [['דיני ממונות', 'money cases'], ['דרך משל', 'for example']], 'דנ': [['דיני נפשות', 'capital cases']],
  'דת': [['דברי תורה', 'words of Torah'], ['דין תורה', 'Torah law']], 'דס': [['דברי סופרים', 'the words of the Sages']],
  'מע': [['מצות עשה', 'a positive mitzvah']], 'לת': [['לא תעשה', 'a negative mitzvah']],
  'יח': [['ידי חובתו', 'his obligation']], 'קש': [['קריאת שמע', 'the Shema']], 'קפ': [['קרבן פסח', 'the Pesach offering']],
  'יוט': [['יום טוב', 'Yom Tov']], 'יוהכ': [['יום הכיפורים', 'Yom Kippur']], 'רה': [['ראש השנה', 'Rosh Hashanah'], ['רשות הרבים', 'the public domain']],
  'רהר': [['רשות הרבים', 'the public domain']], 'רהי': [['רשות היחיד', 'a private domain']], 'רח': [['ראש חודש', 'Rosh Chodesh'], ['רבינו חננאל', 'Rabbeinu Chananel']],
  'בהש': [['בין השמשות', 'twilight']], 'בזהז': [['בזמן הזה', 'nowadays']],
  'בהמק': [['בית המקדש', 'the Beis Hamikdash']], 'ביהמק': [['בית המקדש', 'the Beis Hamikdash']], 'בהכנ': [['בית הכנסת', 'a shul']], 'בהמד': [['בית המדרש', 'the beis midrash']],
  'אי': [['ארץ ישראל', 'Eretz Yisrael']], 'חול': [['חוץ לארץ', 'outside Eretz Yisrael']],
  'בעהב': [['בעל הבית', 'the owner; the householder']], 'בח': [['בעל חוב', 'a creditor'], ['בעלי חיים', 'animals'], ['בית חדש', 'the Bach']], 'בעח': [['בעל חוב', 'a creditor'], ['בעלי חיים', 'animals']],
  'עה': [['עם הארץ', 'an unlearned man'], ['עליו השלום', 'peace be upon him']], 'תח': [['תלמיד חכם', 'a Torah scholar']], 'שץ': [['שליח ציבור', 'the one leading the davening']],
  'עכום': [['עובד כוכבים ומזלות', 'an idolater']], 'בנ': [['בן נח', 'a Noahide']], 'בא': [['בני אדם', 'people']], 'אדהר': [['אדם הראשון', 'Adam']],
  'אוהע': [['אומות העולם', 'the nations of the world']], 'עוהב': [['עולם הבא', 'the World to Come']], 'עוהז': [['עולם הזה', 'this world']],
  'גע': [['גילוי עריות', 'forbidden relations'], ['גן עדן', 'Gan Eden']], 'יצהר': [['יצר הרע', 'the evil inclination']],
  'סת': [['ספר תורה', 'a Torah scroll']], 'תת': [['תלמוד תורה', 'Torah study']], 'תומ': [['תרומות ומעשרות', 'terumos and maasros']],
  'הקבה': [['הקדוש ברוך הוא', 'the Holy One, blessed is He']], 'חזל': [['חכמינו זכרונם לברכה', 'our Sages']],
  // Seforim and places in them
  'בק': [['בבא קמא', 'Bava Kamma'], ['בת קול', 'a voice from Heaven']], 'במ': [['בבא מציעא', 'Bava Metzia']], 'בב': [['בבא בתרא', 'Bava Basra']],
  'שס': [['ששה סדרים', 'the Talmud (Shas)']], 'תכ': [['תורת כהנים', 'Toras Kohanim (Sifra)']], 'בהג': [['בעל הלכות גדולות', 'the Behag']],
  'שוע': [['שולחן ערוך', 'the Shulchan Aruch']], 'מב': [['משנה ברורה', 'the Mishnah Berurah']], 'מא': [['מגן אברהם', 'the Magen Avraham']],
  'תוס': [['תוספות', 'Tosafos']], 'גמ': [['גמרא', 'Gemara']], 'מתני': [['מתניתין', 'the Mishnah']], 'מס': [['מסכת', 'tractate']],
  'פק': [['פרק קמא', 'the first chapter']], 'רפ': [['ריש פרק', 'the beginning of the chapter'], ['רב פפא', 'Rav Pappa']],
  'סי': [['סימן', 'section (siman)']], 'סע': [['סעיף', 'paragraph (se’if)']],
  'עא': [['עמוד א', 'side a of the daf']], 'עב': [['עמוד ב', 'side b of the daf']],
  // Names
  'ר': [['רבי', 'Rabbi']], 'הר': [['הרב רבי', 'the Rav, Rabbi']], 'הרר': [['הרב רבי', 'the Rav, Rabbi']],
  'רי': [['רבינו יצחק', 'the Ri (of the Tosafos)'], ['רבי יהודה / רבי יוחנן / רבי יוסי', 'Rabbi Yehudah, Yochanan or Yosei, by the place']],
  'רת': [['רבינו תם', 'Rabbeinu Tam'], ['ראשי תיבות', 'an abbreviation']],
  'רמ': [['רבי מאיר', 'Rabbi Meir']], 'רע': [['רבי עקיבא', 'Rabbi Akiva']], 'רש': [['רבי שמעון', 'Rabbi Shimon'], ['רבינו שמשון', 'Rabbeinu Shimshon']],
  'רא': [['רבי אליעזר / רבי אלעזר', 'Rabbi Eliezer or Rabbi Elazar']], 'רג': [['רבן גמליאל', 'Rabban Gamliel']], 'רנ': [['רב נחמן', 'Rav Nachman']],
  'בש': [['בית שמאי', 'Beis Shammai']], 'בה': [['בית הלל', 'Beis Hillel'], ['ברוך הוא', 'blessed is He']],
  'ריבל': [['רבי יהושע בן לוי', 'Rabbi Yehoshua ben Levi']], 'ריבז': [['רבן יוחנן בן זכאי', 'Rabban Yochanan ben Zakkai']],
  'רשבג': [['רבן שמעון בן גמליאל', 'Rabban Shimon ben Gamliel']], 'רשבי': [['רבי שמעון בן יוחאי', 'Rabbi Shimon bar Yochai']], 'רשבל': [['רבי שמעון בן לקיש', 'Reish Lakish']],
  'ריבא': [['רבינו יצחק בן אשר', 'the Riva']], 'ריבם': [['רבינו יצחק בן מאיר', 'the Rivam']], 'רשבם': [['רבינו שמואל בן מאיר', 'the Rashbam']],
  'רשבא': [['רבינו שמשון בן אברהם', 'the Rash of Sens (in Tosafos)'], ['רבינו שלמה בן אדרת', 'the Rashba']],
  'מהרם': [['מורנו הרב רבי מאיר', 'the Maharam']], 'מהרשא': [['מורנו הרב רבי שמואל אליעזר', 'the Maharsha']], 'מהרשל': [['מורנו הרב רבי שלמה לוריא', 'the Maharshal']],
  'רשי': [['רבינו שלמה יצחקי', 'Rashi']], 'רמבם': [['רבינו משה בן מיימון', 'the Rambam']], 'רמבן': [['רבינו משה בן נחמן', 'the Ramban']],
  'ראש': [['רבינו אשר', 'the Rosh']], 'רן': [['רבינו נסים', 'the Ran']], 'ריף': [['רבינו יצחק אלפסי', 'the Rif']],
};

const NUM: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
const PREFIX = /^[ודבלכמשה]+$/;

/** Is this word written as an abbreviation (כה"ג, וי"ל, ר', וכו')? `raw` is the word with its marks. */
export const looksAbbreviated = (raw: string) => /[א-ת]["״][א-ת]/.test(raw) || /[א-ת]['׳]$/.test(raw);

/** The readings of an abbreviation, or [] if it isn't in the list. `prefix` is what was taken off the front. */
export function openAbbreviation(raw: string): { readings: Reading[]; prefix: string } {
  const key = raw.replace(/[^א-ת]/g, '');
  if (A[key]) return { readings: A[key], prefix: '' };
  for (const k of [1, 2]) {
    const m = key.slice(0, k);
    if (PREFIX.test(m) && A[key.slice(k)]) return { readings: A[key.slice(k)], prefix: m };
  }
  // פ"ב, פ"ג…: a chapter number.
  const p = key.match(/^פ([א-ט]|[יכל][א-ט]?)$/);
  if (p && /["״]/.test(raw)) { const n = [...p[1]].reduce((s, c) => s + (NUM[c] ?? 0), 0); return { readings: [[`פרק ${p[1]}`, `chapter ${n}`]], prefix: '' }; }
  return { readings: [], prefix: '' };
}
