import type { Settings } from './config';
import { GEMINI_PRON } from './live';
import { forGemini, forVoice, HOUSE_SAY } from './geminiSpeech';
import { namesForSpeech, yeshivishTranslit } from './hebrew';

// Gemini only: the pronunciation part of its instructions (its own guide, GPT-Live's, or none), plus "say it my way".
export function geminiPronunciation(s: Settings): { pron: string | undefined; myWayNote: string } {
  const pron = s.geminiPron === 'same' ? undefined
    : s.geminiPron === 'plain' ? 'Pronunciation: say Hebrew and Aramaic words as they are spelled, smoothly and naturally.'
    : GEMINI_PRON;
  const list = (s.geminiMyWay ?? []).filter((x) => x.word?.trim() && x.say?.trim());
  const myWayNote = list.length ? `\n# Say these words exactly this way (the learner's own list; it wins over everything above)\n${list.map((x) => `- ${x.word.trim()} = ${x.say.trim()}`).join('\n')}` : '';
  return { pron, myWayNote };
}

// A test line: any Hebrew letters are spelled out the way the app does for the voice, then Gemini's spelling and list.
export function geminiLine(text: string, s: Settings): string {
  const spelled = text.replace(/[֐-׿"׳״־]+(?:\s+[֐-׿"׳״־]+)*/g, (he) => yeshivishTranslit(namesForSpeech(he), false));
  return forGemini(spelled, s.geminiSpell ?? 'stressed', s.geminiMyWay ?? []);
}

// GPT-Live: the "say it my way" note for its instructions, and a test line spelled the way a GPT-Live call would get it.
export function myWayNoteFor(list: { word: string; say: string }[] = []): string {
  const l = list.filter((x) => x.word?.trim() && x.say?.trim());
  return l.length ? `\n# Say these words exactly this way (the learner's own list; it wins over everything above)\n${l.map((x) => `- ${x.word.trim()} = ${x.say.trim()}`).join('\n')}` : '';
}
export function gptLine(text: string, s: Settings): string {
  const spelled = text.replace(/[\u0590-\u05FF"׳״־]+(?:\s+[\u0590-\u05FF"׳״־]+)*/g, (he) => yeshivishTranslit(namesForSpeech(he), false));
  return forVoice(spelled, s.gptSpell ?? 'stressed', s.gptMyWay ?? [], s.houseSay !== false);
}

// The pronunciation list for the voice's instructions: the learner's own words, then (when on) the standard ones,
// each sound grouped with all its spellings ("Tosafos / Tosafot / Tosfos = TOSS-fos").
export function sayNote(mine: { word: string; say: string }[] = [], house = true): string {
  const own = mine.filter((x) => x.word?.trim() && x.say?.trim()).map((x) => `- ${x.word.trim()} = ${x.say.trim()}`);
  const bySay = new Map<string, string[]>();
  if (house) for (const h of HOUSE_SAY) bySay.set(h.say, [...(bySay.get(h.say) ?? []), h.word]);
  const std = [...bySay].map(([say, words]) => `- ${words.join(' / ')} = ${say}`);
  if (!own.length && !std.length) return '';
  return `\n# Say these words exactly this way, every time (the sound-out spelling after "=")${own.length ? `\nThe learner's own (these win):\n${own.join('\n')}` : ''}${std.length ? `\nStandard:\n${std.join('\n')}` : ''}`;
}
