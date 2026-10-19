import { NextRequest } from 'next/server';
import { costUsd, MODELS } from '@/lib/config';
import {
  addMessage, approvedList, createSession, getSession, getSettings, listMemories, listMessages, listSources,
  logCost, saveSettings, sessionCost, touchSession,
} from '@/lib/db';
import { buildSystemPrompt } from '@/lib/instructions';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { makeExecutor, ToolEvent, TOOLS } from '@/lib/tools';

export const runtime = 'nodejs';
export const maxDuration = 300; // deep models with several source lookups can take a while

// Streams newline-delimited JSON events: status, source, memory, mode, session, reply, cost, error.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: string = String(body.message ?? '').trim();
  let sessionId: string | null = body.sessionId ?? null;

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

        const [memories, history, sources, approved] = await Promise.all([
          listMemories(), listMessages(sid, 40), listSources(sid), approvedList(),
        ]);
        await addMessage(sid, 'user', message);

        const model = MODELS[settings.provider][settings.tier];
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
        const system = buildSystemPrompt(settings, memories, [...new Set(sources.map((s) => s.ref))], today);

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
          history: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user' as const, content: message }],
          tools: TOOLS,
          execute,
          effort: model.effort,
        });

        const reply = result.text || 'I got lost looking up sources. Could you say that again, or point me to a specific source?';
        await addMessage(sid, 'assistant', reply, { model: model.id, style: settings.style, blend: settings.blend });
        send({ type: 'reply', text: reply, model: model.label });

        const usd = costUsd(model, result.inputTokens, result.outputTokens);
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
