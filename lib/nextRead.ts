import 'server-only';
import type { Settings } from './config';
import { styleById } from './config';
import type { ApprovedEntry } from './approval';
import type { MessageRow, SourceRow } from './db';
import { currentPlace, section, splitRef } from './place';
import { nextPiece, type Expect } from './sayFix';
import { namesForSpeechEn, voiceHe } from './hebrew';
import { nextSection } from './refs';
import { voicePhrases } from './interlinear';
import { englishFor } from './sefaria';

// The next piece, ready before he asks (Nov 8: "when I said continue, Gemini went right away, not so OpenAI"). The
// same piece, in the same form, that the chat route's "read at once" hands the voice on "go on" (app/api/chat/
// route.ts, the `early` block; keep the two alike). The page fetches it after each turn (app/api/live/next), and on
// "go on" hands it to the voice at once, without waiting for the server; the chat route is told it was handed.
// Returns null whenever the chat route would not read at once (Gemini, gist, Lamdan, Sephardi, a commentary) or an
// amud intro is due (the chat route gives it before the first line).
export async function nextEarly(o: { settings: Settings; history: MessageRow[]; sources: SourceRow[]; approved: ApprovedEntry[] }): Promise<{ early: string; at: Expect } | null> {
  const s = o.settings;
  if (s.nusach === 'sephardi' || s.liveEngine === 'gemini' || s.voiceReads === 'gist') return null;
  const lamdan = !!styleById(s.style, s.customStyles).preload || (!!s.blend && !!styleById(s.blend, s.customStyles).preload);
  if (lamdan) return null;
  const place = currentPlace(o.history, o.sources);
  if (!place || / on /i.test(place.base)) return null;
  const wantsIntro = (s.style === 'reader' || s.blend === 'reader') && s.amudIntro !== false && s.introVoice !== false;
  const introSaid = (base: string) => o.history.some((m) => m.role === 'assistant' && (m.meta as { introFor?: string } | null)?.introFor === base);
  if (wantsIntro && place.n <= 1 && (place.part ?? 1) <= 1 && !introSaid(place.base)) return null;
  const sec = await section(place.base, o.sources, o.approved);
  let nx = sec ? nextPiece({ base: place.base, he: sec.he, en: sec.en }, place) : null;
  let nb = place.base;
  if (sec && !nx) {
    const b2 = nextSection(place.base);
    const sec2 = b2 ? await section(b2, o.sources, o.approved) : null;
    if (b2 && sec2?.he.length) { nb = b2; nx = nextPiece({ base: b2, he: sec2.he, en: sec2.en }, { n: 0 }) ?? null; }
  }
  if (!nx) return null;
  if (nb !== place.base) return null; // a new amud or perek: the chat route opens it (and may give its intro)
  const enB = sec?.enB?.[nx.n - 1];
  const hePh = voicePhrases(nx.he);
  const enLine = nx.en ? namesForSpeechEn(englishFor(nx.en, enB, s.translate, !!nx.part, nx.he)) : '';
  const body = `${hePh.map((x) => voiceHe(x, s.heRead)).join(' | ')}${enLine ? ` | ${enLine}` : ''}`;
  void splitRef;
  return { early: `[[say]]${body}[[/say]]`, at: { base: nb, n: nx.n, ...(nx.part ? { part: nx.part } : {}) } };
}
