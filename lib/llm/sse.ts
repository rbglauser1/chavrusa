// Reads a server-sent-events response and yields each event's name and parsed JSON data.
export async function* readSSE(res: Response): AsyncGenerator<{ event: string; data: any }> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      const text = dataLines.join('\n');
      if (!text || text === '[DONE]') continue;
      try { yield { event, data: JSON.parse(text) }; } catch { /* skip malformed */ }
    }
  }
}
