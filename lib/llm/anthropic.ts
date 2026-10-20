import 'server-only';
import { readSSE } from './sse';
import { RunOptions, RunResult } from './types';

// Claude Messages API, streamed, with a tool-use loop. Text is passed to onText as it arrives.
export async function runAnthropic(o: RunOptions): Promise<RunResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');

  const messages: { role: 'user' | 'assistant'; content: unknown }[] = o.history.map((t) => ({ role: t.role, content: t.content }));
  const tools = o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  let inputTokens = 0, outputTokens = 0, cachedTokens = 0, cacheWriteTokens = 0;
  const texts: string[] = [];

  // Mark the end of the conversation as cacheable, so the next step (and the next turn) re-reads it
  // at the cache discount instead of paying full price for the whole history again.
  const withCacheMark = () => messages.map((m, i) => {
    if (i !== messages.length - 1) return m;
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as Record<string, unknown>[]);
    if (!blocks.length) return m;
    const last = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
    return { ...m, content: [...blocks.slice(0, -1), last] };
  });

  for (let step = 0; step < (o.maxSteps ?? 10); step++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      // The system prompt is marked cacheable so repeated exchanges cost less.
      body: JSON.stringify({
        model: o.model,
        max_tokens: 4000,
        stream: true,
        system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
        ...(tools.length ? { tools } : {}),
        messages: withCacheMark(),
      }),
    });
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      throw new Error(`Claude error ${res.status}: ${data?.error?.message ?? 'request failed'}`);
    }

    // Rebuild the content blocks from the stream.
    const blocks: any[] = [];
    let stopReason = '';
    for await (const { event, data } of readSSE(res)) {
      if (event === 'message_start') {
        const u = data.message?.usage ?? {};
        inputTokens += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        cachedTokens += u.cache_read_input_tokens ?? 0;
        cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
        outputTokens += u.output_tokens ?? 0;
      } else if (event === 'content_block_start') {
        const b = { ...data.content_block };
        if (b.type === 'tool_use') b._json = '';
        if (b.type === 'text') b.text = b.text ?? '';
        if (b.type === 'thinking') { b.thinking = b.thinking ?? ''; b.signature = b.signature ?? ''; }
        blocks[data.index] = b;
      } else if (event === 'content_block_delta') {
        const b = blocks[data.index];
        if (!b) continue;
        if (data.delta?.type === 'text_delta') { b.text += data.delta.text; o.onText?.(data.delta.text); }
        else if (data.delta?.type === 'input_json_delta') b._json += data.delta.partial_json ?? '';
        // Claude's private reasoning must be sent back exactly as received on the next step.
        else if (data.delta?.type === 'thinking_delta') b.thinking += data.delta.thinking ?? '';
        else if (data.delta?.type === 'signature_delta') b.signature += data.delta.signature ?? '';
      } else if (event === 'message_delta') {
        stopReason = data.delta?.stop_reason ?? stopReason;
        outputTokens += data.usage?.output_tokens ?? 0;
      } else if (event === 'error') {
        throw new Error(`Claude error: ${data.error?.message ?? 'stream failed'}`);
      }
    }

    const content = blocks.filter(Boolean).map((b) => {
      if (b.type === 'tool_use') {
        let input = {};
        try { input = b._json ? JSON.parse(b._json) : {}; } catch { /* leave empty */ }
        return { type: 'tool_use', id: b.id, name: b.name, input };
      }
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking, signature: b.signature };
      return b; // e.g. redacted_thinking, passed back unchanged
    }).filter((b: any) => !(b.type === 'thinking' && !b.thinking && !b.signature) && !(b.type === 'text' && !b.text));
    const stepText = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    if (stepText) texts.push(stepText);
    const calls = content.filter((b: any) => b.type === 'tool_use') as { id: string; name: string; input: Record<string, unknown> }[];

    if (stopReason !== 'tool_use' || calls.length === 0) break;

    // Keep spoken/visible text separated between steps.
    if (stepText) o.onText?.('\n\n');
    messages.push({ role: 'assistant', content });
    // Run lookups in parallel.
    const results = await Promise.all(calls.map(async (c) => {
      let out: string;
      try { out = await o.execute(c.name, c.input ?? {}); }
      catch (e) { out = `Error: ${(e as Error).message}`; }
      return { type: 'tool_result', tool_use_id: c.id, content: out };
    }));
    messages.push({ role: 'user', content: results });
  }

  return { text: texts.join('\n\n'), inputTokens, outputTokens, cachedTokens, cacheWriteTokens };
}
