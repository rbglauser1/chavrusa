import { NextResponse } from 'next/server';
import { costUsd, MODELS } from '@/lib/config';
import { getSettings, listMessages, listSessions, logCost, type MessageRow, type SessionRow } from '@/lib/db';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { readJson, writeJson } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Chazara (Settings → Extras): a short recap of the last session's learning, and of an older one (about a week to a
// month ago), each with a few questions to test himself. Made by the AI once per session (and again only if more was
// learned in it since), then kept.
export type Recap = { sessionId: string; title: string; when: string; points: string[]; questions: { q: string; a: string }[] };

const PROMPT = `You help a learner review (chazara) what he learned with his chavrusa. From the conversation below, write:
"title": the place learned, short (like "Yoma 5b–6a" or "Bereishis 24");
"points": 3 to 5 short points that hold the main ideas of the sugya in order (the kashyos and teirutzim, the proofs, the conclusions), each one plain sentence;
"questions": 2 or 3 questions to test himself, each with a short answer ({"q": "...", "a": "..."}).
Use yeshivish English (Gemara, kashya, teirutz, braisa, Toirah). Only what the conversation actually covered. Reply with JSON only: {"title": "...", "points": [...], "questions": [...]}`;

const plain = (t: string) => t.replace(/\[\[say\]\][\s\S]*?\[\[\/say\]\]/gi, ' [the text was read] ').replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim();

async function recapOf(sess: SessionRow): Promise<Recap | null> {
  const msgs: MessageRow[] = await listMessages(sess.id, 200);
  const learned = msgs.filter((m) => m.role === 'assistant' && plain(m.content).length > 80);
  if (learned.length < 3) return null;
  const key = `chazara/${sess.id}-${msgs.length}.json`;
  const kept = await readJson<Recap>(key);
  if (kept) return kept;
  const convo = msgs.map((m) => `${m.role === 'user' ? 'Learner' : 'Chavrusa'}: ${plain(m.content).slice(0, 700)}`).join('\n').slice(-14000);
  const settings = await getSettings();
  const model = MODELS[settings.provider].middle;
  const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
  const r = await run({ model: model.id, system: PROMPT, history: [{ role: 'user', content: convo }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1 });
  await logCost({ sessionId: sess.id, kind: 'chazara', provider: settings.provider, model: model.id, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: costUsd(model, r.inputTokens, r.outputTokens) }).catch(() => {});
  try {
    const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const rec: Recap = {
      sessionId: sess.id, title: String(j.title ?? sess.title ?? 'Last time').slice(0, 80), when: sess.updated_at,
      points: (Array.isArray(j.points) ? j.points : []).map(String).slice(0, 6),
      questions: (Array.isArray(j.questions) ? j.questions : []).filter((x: { q?: unknown; a?: unknown }) => x?.q && x?.a).map((x: { q: unknown; a: unknown }) => ({ q: String(x.q), a: String(x.a) })).slice(0, 3),
    };
    if (!rec.points.length) return null;
    await writeJson(key, rec).catch(() => {});
    return rec;
  } catch { return null; }
}

export async function GET() {
  try {
    const sessions = await listSessions();
    const day = 24 * 3600 * 1000, now = Date.now();
    const last = sessions[0] ?? null;
    // An older one to review: the most recent session from 6 to 40 days ago.
    const older = sessions.find((x) => { const age = now - Date.parse(x.updated_at); return age > 6 * day && age < 40 * day; }) ?? null;
    const [a, b] = await Promise.all([last ? recapOf(last).catch(() => null) : null, older ? recapOf(older).catch(() => null) : null]);
    return NextResponse.json({ last: a, older: b });
  } catch (e) {
    return NextResponse.json({ last: null, older: null, error: (e as Error).message });
  }
}
