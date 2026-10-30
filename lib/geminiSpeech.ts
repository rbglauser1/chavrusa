// Gemini only: how lashon kodesh is spelled out for its voice, and the learner's own "say it my way" list.
// (GPT-Live keeps the app's usual spelling, be-REI-shis, and its own guide.)
export type GeminiSpell = 'stressed' | 'joined' | 'plain';
export interface SayMyWay { word: string; say: string }

// The app spells Hebrew like "be-REI-shis BAW-raw": syllables split by hyphens, the stressed one in capitals.
// joined: "beREIshis" (stress kept, no hyphens); plain: "bereishis" (no marks at all).
export function respell(text: string, spell: GeminiSpell = 'stressed'): string {
  if (spell === 'stressed') return text;
  return text.replace(/\b[A-Za-z']+(?:-[A-Za-z']+)+\b/g, (w) => {
    const parts = w.split('-');
    const marked = parts.some((p) => p.length > 1 && p === p.toUpperCase() && /[A-Z]/.test(p)) && parts.some((p) => /[a-z]/.test(p) || p.length <= 1);
    if (!marked) return w; // an ordinary hyphenated English word
    const j = parts.join('');
    return spell === 'plain' ? j.toLowerCase() : j;
  });
}

export function applyMyWay(text: string, list: SayMyWay[] = []): string {
  let t = text;
  for (const { word, say } of list) {
    const w = word.trim(), s = say.trim();
    if (!w || !s) continue;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, 'giu'), (_m, pre: string) => `${pre}${s}`);
  }
  return t;
}

export function forGemini(text: string, spell: GeminiSpell = 'stressed', list: SayMyWay[] = []): string {
  return applyMyWay(respell(text, spell), list);
}

// The standard yeshivish pronunciations (Settings → Voice → "Standard pronunciations", on by default), taken from the
// app's own pronunciation rules. Every spelling of each word becomes ONE sound-out spelling before the voice sees it,
// so it can't say it two ways. The learner's own "say it my way" list is applied first and wins.
export const HOUSE_SAY: SayMyWay[] = [
  ...['Tosafos', 'Tosafot', 'Tosfos', 'Tosfot', 'Tosafoth'].map((w) => ({ word: w, say: 'TOSS-fos' })),
  ...['Gemara', 'Gemarah', 'Gemora', 'Gemoro'].map((w) => ({ word: w, say: "g'MOH-rah" })),
  ...['Mishnah', 'Mishna'].map((w) => ({ word: w, say: 'MISH-nah' })),
  ...['Mishnayos', 'Mishnayot', 'Mishnaios'].map((w) => ({ word: w, say: 'mish-NAI-yos' })),
  { word: 'Rashi', say: 'RAH-shee' },
  ...['kashya', 'kushya', 'kasha'].map((w) => ({ word: w, say: 'KOSH-ya' })),
  ...['kushyos', 'kushyot', 'kashyos', 'kashyot'].map((w) => ({ word: w, say: 'KOOSH-yos' })),
  ...['teirutz', 'terutz', 'teirutz'].map((w) => ({ word: w, say: 'TEI-rutz' })),
  ...['sugya', 'sugyah'].map((w) => ({ word: w, say: 'SOOG-ya' })),
  ...['machlokes', 'machloket', 'machlokis'].map((w) => ({ word: w, say: 'mach-LOI-kes' })),
  ...['halacha', 'halachah', 'halakha', 'halakhah'].map((w) => ({ word: w, say: 'ha-LOH-cha' })),
  ...['mitzvah', 'mitzva'].map((w) => ({ word: w, say: 'MITZ-vah' })),
  ...['mitzvos', 'mitzvot'].map((w) => ({ word: w, say: 'MITZ-vos' })),
  ...['chavrusa', 'chavruta', 'chavrusah'].map((w) => ({ word: w, say: 'chahv-ROO-sah' })),
  { word: 'shiur', say: 'SHEE-ur' },
  ...['pshat', 'peshat', "p'shat"].map((w) => ({ word: w, say: "P'SHOT" })),
  ...['svara', 'sevara', "s'vara"].map((w) => ({ word: w, say: "s'VOH-ra" })),
  { word: 'Hashem', say: 'hah-SHEM' },
  { word: 'Chazal', say: 'CHAH-zal' },
  { word: 'Rambam', say: 'RAHM-bahm' },
  { word: 'Ramban', say: 'RAHM-bahn' },
  ...['Torah', 'Toirah'].map((w) => ({ word: w, say: 'TOI-rah' })),
  ...['Moshe', 'Moishe'].map((w) => ({ word: w, say: 'MOI-sheh' })),
  ...['Shabbos', 'Shabbat', 'Shabbath'].map((w) => ({ word: w, say: 'SHAH-bos' })),
  ...['Brachos', 'Berachos', 'Berakhot', 'Brachot'].map((w) => ({ word: w, say: 'BRO-chos' })),
  ...['Bereishis', 'Bereshit', 'Bereishit'].map((w) => ({ word: w, say: 'be-REI-shis' })),
  { word: 'Tanna', say: 'TAH-nah' },
  ...['Amora', 'Amorah'].map((w) => ({ word: w, say: 'ah-MOH-rah' })),
  ...['Rishonim'].map((w) => ({ word: w, say: 'ree-SHOI-nim' })),
  ...['Acharonim'].map((w) => ({ word: w, say: 'ah-chah-ROI-nim' })),
];

// What the voice is handed: the spelling choice, then the learner's own list, then the standard pronunciations.
export function forVoice(text: string, spell: GeminiSpell = 'stressed', mine: SayMyWay[] = [], house = true): string {
  return applyMyWay(respell(text, spell), house ? [...mine, ...HOUSE_SAY] : mine);
}
