import { NextRequest, NextResponse } from 'next/server';
import { approvedList } from '@/lib/db';
import { stripNikud } from '@/lib/hebrew';
import { findRef } from '@/lib/prefetch';
import { getLinks, getText, resolveName, search, todaysLearning } from '@/lib/sefaria';

export const runtime = 'nodejs';

// The Chavrusa's "seforim" for ChatGPT (or Claude): a small read-only MCP server.
// It only looks texts up on Sefaria through the app's approved-source rules. It never calls an AI,
// never writes anything, and holds no secrets, so it costs nothing to use beyond a few lookups.

const INSTRUCTIONS = `These tools give you the real text of Torah sources from Sefaria, filtered to approved Orthodox sources.
When learning with the user as a chavrusa: never quote or paraphrase a specific line from memory. Use find_place to get the reference, get_text for the lines you are discussing (a few lines at a time with from_line), and get_commentary only when the user asks about a commentary. Keep track of the line number the user is on.`;

const TOOLS = [
  {
    name: 'find_place',
    title: 'Find a place',
    description: 'Turn how a learner names a place ("Brachos 36b", "Bava Basra daf 21a", "today\'s daf", "this week\'s parsha", "Bereishis 1:1") into an exact Sefaria reference. Call this before get_text when unsure of the reference.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'The place, as the learner said it' } }, required: ['query'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_text',
    title: 'Get the text',
    description: 'The real text (Hebrew/Aramaic with an approved English translation) of a daf, perek or pasuk, as numbered lines. A "line" is one Sefaria segment, usually a statement ending at the "two dots" in the Gemara. Use from_line and count to get just the lines being learned (for example the learner\'s line and the next few). Always use this instead of quoting from memory.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Exact reference, e.g. "Berakhot 36b", "Genesis 1", "Mishnah Berakhot 1"' },
        from_line: { type: 'integer', description: 'First line number to return (default 1)' },
        count: { type: 'integer', description: 'How many lines (default 6, max 20)' },
      },
      required: ['ref'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_commentary',
    title: 'Get a commentary',
    description: 'An approved commentary (Rashi, Tosafos, Ramban, Rashbam, Ibn Ezra, Sforno, Ohr HaChaim, Onkelos, etc.) on a reference. Use only when the learner asks about a commentary.',
    inputSchema: {
      type: 'object',
      properties: {
        commentator: { type: 'string', description: 'e.g. "Rashi", "Tosafos", "Ramban"' },
        ref: { type: 'string', description: 'The text it comments on, e.g. "Berakhot 36b" or "Genesis 1:1"' },
      },
      required: ['commentator', 'ref'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'todays_learning',
    title: "Today's learning",
    description: "Today's Daf Yomi, this week's parsha, and other daily learning, with references.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'search_texts',
    title: 'Search texts',
    description: 'Search approved Torah texts for a word or phrase (Hebrew or English). Returns references with short snippets.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const ALIAS: [RegExp, string][] = [
  [/^to[iy]?s[aeo]?(?:f|ph)[aeo]?[st]s?$/i, 'Tosafot'], [/^or?h? ?ha ?chaim$/i, 'Or HaChaim'], [/^s'?e?forno$/i, 'Sforno'],
  [/^onkelos$|^targum$/i, 'Onkelos'], [/^baal ha ?turim$/i, 'Baal HaTurim'], [/^bartenura$|^bertinoro$/i, 'Bartenura'],
];

const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' …' : t);

async function lines(ref: string, from = 1, count = 6): Promise<string> {
  const approved = await approvedList();
  const s = await getText(ref, approved);
  if (!s.verdict.allowed) return `Not approved: ${s.verdict.reason} Do not quote or rely on it.`;
  const total = Math.max(s.he.length, s.en.length);
  if (!total) return `No text found for "${ref}". Try find_place first.`;
  const start = Math.min(Math.max(1, from), total);
  const end = Math.min(total, start + Math.min(Math.max(1, count), 20) - 1);
  const out: string[] = [];
  for (let k = start; k <= end; k++) {
    const he = clip(stripNikud(s.he[k - 1] ?? ''), 700);
    const en = s.en[k - 1] ? clip(s.en[k - 1], 600) : '';
    out.push(`[${k}] ${he}${en ? `\n    ${en}` : ''}`);
  }
  const tr = s.translation ? `Translation: ${s.translation.replace(/,.*$/, '')}.` : 'No approved translation; any translation you give is your own.';
  return `${s.ref}: lines ${start}-${end} of ${total}. ${tr}${end < total ? ` For more, call get_text with from_line ${end + 1}.` : ''}\n${out.join('\n')}`;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'find_place': {
      const q = String(args.query ?? '').trim();
      const ref = await findRef(q, true);
      if (ref) return `Reference: ${ref}`;
      const r = await resolveName(q).catch(() => null);
      return r?.suggestions.length ? `Not an exact place. Did you mean: ${r.suggestions.join('; ')}` : `Couldn't find "${q}".`;
    }
    case 'get_text':
      return lines(String(args.ref ?? ''), Number(args.from_line ?? 1) || 1, Number(args.count ?? 6) || 6);
    case 'get_commentary': {
      const approved = await approvedList();
      let who = String(args.commentator ?? '').trim();
      for (const [re, to] of ALIAS) if (re.test(who)) who = to;
      const ref = String(args.ref ?? '');
      const links = await getLinks(ref, approved, ['Commentary', 'Targum']);
      const hit = links.allowed.find((l) => l.title.toLowerCase().includes(who.toLowerCase()) || l.ref.toLowerCase().startsWith(who.toLowerCase()));
      if (!hit) return `No approved ${who} found on ${ref}.`;
      const index = hit.ref.replace(/\s\d.*$/, '');
      const section = ref.match(/\s(\d.*)$/)?.[1];
      const text = section ? await lines(`${index} ${section}`, 1, 12).catch(() => '') : '';
      return text && !/^No text|^Not approved/.test(text) ? text : lines(hit.ref, 1, 12);
    }
    case 'todays_learning': {
      const items = await todaysLearning();
      return items.map((i) => `${i.title}: ${i.display} (ref: ${i.ref})`).join('\n') || 'Nothing found.';
    }
    case 'search_texts': {
      const hits = await search(String(args.query ?? ''), await approvedList());
      return hits.length ? hits.map((h) => `${h.ref}: ${h.snippet}`).join('\n') : 'No approved results.';
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, any> };

async function handle(msg: Rpc): Promise<object | null> {
  const isRequest = msg.id !== undefined && msg.id !== null;
  const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion ?? '');
        return ok({
          protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'chavrusa-seforim', title: 'Chavrusa seforim', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        try {
          const text = await callTool(name, (msg.params?.arguments ?? {}) as Record<string, unknown>);
          return ok({ content: [{ type: 'text', text }], isError: false });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true });
        }
      }
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: [] });
      default:
        if (!isRequest) return null; // notifications (e.g. notifications/initialized) need no answer
        return err(-32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    return isRequest ? err(-32603, (e as Error).message) : null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as Rpc)))).filter(Boolean);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const res = await handle(body as Rpc);
  return res ? NextResponse.json(res) : new NextResponse(null, { status: 202 });
}

// This server answers each request directly; it doesn't keep an open event stream.
export async function GET() {
  return new NextResponse('Chavrusa seforim (MCP). Send JSON-RPC requests with POST.', { status: 405, headers: { Allow: 'POST' } });
}
export async function DELETE() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } }); }
