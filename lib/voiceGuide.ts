// Learn with me by voice (Nov 15): the chavrusa leads the call, line by line, the same way the Learn with me panel does
// (components/LearnWithMe.tsx). The panel's 🎙 button sets the mode and the line here; the call's setup reads it
// (?guide=ask|learn&at=<ref:n>) and adds the leading instructions and opening below. It lasts for that one call.

// ——— on the phone ———
import { setSitting } from './focus';

let pending: { mode: 'ask' | 'learn' | 'sit'; at: string } | null = null;
export function setVoiceGuide(g: { mode: 'ask' | 'learn' | 'sit'; at: string } | null) { pending = g; }
/** Added to the call's setup address; used once (a later call is an ordinary one). */
export function takeVoiceGuide(q: URLSearchParams) {
  if (!pending) { setSitting(false); return; }
  q.set('guide', pending.mode); q.set('at', pending.at);
  setSitting(pending.mode === 'sit'); // Sit with me: the call isn't paused when quiet (lib/focus; app/page.tsx)
  pending = null;
}

// ——— on the server ———
export function voiceGuide(params: URLSearchParams): { block: string; opening: string } | null {
  const mode = params.get('guide');
  const at = String(params.get('at') ?? '').slice(0, 200);
  if (mode === 'sit') return sitWithMe(at.replace(/:\d+$/, '') || 'the sefer');
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

// Sit with me (Nov 16, Focus help): the learner reads by himself and the chavrusa keeps him company, like a friend at
// the next seat ("body doubling", which helps many people with ADHD start and stay with a task). The app sends a
// CHECK-IN when it has been quiet for a few minutes (Settings → Focus help).
function sitWithMe(base: string): { block: string; opening: string } {
  const block = `

# SIT WITH ME (this call)
The learner is learning ${base} BY HIMSELF, and asked you to keep him company while he does, like a chavrusa sitting next to him. This changes how you behave for the whole call:
- Stay quiet. Do not read, explain, quiz or lead. Silence is good: it means he is learning.
- When he speaks to you, answer briefly and warmly (a question about the text: answer it in two or three sentences, delegating as usual to see the text), then go quiet again so he can go back to it.
- When the app sends a CHECK-IN, he has been quiet for a while: say ONE short, warm sentence, different each time, that brings him back without pressure, e.g. "Still with it? Where are you holding?" or "How's it going over there?" Never scold, never mention time or minutes. If he says he drifted off, help him find his place in one sentence, then let him read.
- If he says he's done, tell him in one sentence that it was good learning together.`;
  const opening = `Speak first, in one or two short, warm sentences: you're here with him while he learns ${base} on his own; if he needs anything, just say so. Then be quiet.`;
  return { block, opening };
}
