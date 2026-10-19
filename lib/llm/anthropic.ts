import 'server-only';
import { RunOptions, RunResult } from './types';

// Claude Messages API with a tool-use loop.
export async function runAnthropic(o: RunOptions): Promise<RunResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');

  const messages: { role: 'user' | 'assistant'; content: unknown }[] = o.history.map((t) => ({ role: t.role, content: t.content }));
  const tools = o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  let inputTokens = 0, outputTokens = 0;
  const texts: string[] = [];

  for (let step = 0; step < (o.maxSteps ?? 10); step++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      // The system prompt is marked cacheable so repeated exchanges cost less.
      body: JSON.stringify({
        model: o.model,
        max_tokens: 4000,
        system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
        ...(tools.length ? { tools } : {}),
        messages,
      }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Claude error ${res.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 300)}`);

    const u = data.usage ?? {};
    inputTokens += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    outputTokens += u.output_tokens ?? 0;

    const content: any[] = Array.isArray(data.content) ? data.content : [];
    const stepText = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const calls = content.filter((b) => b.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || calls.length === 0) {
      if (stepText) texts.push(stepText);
      break;
    }
    // Text written alongside tool calls is usually a short "let me look that up"; keep only the final answer.
    messages.push({ role: 'assistant', content });
    const results: unknown[] = [];
    for (const c of calls) {
      let out: string;
      try { out = await o.execute(c.name, c.input ?? {}); }
      catch (e) { out = `Error: ${(e as Error).message}`; }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return { text: texts.join('\n\n'), inputTokens, outputTokens };
}
