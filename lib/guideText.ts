import 'server-only';
import { stripNikud } from './hebrew';

/** A whole section as numbered lines for the AI (Learn with me, Nov 15): Hebrew, and the English under it if any. */
export function sectionText(he: string[], en: string[], max = 24000): string {
  const clip = (t: string, m: number) => (t.length > m ? `${t.slice(0, m)}…` : t);
  const plain = (t: string) => t.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const per = Math.max(260, Math.floor(max / Math.max(1, he.length) / 2));
  return he.map((h, i) => `[${i + 1}] ${clip(stripNikud(plain(h)), per)}${en[i] ? `\n    ${clip(plain(en[i]), per)}` : ''}`).join('\n').slice(0, max);
}
