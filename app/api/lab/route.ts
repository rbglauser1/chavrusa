import { NextRequest, NextResponse } from 'next/server';
import { costUsd, MODELS, Provider, STYLES, Tier } from '@/lib/config';
import { approvedList, getSettings, listMemories, logCost } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/instructions';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { findRef } from '@/lib/prefetch';
import { getText } from '@/lib/sefaria';
import { textForModel } from '@/lib/tools';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Style lab: the same source and learner message, answered once per style, for side-by-side comparison.
// Nothing is saved to sessions; the cost is logged as "lab".
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const source = String(b.source ?? '').trim();
  const message = String(b.message ?? '').trim() || "Let's start.";
  const styleIds: string[] = Array.isArray(b.styles) && b.styles.length ? b.styles : STYLES.map((s) => s.id);
  try {
    const settings = await getSettings();
    const provider: Provider = b.provider === 'openai' || b.provider === 'anthropic' ? b.provider : settings.provider;
    const tier: Tier = ['basic', 'middle', 'top'].includes(b.tier) ? b.tier : settings.tier;
    const model = MODELS[provider][tier];
    const [approved, memories] = await Promise.all([approvedList(), listMemories()]);
    let srcText = '';
    let ref: string | null = null;
    if (source) {
      ref = await findRef(source, true);
      if (!ref) return NextResponse.json({ error: `Couldn't find "${source}".` }, { status: 400 });
      const s = await getText(ref, approved);
      if (!s.verdict.allowed) return NextResponse.json({ error: s.verdict.reason }, { status: 400 });
      const { verdict, ...src } = s;
      srcText = textForModel(src);
    }
    const run = provider === 'anthropic' ? runAnthropic : runOpenAI;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });

    const results = await Promise.all(styleIds.map(async (id) => {
      const st = STYLES.find((s) => s.id === id);
      if (!st) return { style: id, error: 'Unknown style' };
      const system = buildSystemPrompt({ ...settings, style: id, blend: null }, memories.filter((m) => !m.scope?.startsWith('session:')), ref ? [ref] : [], today);
      const t0 = Date.now();
      try {
        const r = await run({
          model: model.id, system, tools: [], execute: async () => '', maxSteps: 1,
          effort: model.effort, thinking: model.thinking,
          history: [{ role: 'user', content: srcText ? `${message}\n\n[The app already opened this source for the learner.]\n${srcText}` : message }],
        });
        const usd = costUsd(model, r.inputTokens, r.outputTokens, r.cachedTokens ?? 0, r.cacheWriteTokens ?? 0);
        await logCost({ kind: 'lab', provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: usd }).catch(() => {});
        return { style: id, name: st.name, text: r.text, usd, seconds: (Date.now() - t0) / 1000, words: r.text.split(/\s+/).filter(Boolean).length };
      } catch (e) {
        return { style: id, name: st.name, error: (e as Error).message };
      }
    }));
    return NextResponse.json({ ref, model: model.label, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
