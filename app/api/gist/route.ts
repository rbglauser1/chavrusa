import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { costUsd, MODELS } from '@/lib/config';
import { approvedList, getSettings, logCost } from '@/lib/db';
import { getText } from '@/lib/sefaria';
import { stripNikud } from '@/lib/hebrew';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Commentary summaries: what each Rashi / Tosafos / Bartenura… says, in a sentence or two of plain English
// (not a literal translation). Made once for a commentator on a whole amud / perek, then kept.
const PROMPT = `You summarize the comments of a classic commentator for a learner, in plain modern English: for each comment, one or two short sentences saying what it explains, or what it asks and how it answers. This is a summary, not a translation: give the point. Name the opinions it brings (Rabbeinu Tam, the Ri…) as it does. Use yeshivish Ashkenazi transliteration for names and terms (Shabbos, Tosafos, Rav Yehudah), say Hashem for G-d's Name, and add nothing that is not in the comment. If a comment only cites a source or is very short, say so in a few words.
Reply with JSON only: an array of strings, one per numbered comment, in the same order, the same count.`;

async function makeGists(title: string, refs: string[]): Promise<Record<string, string>> {
  const [settings, approved] = await Promise.all([getSettings(), approvedList()]);
  const got = await Promise.all(refs.map((r) => getText(r, approved).catch(() => null)));
  const items = refs.map((r, i) => ({ ref: r, he: got[i] && got[i]!.verdict.allowed ? got[i]!.he.map(stripNikud).join(' ') : '' })).filter((x) => x.he);
  if (!items.length) throw new Error('No text to summarize.');
  const clip = (t: string) => (t.length > 1400 ? `${t.slice(0, 1400)}…` : t);
  const body = items.map((x, i) => `[${i + 1}] ${clip(x.he)}`).join('\n\n').slice(0, 30000);
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({ model: model.id, system: PROMPT, history: [{ role: 'user', content: `${title}\n\n${body}` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: null, kind: 'gist', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  let arr: unknown = [];
  try { arr = JSON.parse(r.text.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch { arr = []; }
  const out: Record<string, string> = {};
  if (Array.isArray(arr)) items.forEach((x, i) => { const g = arr[i]; if (typeof g === 'string' && g.trim()) out[x.ref] = g.trim().slice(0, 600); });
  if (!Object.keys(out).length) throw new Error('The summaries did not come back in the right form.'); // not kept: tried again
  return out;
}

export async function POST(req: NextRequest) {
  const { title, section, refs } = await req.json().catch(() => ({}));
  const list = (Array.isArray(refs) ? refs : []).map(String).filter(Boolean).slice(0, 60);
  if (!title || !section || !list.length) return NextResponse.json({ gists: {} });
  try {
    const key = ['gist-v1', String(section), String(title), list.slice().sort().join('|')];
    const gists = await unstable_cache(() => makeGists(String(title), list), key, { revalidate: 60 * 60 * 24 * 30 })();
    return NextResponse.json({ gists });
  } catch (e) {
    return NextResponse.json({ gists: {}, error: (e as Error).message });
  }
}
