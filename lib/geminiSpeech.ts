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
