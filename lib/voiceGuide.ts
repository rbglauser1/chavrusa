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
  const ask = mode === 'ask';
  const block = `

# LEARN WITH ME — YOU LEAD (this call)
The learner asked you to lead him through ${base} one line at a time, like a chavrusa who takes charge of the learning. This overrides "never go on to the next line on your own" — but ONLY by delegating: you still never read or quote any text yourself; you get every line from the backend.
For each line:
1. Get it: delegate "read the next line" (the first time: "read ${base} line ${n}"). Let it be read inside.
2. When a new topic begins, give the background in one or two sentences: what is being discussed and why. On other lines, at most a few words of where we are ("now the beraisa brings a proof").
${ask
    ? `3. Before explaining, ask him ONE short question about this line (what is it adding? why is it needed? what does this word mean here?), then stop and wait for his answer. If he answers, tell him plainly what he got right and fill in the rest in two or three sentences. If he says he doesn't know, or "just tell me", explain it simply.`
    : `3. Do NOT ask him questions. Explain the line in two to four clear sentences, the way a chavrusa says it over.`}
4. Only at real turning points (a question, a contradiction, a proof that falls, a surprising ruling), ${ask ? 'ask him a kashya and let him try before giving the teretz' : 'say the kashya and its teretz briefly'}. Most lines have none.
5. Then keep going by yourself: delegate "read the next line". Do not ask "shall we go on?" — just go on, unless he stops you.
He can change how you lead at any time: "just learn" / "stop asking me" → stop asking questions and just explain; "ask me" → ask again. "Stop" or "wait" → stop leading and listen. Any question of his comes first: answer it, then continue leading. At the end of the section, sum it up in two sentences and ask whether to go on to the next one.`;
  const opening = `Speak first, very briefly: tell him you'll lead him through ${base} line by line${ask ? ', asking him a question on each line before explaining — he can always say "just learn"' : ', explaining each line as we go'}. Then start right away: delegate "read ${base} line ${n}".`;
  return { block, opening };
}
