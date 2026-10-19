import 'server-only';
import { readSSE } from './sse';
import { RunOptions, RunResult } from './types';

// OpenAI Responses API, streamed, with a function-calling loop (GPT-6 tools require the Responses API).
export async function runOpenAI(o: RunOptions): Promise<RunResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set.');

  const tools = o.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false }));
  let input: unknown[] = o.history.map((t) => ({ role: t.role, content: t.content }));
  let previous: string | undefined;
  let inputTokens = 0, outputTokens = 0;
  const texts: string[] = [];

  for (let step = 0; step < (o.maxSteps ?? 10); step++) {
    const body: Record<string, unknown> = { model: o.model, instructions: o.system, input, stream: true };
    if (tools.length) body.tools = tools;
    if (o.effort) body.reasoning = { effort: o.effort };
    if (previous) body.previous_response_id = previous;

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      throw new Error(`OpenAI error ${res.status}: ${data?.error?.message ?? 'request failed'}`);
    }

    let final: any = null;
    let stepText = '';
    for await (const { event, data } of readSSE(res)) {
      const type = data?.type ?? event;
      if (type === 'response.output_text.delta' && typeof data.delta === 'string') {
        stepText += data.delta;
        o.onText?.(data.delta);
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        final = data.response;
      } else if (type === 'response.failed' || type === 'error') {
        throw new Error(`OpenAI error: ${data?.response?.error?.message ?? data?.message ?? data?.error?.message ?? 'stream failed'}`);
      }
    }
    if (!final) throw new Error('OpenAI stream ended without a response.');

    inputTokens += final.usage?.input_tokens ?? 0;
    outputTokens += final.usage?.output_tokens ?? 0;
    const output: any[] = Array.isArray(final.output) ? final.output : [];
    const calls = output.filter((i) => i.type === 'function_call');
    if (!stepText) {
      stepText = output.filter((i) => i.type === 'message').flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('\n');
    }
    if (stepText.trim()) texts.push(stepText.trim());
    if (calls.length === 0) break;

    if (stepText.trim()) o.onText?.('\n\n');
    const outputs: unknown[] = [];
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.arguments || '{}'); } catch { /* leave empty */ }
      let out: string;
      try { out = await o.execute(c.name, args); }
      catch (e) { out = `Error: ${(e as Error).message}`; }
      outputs.push({ type: 'function_call_output', call_id: c.call_id, output: out });
    }
    previous = final.id;
    input = outputs;
  }

  return { text: texts.join('\n\n'), inputTokens, outputTokens };
}
