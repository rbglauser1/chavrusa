// Shorten AI text without cutting a word in half (review, Nov 11: maps showed "until da", "And he f"). Cuts at the
// last sentence end that keeps most of it, else at the last space, and marks the cut with "…".
export function clipWords(text: unknown, max: number): string {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '), head.lastIndexOf('; '));
  if (stop > max * 0.6) return head.slice(0, stop + 1);
  const sp = head.lastIndexOf(' ');
  return `${(sp > max * 0.5 ? head.slice(0, sp) : head).replace(/[,;:\s—–-]+$/, '')}…`;
}

/** Did an older cut leave a word in half? (text cut at exactly `max`, not ending a sentence) */
export const cutOff = (s: string, max: number) => s.length >= max - 1 && !/[.!?…”"’')\]]$/.test(s.trim());
