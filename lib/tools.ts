import 'server-only';
import { ApprovedEntry } from './approval';
import { Settings, STYLES, styleById } from './config';
import { addMemory, addSource, forgetMemory, listSessionRequests, SourceData } from './db';
import { getLinks, getText, resolveName, search, todaysLearning } from './sefaria';
import { stripNikud } from './hebrew';
import { ToolDef } from './llm/types';

export const TOOLS: ToolDef[] = [
  {
    name: 'get_text',
    description: 'Retrieve a source text from Sefaria by reference and show it to the learner in the Sefer panel. You may only quote or cite text you retrieved with this tool. Prefer precise refs (e.g. "Berakhot 2a:1-3", "Rashi on Genesis 1:1:1", "Shulchan Arukh, Orach Chayim 1:1", "Mishnah Berurah 1:1"). The result tells you if the source is not approved; never quote a source that is not approved.',
    parameters: { type: 'object', properties: { ref: { type: 'string', description: 'Sefaria reference' } }, required: ['ref'] },
  },
  {
    name: 'get_connections',
    description: 'List approved sources linked to a reference on Sefaria: commentaries, Rishonim, codes, Acharonim, midrash, etc. Use this to build the chain of sources for a sugya.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Optional filter, e.g. ["Commentary", "Halakhah", "Responsa", "Chasidut", "Musar"]' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'search_texts',
    description: 'Full-text search of Sefaria (Hebrew or English words). Returns refs with short snippets, approved sources only. Use to find where a topic is discussed.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'find_ref',
    description: 'Turn a name or partial title into a valid Sefaria reference, e.g. "Ketzos 1" or "Chazon Ish". Use when unsure how Sefaria spells a title.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'todays_learning',
    description: 'Get today\'s scheduled learning (Daf Yomi, weekly parsha, Mishnah Yomis, Rambam, Halacha Yomis, etc.) with refs.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'remember',
    description: 'Save something about the learner for future sessions. Use kind "instruction" right away when the learner tells you how to teach them (e.g. "don\'t translate Rashi"). Use kind "observation" ONLY after the learner agreed you may remember it. Use kind "note" for a chiddush, open question, or bookmark the learner wants saved.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['instruction', 'observation', 'note'] },
        content: { type: 'string', description: 'Short, clear, in the third person, e.g. "Prefers not to have Rashi translated."' },
        scope: { type: 'string', description: 'Optional: where it applies, e.g. "Gemara only". Omit if it applies everywhere.' },
      },
      required: ['kind', 'content'],
    },
  },
  {
    name: 'adjust',
    description: 'Record (or cancel) a request from the learner about HOW to learn, for the rest of this session: pace, depth, length, language, method, format, translation, who explains, and so on. These requests take priority over the style and default rules. Use remember instead if the learner says it should apply always.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'] },
        instruction: { type: 'string', description: 'For add: a short, clear instruction in the third person, e.g. "Explain fully; no length limit."' },
        id: { type: 'string', description: 'For remove: the id of the request to cancel.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'forget',
    description: 'Delete a saved memory by its id when the learner asks you to forget it.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'set_mode',
    description: `Change the learning style when the learner asks (e.g. "be gentler", "quiz me", "go deeper"). This updates the label they see. Style ids: ${STYLES.map((s) => `${s.id} (${s.name})`).join(', ')}. Use "blend" to combine a second style, or null to clear it. Use "leads" to change who explains first.`,
    parameters: {
      type: 'object',
      properties: {
        style: { type: 'string' },
        blend: { type: ['string', 'null'] },
        leads: { type: 'string', enum: ['learner', 'chavrusa'] },
      },
    },
  },
];

// The lean copy of a source that the AI reads (the learner sees the full text).
export function textForModel(s: SourceData): string {
  const he = clip(s.he.map(stripNikud), MAX_HE_CHARS);
  const en = clip(s.en, MAX_EN_CHARS);
  return [
    `REF: ${s.ref} (${s.heRef})`,
    `Shown to learner in the Sefer panel. Lines are numbered.`,
    `ORIGINAL:\n${he.text}${he.clipped ? '[…text continues; request a narrower ref for the rest]\n' : ''}`,
    s.translation
      ? `APPROVED TRANSLATION (${s.translation}):\n${en.text}${en.clipped ? '[…]\n' : ''}`
      : 'No approved translation available. If you translate, say it is your own translation.',
  ].join('\n\n');
}

export type ToolEvent =
  | { type: 'status'; text: string }
  | { type: 'source'; source: SourceData }
  | { type: 'memory'; text: string }
  | { type: 'mode'; settings: Partial<Settings> }
  | { type: 'requests'; items: { id: string; content: string }[] };

// The learner sees the full text; the AI gets a lean copy (no vowels, capped length) to save cost and time.
const MAX_HE_CHARS = 3500;
const MAX_EN_CHARS = 1500;

