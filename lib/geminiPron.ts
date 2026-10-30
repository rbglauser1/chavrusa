import type { Settings } from './config';
import { GEMINI_PRON } from './live';
import { forGemini } from './geminiSpeech';
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
