// Nov 25: his own marks while learning, kept on the phone (the doc "new ways to learn together"):
// - Got it / shaky on a line: shaky lines come back in Chazara on Home.
// - Your question comes back: a question he asked on a card, or a kashya he was told to hold, stays open until the
//   Gemara answers it a few lines later; the card then reminds him of it.
export type OpenQ = { ref: string; line: number; q: string; held?: boolean; at: number };
export type Shaky = { ref: string; line: number; text: string; at: number };

const read = <T,>(k: string): T[] => {
  try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const write = (k: string, v: unknown[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or off */ } };

const SK = 'chavrusa-shaky', QK = 'chavrusa-openq';

export const shakyList = (): Shaky[] => read<Shaky>(SK).sort((a, b) => b.at - a.at);
export const lineMark = (ref: string, line: number): 'shaky' | 'got' | null => {
  if (read<Shaky>(SK).some((x) => x.ref === ref && x.line === line)) return 'shaky';
  return read<{ ref: string; line: number }>('chavrusa-got').some((x) => x.ref === ref && x.line === line) ? 'got' : null;
};
export function markLine(ref: string, line: number, mark: 'shaky' | 'got' | null, text = '') {
  write(SK, read<Shaky>(SK).filter((x) => !(x.ref === ref && x.line === line)).concat(mark === 'shaky' ? [{ ref, line, text: text.slice(0, 200), at: Date.now() }] : []).slice(-200));
  write('chavrusa-got', read<{ ref: string; line: number }>('chavrusa-got').filter((x) => !(x.ref === ref && x.line === line)).concat(mark === 'got' ? [{ ref, line }] : []).slice(-500));
}

export const openQs = (ref: string): OpenQ[] => read<OpenQ>(QK).filter((x) => x.ref === ref);
export function addOpenQ(q: Omit<OpenQ, 'at'>) {
  const all = read<OpenQ>(QK);
  if (all.some((x) => x.ref === q.ref && x.line === q.line && x.q === q.q)) return;
  write(QK, [...all, { ...q, q: q.q.slice(0, 300), at: Date.now() }].slice(-60));
}
export function closeOpenQ(q: OpenQ) {
  write(QK, read<OpenQ>(QK).filter((x) => !(x.ref === q.ref && x.line === q.line && x.q === q.q)));
}
