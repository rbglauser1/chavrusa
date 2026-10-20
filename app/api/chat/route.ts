import { NextRequest } from 'next/server';
import { costUsd, isQuickReply, MODELS, styleById } from '@/lib/config';
import {
  addMessage, approvedList, createSession, getSession, getSettings, listMemories, listMessages, listSources,
  logCost, saveSettings, sessionCost, touchSession,
} from '@/lib/db';
import { buildSystemPrompt } from '@/lib/instructions';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { makeExecutor, textForModel, ToolEvent, TOOLS } from '@/lib/tools';
import { prefetchSource, prepareCommentaries, warmTexts } from '@/lib/prefetch';
import { after } from 'next/server';
import { addSource } from '@/lib/db';

export const runtime = 'nodejs';

// Move the thinking level up or down, within what each model accepts.
function shiftEffort(effort: string | undefined, delta: number, provider: string, tier: string): string | undefined {
  if (!effort || !delta) return effort;
  const ladder = provider === 'openai'
    ? (tier === 'top' ? ['low', 'medium', 'high'] : ['none', 'low', 'medium', 'high'])
    : ['low', 'medium', 'high'];
  const i = ladder.indexOf(effort);
  if (i < 0) return effort;
  return ladder[Math.max(0, Math.min(ladder.length - 1, i + delta))];
}
export const maxDuration = 300; // deep models with several source lookups can take a while

// Streams newline-delimited JSON events: status, source, memory, mode, session, reply, cost, error.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: string = String(body.message ?? '').trim();
  let sessionId: string | null = body.sessionId ?? null;
  const spoken = body.voice === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        if (!message) throw new Error('Empty message.');
        let settings = await getSettings();

        // Session
        if (!sessionId || !(await getSession(sessionId))) {
          const s = await createSession(message.slice(0, 60));
          sessionId = s.id;
          send({ type: 'session', session: s });
        }
        const sid = sessionId as string;

        const approvedP = approvedList();
        // Open a named source (or today's daf) right away, in parallel with loading the session.
        const prefetchP = approvedP.then((a) => prefetchSource(message, a)).catch(() => null);
        const [memories, history, sources, approved] = await Promise.all([
          listMemories(), listMessages(sid, 24), listSources(sid), approvedP,
        ]);
        const pre = await prefetchP;
        // Prepare the sugya: list the main commentaries now, and load their texts in the background.
        // Never make the learner wait for this: use it only if it's ready almost immediately.
        const prepared = pre ? await Promise.race([
          prepareCommentaries(pre.ref, approved).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 400)),
        ]) : null;
        if (pre && !prepared) {
          try { after(async () => { const p = await prepareCommentaries(pre.ref, approved).catch(() => null); if (p) await warmTexts(p.refs, approved); }); } catch { /* optional */ }
        }
        if (prepared) {
          try { after(() => warmTexts(prepared.refs, approved)); }
          catch { void warmTexts(prepared.refs, approved); } // background warm-up is optional
        }
        if (pre && !sources.some((x) => x.ref === pre.ref)) {
          send({ type: 'source', source: pre });
          await addSource(sid, pre);
          sources.push({ id: 'pre', ref: pre.ref, he_ref: pre.heRef, data: pre, created_at: new Date().toISOString() });
        }
        await addMessage(sid, 'user', message);

        // Short acknowledgments go to the cheaper model of the same company; real learning turns use the chosen depth.
        const quick = settings.quickReplies !== false && isQuickReply(message) && !pre;
        const model = MODELS[settings.provider][quick ? 'basic' : settings.tier];
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
        const system = buildSystemPrompt(settings, memories, [...new Set(sources.map((s) => s.ref))], today, spoken, sid);

        const emit = (e: ToolEvent) => send(e);
        const execute = makeExecutor({
          sessionId: sid,
          approved,
          saveSettings: async (p) => (settings = await saveSettings(p)),
          emit,
        });

        send({ type: 'status', text: 'Thinking…' });
        const run = settings.provider === 'anthropic' ? runAnthropic : runOpenAI;
        const result = await run({
          model: model.id,
          system,
          history: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: pre
              ? `${message}\n\n[The app already opened this source for the learner. Its text is below, so you do not need get_text for it.]\n${textForModel(pre)}${prepared ? `\n\n[Main commentaries on this text (approved). Use get_text on a specific ref when you bring one; you do not need get_connections for these.]\n${prepared.list}` : ''}`
              : message },
          ],
          tools: TOOLS,
          execute,
          // Spoken turns need quick answers: think one level less.
          // Deep styles (Iyun, Sevara) think one level more; fast ones (Bekius, Farher) and spoken turns one level less.
          effort: shiftEffort(model.effort, (styleById(settings.style).effortShift ?? 0) - (spoken ? 1 : 0), settings.provider, settings.tier),
          thinking: model.thinking,
          maxSteps: 5,
          onText: (d) => send({ type: 'delta', text: d }),
        });

        const reply = result.text || 'I got lost looking up sources. Could you say that again, or point me to a specific source?';
        await addMessage(sid, 'assistant', reply, { model: model.id, style: settings.style, blend: settings.blend });
        send({ type: 'reply', text: reply, model: model.label });

        const usd = costUsd(model, result.inputTokens, result.outputTokens, result.cachedTokens ?? 0, result.cacheWriteTokens ?? 0);
        await logCost({ sessionId: sid, provider: settings.provider, model: model.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: usd });
        await touchSession(sid);
        send({ type: 'cost', usd, sessionUsd: await sessionCost(sid), inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      } catch (e) {
        send({ type: 'error', text: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