function clip(lines: string[], max: number): { text: string; clipped: boolean } {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = `[${i + 1}] ${lines[i]}\n`;
    if (out.length + next.length > max) return { text: out, clipped: true };
    out += next;
  }
  return { text: out, clipped: false };
}

export function makeExecutor(ctx: {
  sessionId: string;
  approved: ApprovedEntry[];
  saveSettings: (p: Partial<Settings>) => Promise<Settings>;
  emit: (e: ToolEvent) => void;
}) {
  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    switch (name) {
      case 'get_text': {
        const ref = String(args.ref ?? '');
        ctx.emit({ type: 'status', text: `Opening ${ref}…` });
        const s = await getText(ref, ctx.approved);
        if (!s.verdict.allowed) {
          return `NOT APPROVED: ${s.verdict.reason} Do not quote or rely on it. Tell the learner briefly that this source is outside the approved list, and continue with approved sources.`;
        }
        if (s.he.length === 0 && s.en.length === 0) return `No text found for "${ref}". Check the reference with find_ref.`;
        const { verdict, ...source } = s;
        ctx.emit({ type: 'source', source });
        await addSource(ctx.sessionId, source);
        return textForModel(source);
      }
      case 'get_connections': {
        const ref = String(args.ref ?? '');
        ctx.emit({ type: 'status', text: `Finding sources on ${ref}…` });
        const cats = Array.isArray(args.categories) ? args.categories.map(String) : undefined;
        const { allowed, excluded } = await getLinks(ref, ctx.approved, cats);
        if (!allowed.length) return `No approved connections found for ${ref}.`;
        const byCat: Record<string, string[]> = {};
        for (const l of allowed) (byCat[l.category || 'Other'] ??= []).push(`${l.ref}`);
        return Object.entries(byCat).map(([c, refs]) => `${c}:\n  ${refs.join('\n  ')}`).join('\n')
          + (excluded.length ? `\n\n(Excluded as not approved: ${excluded.length} works.)` : '');
      }
      case 'search_texts': {
        const q = String(args.query ?? '');
        ctx.emit({ type: 'status', text: `Searching for "${q}"…` });
        const hits = await search(q, ctx.approved);
        return hits.length ? hits.map((h) => `${h.ref}: ${h.snippet}`).join('\n') : 'No approved results.';
      }
      case 'find_ref': {
        const r = await resolveName(String(args.name ?? ''));
        return r.isRef ? `Valid ref: ${r.ref}` : `Not a complete ref. Suggestions: ${r.suggestions.join('; ') || 'none'}`;
      }
      case 'todays_learning': {
        const items = await todaysLearning();
        return items.map((i) => `${i.title}: ${i.display} (ref: ${i.ref})`).join('\n');
      }
      case 'remember': {
        const kind = (['instruction', 'observation', 'note'].includes(String(args.kind)) ? args.kind : 'note') as 'instruction' | 'observation' | 'note';
        const m = await addMemory({ kind, content: String(args.content ?? ''), scope: args.scope ? String(args.scope) : null });
        ctx.emit({ type: 'memory', text: m.content });
        return `Saved (id ${m.id}).`;
      }
      case 'adjust': {
        if (args.action === 'remove' && args.id) {
          await forgetMemory(String(args.id));
        } else if (args.action === 'add' && args.instruction) {
          await addMemory({ kind: 'instruction', content: String(args.instruction), scope: `session:${ctx.sessionId}` });
        } else return 'Nothing changed: give action "add" with an instruction, or "remove" with an id.';
        const items = (await listSessionRequests(ctx.sessionId)).map((m) => ({ id: m.id, content: m.content }));
        ctx.emit({ type: 'requests', items });
        return `Done. Requests for this session now: ${items.map((i) => `${i.content} (id ${i.id})`).join('; ') || 'none'}. Follow them over the style and defaults.`;
      }
      case 'forget': {
        await forgetMemory(String(args.id ?? ''));
        ctx.emit({ type: 'memory', text: 'Forgotten.' });
        return 'Forgotten.';
      }
      case 'set_mode': {
        const patch: Partial<Settings> = {};
        if (typeof args.style === 'string' && STYLES.some((s) => s.id === args.style)) patch.style = args.style;
        if (args.blend === null) patch.blend = null;
        else if (typeof args.blend === 'string' && STYLES.some((s) => s.id === args.blend)) patch.blend = args.blend;
        if (args.leads === 'learner' || args.leads === 'chavrusa') patch.leads = args.leads;
        const s = await ctx.saveSettings(patch);
        ctx.emit({ type: 'mode', settings: patch });
        return `Mode is now: ${styleById(s.style).name}${s.blend ? ` + ${styleById(s.blend).name}` : ''}; ${s.leads === 'learner' ? 'learner explains first' : 'Chavrusa explains first'}. Follow this style from now on.`;
      }
      default:
        return `Unknown tool ${name}.`;
    }
  };
}
