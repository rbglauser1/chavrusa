// Learn with me by voice (Nov 15): the chavrusa leads the call, line by line, the same way the Learn with me panel does
// (components/LearnWithMe.tsx). The panel's 🎙 button sets the mode and the line here; the call's setup reads it
// (?guide=ask|learn&at=<ref:n>) and adds the leading instructions and opening below. It lasts for that one call.

// ——— on the phone ———
let pending: { mode: 'ask' | 'learn'; at: string } | null = null;
export function setVoiceGuide(g: { mode: 'ask' | 'learn'; at: string } | null) { pending = g; }
/** Added to the call's setup address; used once (a later call is an ordinary one). */
export function takeVoiceGuide(q: URLSearchParams) {
  if (!pending) return;
  q.set('guide', pending.mode); q.set('at', pending.at);
  pending = null;
}

// ——— on the server ———
export function voiceGuide(params: URLSearchParams): { block: string; opening: string } | null {
  const mode = params.get('guide');
  const at = String(params.get('at') ?? '').slice(0, 200);
  if ((mode !== 'ask' && mode !== 'learn') || !/:\d+$/.test(at)) return null;
  const [, base, n] = at.match(/^(.*):(\d+)$/)!;
  // Nov 15: one way of leading (the panel's Ask me / Just learn switch is gone): an opening that gets him into it, then
  // line by line, with a question only now and then.
  const block = `

# LEARN WITH ME — YOU LEAD (this call)
The learner asked you to lead him through ${base} one line at a time, like a chavrusa who takes charge of the learning. This overrides "never go on to the next line on your own" — but ONLY by delegating: you still never read or quote any text yourself; you get every line from the backend.
First, the opening: before any line, get him into it in 3 or 4 sentences — the puzzle or big question this section deals with, why it matters, and one thing to listen for. Don't give away the answer. (Delegate "what is ${base} about" first if you need to.)
Then for each line:
1. Get it: delegate "read the next line" (the first time: "read ${base} line ${n}").
2. Say in one short sentence what this line is doing ("now the beraisa brings a proof"), then explain it in two to four clear sentences.
3. Only about every third line, and at real turning points (a question, a contradiction, a proof that falls, a surprising ruling), first ask him ONE short question about the line and wait. If he answers, say plainly what he got right and fill in the rest; if he says he doesn't know or "just tell me", explain it simply.
4. Then keep going by yourself: delegate "read the next line". Do not ask "shall we go on?" — just go on, unless he stops you.
"Stop asking me questions" → no more questions. "Stop" or "wait" → stop leading and listen. Any question of his comes first: answer it, then continue leading. At the end of the section, sum it up in two sentences and ask whether to go on to the next one.`;
  const opening = `Speak first: give the short opening that gets him into ${base} (the puzzle or big question, why it matters, one thing to listen for), then say you'll take him through it line by line, and start: delegate "read ${base} line ${n}".`;
  return { block, opening };
}
