// The language the AI writes in (Settings → The AI writes in; Nov 13): English, Hebrew, or both. Applies to everything
// the AI writes for the screen — the chat, ✦ Chat, Explain, Ideas, the map, outlines, steps, review, Chazara, notes.
// Not to the voice (it speaks English with Ashkenazi lashon kodesh), not to translations of the texts.
import { getSettings } from './db';

export type AiLang = 'en' | 'he' | 'both';
export const aiLangOf = (v: unknown): AiLang => (v === 'he' || v === 'both' ? v : 'en');
export async function aiLang(): Promise<AiLang> { return aiLangOf((await getSettings().catch(() => null))?.aiLang); }

/** Added at the end of the AI's instructions. Empty for English (the instructions are already in English). */
export function langRule(l: AiLang): string {
  if (l === 'he') return `

# Language: Hebrew
Write everything you write in clear, simple Hebrew, the Hebrew of seforim and the yeshiva (לשון הקודש as a learner reads it; no modern slang). This overrides any instruction above to write in English.
- Quotes from the text and the meforshim stay exactly as they are written.
- Names of seforim and people as a yeshiva learner says them (רש"י, תוספות, רבי יוחנן).
- Keep every required format exactly: JSON keys, "- " bullets and their nesting, labels the app reads. Only the words you write are in Hebrew. A short English label the app asks for (like a step's "label") may stay in English.`;
  if (l === 'both') return `

# Language: English and Hebrew
Write everything you write in English, and give each part again in clear, simple Hebrew (the Hebrew of seforim and the yeshiva) right after it. This overrides any instruction above to write only in English.
- Paragraphs: the English paragraph, then the same paragraph in Hebrew as its own paragraph.
- Bullet lists: each point in English, then, as the first smaller point under it ("  - "), the same point in Hebrew. Smaller points the same way, with the Hebrew right after each as a line of its own at the same level.
- A one-line field (like a step's "en", a question or an answer): the English, then " / ", then the Hebrew.
- Quotes from the text and the meforshim stay exactly as they are written, once.
- Keep every required format exactly: JSON keys, "- " bullets, labels the app reads.`;
  return '';
}
