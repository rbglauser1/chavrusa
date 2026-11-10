import 'server-only';
import { ApprovedEntry } from './approval';
import { getLinks, getText, resolveName, search } from './sefaria';
import { textForModel } from './tools';
import { ToolDef, ToolExecutor } from './llm/types';

// The whole library, for the AI that writes Explain and the learner's own buttons: open any sefer, see what is linked
// to a line, search, and find a title. Only seforim on the approved list; nothing is shown to the learner or saved
// to a session. `used` collects every reference actually opened, so the answer can name its sources and the app can
// make each one tappable.
export const LIBRARY_TOOLS: ToolDef[] = [
  {
    name: 'read',
    description: 'Open any text in the library by its Sefaria reference and read it (Hebrew and English): a line or range of Gemara, a Rashi or Tosafos on a line ("Tosafot on Yoma 6a:3:1"), the Rambam, the Shulchan Aruch, a Midrash, a pasuk. Only approved seforim open.',
    parameters: { type: 'object', properties: { ref: { type: 'string', description: 'Sefaria reference' } }, required: ['ref'] },
  },
  {
    name: 'links',
    description: 'What the library links to a reference (a line): its meforshim (Rashi, Tosafos, Rishonim, Acharonim), where the halacha is ruled, parallel sugyos, Midrash, verses, machshava. Optionally only some categories, e.g. ["Commentary"], ["Halakhah"], ["Talmud"].',
    parameters: { type: 'object', properties: { ref: { type: 'string' }, categories: { type: 'array', items: { type: 'string' } } }, required: ['ref'] },
  },
  {
    name: 'search',
    description: 'Search the whole library for words (Hebrew or English); returns references with short snippets. Use it to find where else a topic, a phrase or an idea is discussed.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'find',
    description: 'Turn a name or partial title into a valid reference (e.g. "Ketzos 1", "Chazon Ish", "Ritva Yoma").',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
];

export function libraryExecutor(approved: ApprovedEntry[], used: Set<string>): ToolExecutor {
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  return async (name, args) => {
    try {
      if (name === 'read') {
        const ref = String(args.ref ?? '');
        const s = await getText(ref, approved);
        if (!s.verdict.allowed) return `NOT APPROVED: ${s.verdict.reason} Do not use it.`;
        if (!s.he.length && !s.en.length) return `No text found for "${ref}". Check the reference with find.`;
        used.add(s.ref);
        const { verdict: _v, ...src } = s; void _v;
        return clip(textForModel(src), 9000);
      }
      if (name === 'links') {
        const ref = String(args.ref ?? '');
        const cats = Array.isArray(args.categories) ? args.categories.map(String) : undefined;
        const { allowed } = await getLinks(ref, approved, cats, 400);
        if (!allowed.length) return `No approved links for ${ref}.`;
        const by: Record<string, string[]> = {};
        for (const l of allowed) (by[l.category || 'Other'] ??= []).push(l.ref);
        return clip(Object.entries(by).map(([c, r]) => `${c}:\n  ${r.slice(0, 40).join('\n  ')}`).join('\n'), 7000);
      }
      if (name === 'search') {
        const hits = await search(String(args.query ?? ''), approved);
        return hits.length ? clip(hits.slice(0, 15).map((h) => `${h.ref}: ${h.snippet}`).join('\n'), 5000) : 'No approved results.';
      }
      if (name === 'find') {
        const r = await resolveName(String(args.name ?? ''));
        return r.isRef ? `Valid ref: ${r.ref}` : `Not a complete ref. Suggestions: ${r.suggestions.join('; ') || 'none'}.`;
      }
      return 'Unknown tool.';
    } catch (e) { return `That didn't work: ${(e as Error).message}`; }
  };
}

/** The sources an answer names (a reference written as ⟦ref⟧), only those really opened. */
export function sourcesNamed(text: string, used: Set<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/⟦([^⟧]{2,120})⟧/g)) { const r = m[1].trim(); if (used.has(r) && !out.includes(r)) out.push(r); }
  return out;
}
