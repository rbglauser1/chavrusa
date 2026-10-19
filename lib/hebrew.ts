// Remove nikud (vowels) and cantillation marks, keeping letters and punctuation like maqaf.
export function stripNikud(s: string): string {
  return s.replace(/[֑-ֽֿ-ׂׄ-ׇ]/g, '');
}

export function hasHebrew(s: string): boolean {
  return /[א-ת]/.test(s);
}
