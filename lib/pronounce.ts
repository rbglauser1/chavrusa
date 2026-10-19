// Pronunciation helpers for the Chavrusa's spoken voice.
// Add words here whenever the voice says something wrong. Keys are matched as whole words, case-insensitive.

const ASHKENAZ: Record<string, string> = {
  Tosafot: 'Tosafos', Shabbat: 'Shabbos', mitzvot: 'mitzvos', Brachot: 'Brachos', Berakhot: 'Brachos',
  Ketubot: 'Kesubos', Yevamot: 'Yevamos', Kiddushin: 'Kiddushin', Rabbeinu: 'Rabbeinu',
  Rashba: 'Rashba', Ritva: 'Ritva', Ketzot: 'Ketzos', 'Ketzot HaChoshen': 'Ketzos HaChoshen',
  halakha: 'halacha', Halakhah: 'Halacha', emet: 'emes', Torat: 'Toras', teruma: 'trumah',
  'Mishnah Berurah': 'Mishna Brura', 'Shulchan Arukh': 'Shulchan Aruch', 'Orach Chayim': 'Orach Chaim',
};

const SEPHARDI: Record<string, string> = {
  Tosafos: 'Tosafot', Shabbos: 'Shabbat', mitzvos: 'mitzvot', Brachos: 'Berachot', emes: 'emet',
  'Shulchan Arukh': 'Shulchan Aruch',
};

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function prepareForSpeech(text: string, nusach: 'ashkenaz' | 'sephardi'): string {
  let out = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[(\d+)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dict = nusach === 'ashkenaz' ? ASHKENAZ : SEPHARDI;
  // Longest phrases first so "Ketzot HaChoshen" wins over "Ketzot".
  for (const k of Object.keys(dict).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${escape(k)}(?![\\p{L}])`, 'giu'), dict[k]);
  }
  return out.slice(0, 4000);
}

export function speechInstructions(nusach: 'ashkenaz' | 'sephardi'): string {
  return nusach === 'ashkenaz'
    ? 'You are a warm, thoughtful yeshiva chavrusa speaking English. Pronounce Hebrew and Aramaic words and any Hebrew-letter text with traditional Ashkenazi yeshivish pronunciation: stress usually on the second-to-last syllable, tav without dagesh as "s" (Shabbos, Tosafos), kamatz as "aw", cholam as "oy". Speak at a natural, unhurried learning pace.'
    : 'You are a warm, thoughtful chavrusa speaking English. Pronounce Hebrew and Aramaic words and any Hebrew-letter text with traditional Sephardic pronunciation: stress usually on the last syllable, tav always "t" (Shabbat, Tosafot). Speak at a natural, unhurried learning pace.';
}

// Words that help the speech-to-text model recognize learning vocabulary.
export const TRANSCRIBE_HINT =
  'A Torah learning conversation in English with Hebrew and Aramaic terms: Gemara, Mishnah, Rashi, Tosafos, Rashba, Ritva, Ramban, Rambam, Rif, Rosh, Ketzos, Shach, Taz, Mishnah Berurah, Shulchan Aruch, sugya, kashya, teretz, sevara, machlokes, shitta, halacha, psak, chiddush, pshat, lomdus, chavrusa, Shabbos, mitzvah, kohanim, teruma, Shema, Tanna, Amora, Abaye, Rava, Rav Huna.';
