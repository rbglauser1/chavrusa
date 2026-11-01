// Tzuras hadaf: the printed Vilna page for a Gemara amud, as a scanned PDF from Shas.org (scans from HebrewBooks.org
// and Moznaim). Free for non-commercial, educational use with attribution (see DAF_CREDIT).
// "Kiddushin 2a" -> https://www.shas.org/daf-pdf/api/?masechta=kiddushin&daf=2&amud=a

const SLUG: Record<string, string> = {
  Berakhot: 'berachos', Shabbat: 'shabbos', Eruvin: 'eruvin', Pesachim: 'pesachim', Shekalim: 'shekalim', Yoma: 'yoma',
  Sukkah: 'sukkah', Beitzah: 'beitzah', 'Rosh Hashanah': 'rosh-hashanah', Taanit: 'taanis', Megillah: 'megillah',
  'Moed Katan': 'moed-katan', Chagigah: 'chagigah', Yevamot: 'yevamos', Ketubot: 'kesubos', Nedarim: 'nedarim', Nazir: 'nazir',
  Sotah: 'sotah', Gittin: 'gittin', Kiddushin: 'kiddushin', 'Bava Kamma': 'bava-kamma', 'Bava Metzia': 'bava-metzia',
  'Bava Batra': 'bava-basra', Sanhedrin: 'sanhedrin', Makkot: 'makkos', Shevuot: 'shevuos', 'Avodah Zarah': 'avodah-zarah',
  Horayot: 'horayos', Zevachim: 'zevachim', Menachot: 'menachos', Chullin: 'chullin', Bekhorot: 'bechoros', Arakhin: 'arachin',
  Temurah: 'temurah', Keritot: 'kereisos', Meilah: 'meilah', Tamid: 'tamid', Niddah: 'niddah',
};

export interface Amud { tractate: string; daf: number; amud: 'a' | 'b' }

/** The amud a Gemara reference is on ("Kiddushin 2a", "Kiddushin 2a:5"), or null if it isn't Bavli. */
export function amudOf(ref: string): Amud | null {
  const m = ref.match(/^(.+?) (\d+)([ab])(?::|$)/);
  if (!m || !SLUG[m[1]]) return null;
  return { tractate: m[1], daf: Number(m[2]), amud: m[3] as 'a' | 'b' };
}
export function dafPdfUrl(a: Amud): string {
  return `https://www.shas.org/daf-pdf/api/?masechta=${SLUG[a.tractate]}&daf=${a.daf}&amud=${a.amud}`;
}
export function stepAmud(a: Amud, dir: 1 | -1): Amud | null {
  if (dir === 1) return a.amud === 'a' ? { ...a, amud: 'b' } : { ...a, daf: a.daf + 1, amud: 'a' };
  if (a.amud === 'b') return { ...a, amud: 'a' };
  return a.daf > 2 ? { ...a, daf: a.daf - 1, amud: 'b' } : null;
}
export const DAF_CREDIT = 'Scanned Shas provided courtesy of shas.org (http://shas.org/dafviewer), hebrewbooks.org (https://www.hebrewbooks.org/shas) and Moznaim (הוצאת ח. וגשל); redistributed free for non-commercial, educational use under the HebrewBooks License.';
