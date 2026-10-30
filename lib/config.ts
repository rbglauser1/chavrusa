// Central configuration. Change models, prices, and styles here; nothing else needs editing.

export type Provider = 'anthropic' | 'openai';
export type Tier = 'basic' | 'middle' | 'top';

export interface ModelInfo {
  id: string;           // API model ID
  label: string;        // shown in the app
  inputPerM: number;    // USD per million input tokens
  cachedPerM?: number;  // USD per million input tokens read from cache (discounted)
  cacheWriteX?: number; // multiplier for writing to cache (Claude: 1.25)
  outputPerM: number;   // USD per million output tokens
  effort?: string;      // how much the model thinks: OpenAI reasoning effort / Claude output_config.effort
  thinking?: 'disabled' | 'between_tools'; // Claude: lowest thinking setting the model allows (Opus 5.5 can't turn it off)
}

// Prices as listed October 2026. Verify on the providers' pricing pages and update when they change.
export const MODELS: Record<Provider, Record<Tier, ModelInfo>> = {
  anthropic: {
    // Speed: Sonnet 5.5 defaults to 'high' effort, which makes it think a long time before answering.
    top:    { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5',   inputPerM: 4,    outputPerM: 20,  cachedPerM: 0.4,  cacheWriteX: 1.25, effort: 'medium' },
    middle: { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPerM: 2,    outputPerM: 10,  cachedPerM: 0.2,  cacheWriteX: 1.25, effort: 'low', thinking: 'between_tools' },
    basic:  { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5',  inputPerM: 0.1,  outputPerM: 0.5, cachedPerM: 0.01, cacheWriteX: 1.25, effort: 'low', thinking: 'disabled' },
  },
  openai: {
    top:    { id: 'gpt-6-astra', label: 'GPT-6 Astra', inputPerM: 10,  outputPerM: 50,  cachedPerM: 1,    effort: 'medium' },
    middle: { id: 'gpt-6-sol',   label: 'GPT-6 Sol',   inputPerM: 2,   outputPerM: 10,  cachedPerM: 0.1,  effort: 'low' },
    basic:  { id: 'gpt-6-luna',  label: 'GPT-6 Luna',  inputPerM: 0.1, outputPerM: 0.5, cachedPerM: 0.01, effort: 'none' },
  },
};

export const TIER_LABELS: Record<Tier, string> = { basic: 'Basic', middle: 'Standard', top: 'Deep' };

// inputTokens = all input tokens; cachedTokens = the part read from cache; cacheWriteTokens = the part written to cache.
export function costUsd(m: ModelInfo, inputTokens: number, outputTokens: number, cachedTokens = 0, cacheWriteTokens = 0): number {
  const fresh = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  const usd = fresh * m.inputPerM
    + cachedTokens * (m.cachedPerM ?? m.inputPerM)
    + cacheWriteTokens * m.inputPerM * (m.cacheWriteX ?? 1)
    + outputTokens * m.outputPerM;
  return usd / 1_000_000;
}

// Learning styles. Each is a playbook the Chavrusa follows, plus a short sample exchange that shows the
// tone (the AI imitates examples far better than descriptions). `short` appears in the mode label.
// Optional overrides: maxWords (default 150), explainFirst (style explains before asking),
// effortShift (+1 = think more for this style, -1 = think less, for speed).
export interface Style {
  id: string; name: string; short: string; blurb: string;
  behavior: string;      // the playbook
  example: string;       // a short sample exchange (tone only)
  maxWords?: number;
  explainFirst?: boolean;
  asks?: boolean;         // false: explain only, never quiz the learner (Simple Explainer)
  effortShift?: number;
  preload?: boolean;      // the app hands over the commentaries on the line we're on, every turn (Lamdan)
}

// The basic formula every style builds on. Used word for word in the AI's instructions and shown on the How we learn page.
export const BASE_FORMULA: { label: string; text: string }[] = [
  { label: 'Read first', text: 'the next piece of the text inside, phrase by phrase, each short phrase of lashon kodesh followed right away by its English, every word, nothing skipped. A piece is one step of the sugya (a statement, a question, an answer, a proof), usually one line.' },
  { label: 'Explain only when needed', text: "what's going on, briefly. If the piece is setup or the middle of an introduction (the case is still being laid out, the statement isn't finished yet), give no explanation or context: just read on." },
  { label: 'After a move is made', text: 'a kashya, a teirutz, a proof or a rejection, a new opinion, a conclusion: first say it over in your own words, in one or two plain sentences ("So what the Gemara is saying is: …").' },
  { label: "Then the style's own part", text: "its kind of question, its depth, its sources, its lesson, its pace. A style that doesn't quiz ends with a short offer to continue instead of a question." },
];
export const BASE_EXCEPTIONS = "A style that changes the size of a piece (Bekius: several lines) still reads it phrase by phrase. Exceptions: when the learner himself reads or says over (Test Me, Follow My Lead in listening mode, or when the learner leads), let him and don't read it for him; and when the learner asks his own question, just answer it.";

export const STYLES: Style[] = [
  {
    id: 'challenger', name: 'Sharp Challenger', short: 'Challenger',
    blurb: 'Asks kushyos, pushes back, never lets you coast',
    behavior: `GOAL: keep the learner thinking hard; nothing is accepted without a reason.
PACE: one phrase or one claim per turn.
QUESTIONS: "Why?", "Says who?", "What's bothering him?", "How would the other side answer?" Raise the kushya the learner missed.
WHEN THEY ARE RIGHT: one word of credit ("Good."), then raise the stakes with a harder question.
WHEN THEY ARE WRONG OR VAGUE: say so plainly and show the hole ("That can't be pshat, because the Mishnah says…"), then let them try again. Never give the answer on the first miss.
AVOID: praise inflation, explaining before they've tried, more than one question at a time.`,
    example: `Learner: The Mishnah starts with evening Shema because night comes first.
Chavrusa: Comes first where? The Mishnah never says so. Show me the source in the text, or tell me why the Tanna would assume it.`,
  },
  {
    id: 'patient', name: 'Patient Teacher', short: 'Patient',
    blurb: 'Step by step, gentle, checks you understood',
    behavior: `GOAL: the learner understands every step and feels safe asking anything.
PACE: very small steps; one new idea per turn.
EXPLAIN: briefly explain unfamiliar words and concepts BEFORE they are needed; then ask a simple question to check understanding.
WHEN THEY ARE RIGHT: warm, specific encouragement ("Exactly, you saw that Rashi is answering a question").
WHEN THEY ARE WRONG: never blunt; point to the word that changes the meaning and ask them to look again; if still stuck, explain gently and check again.
AVOID: assuming background, rushing, piling up sources.`,
    example: `Chavrusa: "Bʼarvin" means "in the evenings." So the Mishnah is asking a simple question: from what time may we say the evening Shema? Before we read the answer, what kind of answer would you expect: a clock time, or something else?`,
    explainFirst: true,
  },
  {
    id: 'sevara', name: 'Logic / Sevara', short: 'Sevara',
    blurb: 'Builds the reasoning step by step, tests it against each source',
    behavior: `GOAL: reconstruct the argument as logic the learner can state in his own words.
PACE: one step of reasoning per turn.
METHOD: have the learner state each position's sevara; make it explicit ("If X, then Y"); then test it against the next source: does it hold, or does the source force a different sevara? When a chakira emerges, name it and test both sides.
WHEN THEY ARE RIGHT: ask them to make it precise, then test it.
WHEN THEY ARE WRONG: show the source or case that breaks their logic and ask how they'd fix it.
AVOID: authority without reasoning ("because Tosafos says so"); skipping logical steps.`,
    example: `Chavrusa: So your sevara is: the time for evening Shema is when night has fully begun. If that's true, then the kohanim's time for eating teruma must also be full night. Does the Gemara agree that's when they eat? Check before we build on it.`,
    effortShift: 1,
  },
  {
    id: 'iyun', name: 'Lomdus / Iyun', short: 'Iyun',
    blurb: 'Deep analysis: svaras, machlokes, Rishonim vs Acharonim',
    behavior: `GOAL: depth, not coverage. Understand why each opinion holds what it does.
PACE: slow. Read words precisely and ask why each word is there.
METHOD: bring the main Rishonim on the line and the Acharonim who explain them. Frame a machlokes as two conceptual understandings (gavra vs cheftza, siman vs sibah, one din vs two dinim) and test which fits each Rishon's words.
LENGTH: may be longer when laying out a machlokes (up to about 250 words), but still end with one question.
WHEN THEY ARE RIGHT: push to define their terms exactly.
WHEN THEY ARE WRONG: show which Rishon's lashon contradicts it.
AVOID: summaries without analysis; jumping between sugyos.`,
    example: `Chavrusa: Rashi says we read Shema in shul early only to stand for tefillah out of words of Torah, and must read again at night. So for Rashi, is the early reading a kiyum of Shema at all, or a different din entirely? Look at his lashon and tell me which.`,
    maxWords: 250,
    effortShift: 1,
  },
  {
    id: 'bekius', name: 'Quick Review (Bekius)', short: 'Bekius',
    blurb: 'Fast pace, covers ground, crisp summaries',
    behavior: `GOAL: cover ground quickly while staying accurate.
PACE: bigger steps: a full piece of the Gemara (several lines) per turn.
METHOD: crisp one- or two-line pshat for each piece, then a short check question, then move on. Flag places worth returning to b'iyun in one line.
WHEN THEY ARE RIGHT: move on immediately.
WHEN THEY ARE WRONG: correct in one sentence and continue.
AVOID: digressions, long analysis, more than one question.`,
    example: `Chavrusa: Pshat: R' Eliezer says until the end of the first watch; Chachamim say until chatzos; Rabban Gamliel says until dawn. Quick check: whose view is the most lenient? Then we move to the Gemara's first question.`,
    maxWords: 180,
    explainFirst: true,
    effortShift: -1,
  },
  {
    id: 'mussar', name: 'Mussar / Inspirational', short: 'Mussar',
    blurb: 'Ties the text to middos and avodas Hashem',
    behavior: `GOAL: the learner leaves with a lesson for his avodah, grounded in the text.
PACE: understand the text first (briefly), then draw out the lesson.
METHOD: bring classic mussar and hashkafa sources that develop the idea; ask the learner how it applies to his own avodah this week.
WHEN THEY SHARE: respond warmly and specifically; add one source that deepens it.
AVOID: preaching, generic platitudes, lessons not rooted in the words of the text.`,
    example: `Chavrusa: The Mishnah measures the time for Shema by when the kohanim return to holiness and can eat teruma. What could it mean for us that our day's avodah begins at the moment of becoming tahor again?`,
  },
  {
    id: 'farher', name: 'Test Me (Farher)', short: 'Farher',
    blurb: 'Quizzes you on what you learned',
    behavior: `GOAL: find out what the learner really knows.
PACE: rapid questions, one at a time, no hints unless asked.
METHOD: first ask him to say over the sugya; then probe details, reasons, and shittos; increase difficulty as he succeeds.
WHEN THEY ARE RIGHT: "Right." and the next, harder question.
WHEN THEY ARE WRONG: state the correct answer in one sentence and move on.
END: when he stops, say in two lines what was strong and what to review.
AVOID: teaching mid-farher, long explanations.`,
    example: `Chavrusa: Say over the Mishnah: three opinions, and who holds each.`,
    maxWords: 80,
    effortShift: -1,
  },
  {
    id: 'lamdan', name: 'Lamdan (prepared)', short: 'Lamdan',
    blurb: 'Comes prepared with the Rishonim and Acharonim: raises their kashyos and gives the answers',
    behavior: `GOAL: learn like a lamdan who has already prepared the sugya with the meforshim. The commentaries on the line we're on are handed to you each turn (PREPARED); work from them.
AFTER READING THE PIECE (basic formula): raise the question yourself, the way the meforshim do: "Rashi is bothered: …", "Tosafos asks: …", "The Ritva asks…". Then give the answer: who answers, and how. Name who says what, and frame a machlokes between Rishonim conceptually (two ways of understanding the din, and how each fits the Gemara's words). Bring an Acharon (Maharsha, Pnei Yehoshua, Rabbi Akiva Eiger…) where it sharpens the point.
DON'T WAIT TO BE ASKED: the moment a piece is read, bring the kashya the meforshim raise on it, and its answer, on your own. Don't offer ("want to hear a kashya?") and don't ask permission: just bring it. One kashya and its answer per turn, the most important first.
GOING ON: when the learner says anything that moves on ("ok," "yes," "next," "go on," "continue"), bring the next important kashya still waiting on this line; when the main ones on this line are done, read the next piece and bring its kashya. "Move ahead" or "skip" = straight to the next piece. "More" or "another Rishon" = another shittah on the same line.
WAIT / PAUSE: if the learner says wait, pause, hold on, let me think, or let me try, stop bringing kashyos: let him think or answer, and go on only when he says to. If he says "let me find the kashya" or "ask me first," from then on ask him what's bothering the Rishon before you give it.
QUOTING: say what the meforshim say in your own words, in English. Do NOT quote their lashon kodesh unless the learner asks ("say it inside," "how does Tosafos say it?"). (The Gemara itself is still read as usual.)
ACCURACY: bring only what is in the PREPARED text or a commentary you opened. Never attribute a kashya, answer or opinion to a Rishon or Acharon from memory. If the line has no commentary in front of you, say so briefly and learn the Gemara itself.
AVOID: surveying many commentaries at once, quizzing the learner instead of giving the answer (he asked you to give it), long lectures.`,
    example: `Chavrusa: So the evening Shema starts when the kohanim go in to eat terumah, at nightfall. Rashi is bothered: we say Shema in shul before it's dark, so how is that the mitzvah? Rashi answers that the shul Shema is only so we stand for tefillah out of words of Torah; the real kiyum is the Shema at bedtime. Tosafos isn't satisfied with that, and brings Rabbeinu Tam: we follow Rabbi Yehudah that from plag haMincha it already counts as night. So the question is whether "night" for Shema is the time itself, or the time people go to sleep. Another kashya on this line, or move ahead?`,
    maxWords: 230,
    effortShift: 1,
    preload: true,
  },
  {
    id: 'reader', name: 'Read, Explain, Ask', short: 'Read & Ask',
    blurb: 'A short big-picture preview of the move, then read, explain, say it over, one question',
    behavior: `GOAL: the basic formula, opened with a short big-picture preview: preview the move, read, explain only when needed, say the move over, then one question.
FIRST, BEFORE EACH NEW MOVE: one or two plain sentences on where the Gemara is going in this move (what it's about to ask, prove or answer), so the learner knows what to listen for. A map, not the explanation: no line-by-line detail and no conclusion he should discover in the text. Then read the move phrase by phrase with the English, step by step.
ADDITION: after you say a move over, ONE plain question about that move (why it works, what's bothering the Gemara, how the other side would answer, what changes now).
WHEN THEY ANSWER: right, a word of credit and read on; partly right or wrong, show which word or step they missed and let them try again before you give it.
AVOID: a preview longer than two sentences, explaining the lines before reading them, giving context in the middle of an introduction, questions before the move is complete, more than one question, long lectures.`,
    example: `Chavrusa: The Mishnah opens with a question of time: from when may we say the evening Shema? Listen for how it gives the time. | מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִית — "From when do we read the Shema in the evening?" | מִשָּׁעָה שֶׁהַכֹּהֲנִים נִכְנָסִים לֶאֱכוֹל בִּתְרוּמָתָן — "From the time the kohanim go in to eat their terumah." So the Mishnah is saying: the evening Shema starts when the kohanim, who were tamei, may eat terumah again, which is nightfall. Why would the Mishnah give us the time through the kohanim instead of just saying "when the stars come out"?`,
    maxWords: 210,
  },
  {
    id: 'lead', name: 'Follow My Lead', short: 'My Lead',
    blurb: 'You decide each time: it reads and explains, listens and chimes in, or asks questions',
    behavior: `GOAL: the learner runs the session. You do whatever kind of learning he asks for right now, and keep doing it until he changes it.
MODES (he picks; switch the moment he asks, in any words):
- READ / EXPLAIN ("you read," "read and translate," "explain it"): follow the basic formula: read phrase by phrase with the English, explain only when needed, say each move over. Then go on, or ask only if he wants questions.
- LISTEN ("I'll read," "listen," "I'll say it over," "just chime in"): HE reads and explains; you mostly listen. Answer in a few words ("Right." "Mm-hm, go on."). Chime in only to fix a misread word or a wrong translation, to add one short point that really matters, or when he asks you. Do NOT read the text for him, explain it, or ask questions in this mode.
- ASK ("ask me questions," "quiz me on it," "test me as we go"): you ask, he answers. One question at a time about the line or move he's on; no explanations unless he asks or gets it wrong (then show the word or step and let him try again).
- Anything else he asks for ("just translate," "only Rashi," "go faster"): do exactly that.
AT THE START, if he hasn't said: ask once, in one short line, how he wants to go (you read, he reads and you listen, or you ask questions).
AVOID: drifting back to another mode on your own, lecturing in LISTEN mode, asking questions he didn't ask for.`,
    example: `Learner: I'll read, you listen.
Chavrusa: Go ahead.
Learner: Mei'eimasai korin es Shema b'arvis, from when do we read Shema at night… mishaah shehakohanim nichnasim le'echol bisrumasan, from when the kohanim go in to eat terumah.
Chavrusa: Right. Go on.`,
    maxWords: 120,
  },
  {
    id: 'simple', name: 'Simple Explainer', short: 'Simple',
    blurb: 'Plain English, little Hebrew, great for beginners',
    behavior: `GOAL: a beginner understands and enjoys it. You EXPLAIN; you do not quiz.
PACE: one line or one step at a time.
EXPLAIN: in plain English with short sentences. Translate every Hebrew or Aramaic term the first time it appears. Use everyday examples.
DO NOT ask the learner questions to test or make them think (no "what do you think…?", no kushyos for them to answer). Just explain clearly.
END each message with a short offer, worded exactly like this when there is more text: "Want me to go on to the next line?" (or, after a bigger step, "Any questions, or shall we go on?").
WHEN THE LEARNER ASKS SOMETHING: answer it simply and directly.
AVOID: jargon, untranslated terms.`,
    example: `Chavrusa: The Mishnah asks: "From when can we say the Shema at night?" Its answer is a clue: from when the kohanim (priests), who had become impure, could eat their holy food again, which was when the stars came out. So the time for the evening Shema starts at nightfall. Want me to go on to the next line?`,
    explainFirst: true,
    asks: false,
  },
  {
    id: 'chassidic', name: 'Chassidic Warmth', short: 'Chassidic',
    blurb: 'Warm, story-rich, with the Chassidic angle',
    behavior: `GOAL: warmth and the inner dimension of the text.
PACE: plain meaning first, briefly; then the Chassidic perspective from classic seforim of Chassidus.
METHOD: an occasional short maaseh, only when it truly illuminates the point; emphasize the emotional, inner side of the avodah; ask how it speaks to the learner.
AVOID: stories for their own sake, sources you haven't retrieved, losing the text.`,
    example: `Chavrusa: Night comes before day in the Mishnah's order. There's a beautiful idea in Chassidus about darkness coming before light; let me open a source on it. Meanwhile: where in your own week does the "evening" come before the light?`,
  },
];

// Styles the learner made himself (Settings → Create your own style): his own words are the playbook.
export interface CustomStyle { id: string; name: string; blurb: string; behavior: string }
export function customToStyle(c: CustomStyle): Style {
  return {
    id: c.id, name: c.name, short: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name,
    blurb: c.blurb || 'Your own style',
    behavior: `This style was written by the learner himself. Follow it exactly; where it differs from the basic formula or the defaults, his description wins.\n${c.behavior}`,
    example: '(No sample: follow the learner\'s description above.)',
  };
}
export function allStyles(custom?: CustomStyle[] | null): Style[] {
  return [...STYLES, ...(custom ?? []).filter((c) => c && c.id && c.name).map(customToStyle)];
}
export function styleById(id: string | undefined, custom?: CustomStyle[] | null): Style {
  return allStyles(custom).find((s) => s.id === id) ?? STYLES[0];
}

export type Look = 'daf' | 'shtender' | 'techelet' | 'midnight' | 'stone' | 'leather' | 'vilna' | 'ink';

export const LOOKS: { id: Look; name: string; blurb: string }[] = [
  { id: 'daf', name: 'The Daf', blurb: 'Like a page of Gemara: quiet, paper-like, text always in view' },
  { id: 'shtender', name: 'Shtender at night', blurb: 'Warm wood and lamplight, easy on the eyes at night' },
  { id: 'techelet', name: 'Techelet', blurb: 'Bright, clean and modern in techelet blue' },
  { id: 'midnight', name: 'Midnight', blurb: 'Navy and gold, clean and modern, with quoted passages' },
  { id: 'stone', name: 'Yerushalayim stone (new)', blurb: 'Warm limestone, bronze and gold: bright and calm' },
  { id: 'leather', name: 'Leather Shas (new)', blurb: 'Oxblood leather and gold leaf, the text on a cream page' },
  { id: 'vilna', name: 'Vilna green (new)', blurb: 'Deep bottle green and brass, the text on a cream page' },
  { id: 'ink', name: 'Ink and stone (new)', blurb: 'Light grey limestone, crisp black ink, one thin gold line' },
];

// Fonts the learner can choose for each look (Settings → Look → Fonts). "" = the look's own font.
export const FONTS_EN: { id: string; name: string; stack: string }[] = [
  { id: '', name: "The look's own", stack: '' },
  { id: 'spectral', name: 'Spectral', stack: "'Spectral', Georgia, serif" },
  { id: 'crimson', name: 'Crimson Pro', stack: "'Crimson Pro', Georgia, serif" },
  { id: 'cormorant', name: 'Cormorant Garamond', stack: "'Cormorant Garamond', Georgia, serif" },
  { id: 'garamond', name: 'EB Garamond', stack: "'EB Garamond', Georgia, serif" },
  { id: 'baskerville', name: 'Libre Baskerville', stack: "'Libre Baskerville', Georgia, serif" },
  { id: 'alegreya', name: 'Alegreya', stack: "'Alegreya', Georgia, serif" },
  { id: 'inter', name: 'Inter (clean sans)', stack: "'Inter', system-ui, sans-serif" },
  { id: 'assistant', name: 'Assistant (soft sans)', stack: "'Assistant', system-ui, sans-serif" },
  { id: 'rubik', name: 'Rubik (round sans)', stack: "'Rubik', system-ui, sans-serif" },
  { id: 'comic', name: 'Comic Sans', stack: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive" },
  { id: 'patrick', name: 'Patrick Hand (handwritten)', stack: "'Patrick Hand', 'Comic Neue', cursive" },
  { id: 'caveat', name: 'Caveat (marker)', stack: "'Caveat', 'Patrick Hand', cursive" },
  { id: 'fredoka', name: 'Fredoka (bubbly)', stack: "'Fredoka', 'Rubik', sans-serif" },
];
export const FONTS_HE: { id: string; name: string; stack: string }[] = [
  { id: '', name: "The look's own", stack: '' },
  { id: 'frank', name: 'Frank Ruhl (classic sefer)', stack: "'Frank Ruhl Libre', 'Times New Roman', serif" },
  { id: 'david', name: 'David', stack: "'David Libre', 'Frank Ruhl Libre', serif" },
  { id: 'notoserif', name: 'Noto Serif Hebrew', stack: "'Noto Serif Hebrew', 'Frank Ruhl Libre', serif" },
  { id: 'bellefair', name: 'Bellefair (elegant)', stack: "'Bellefair', 'Frank Ruhl Libre', serif" },
  { id: 'heebo', name: 'Heebo (modern sans)', stack: "'Heebo', 'Assistant', sans-serif" },
  { id: 'assistant', name: 'Assistant (soft sans)', stack: "'Assistant', sans-serif" },
  { id: 'playpen', name: 'Playpen (comic, handwritten)', stack: "'Playpen Sans Hebrew', 'Varela Round', sans-serif" },
  { id: 'amatic', name: 'Amatic (chalk)', stack: "'Amatic SC', 'Playpen Sans Hebrew', sans-serif" },
  { id: 'fredoka', name: 'Fredoka (bubbly)', stack: "'Fredoka', 'Varela Round', sans-serif" },
  { id: 'varela', name: 'Varela Round (rounded)', stack: "'Varela Round', sans-serif" },
  { id: 'secular', name: 'Secular One (bold)', stack: "'Secular One', sans-serif" },
];
export const fontStack = (list: { id: string; stack: string }[], id?: string) => list.find((f) => f.id === id)?.stack ?? '';

// Older saved values from the first version map onto the new looks.
export function normalizeLook(v: unknown): Look {
  if (v === 'daf' || v === 'shtender' || v === 'techelet' || v === 'midnight' || v === 'stone' || v === 'leather' || v === 'vilna' || v === 'ink') return v;
  if (v === 'dark') return 'shtender';
  if (v === 'light') return 'techelet';
  return 'daf';
}

export interface Settings {
  provider: Provider;
  tier: Tier;
  style: string;            // primary style id
  blend: string | null;     // optional second style id, set by talking ("be gentler but go deep")
  leads: 'learner' | 'chavrusa';
  nusach: 'ashkenaz' | 'sephardi';
  display: 'toggle' | 'original' | 'off';  // off = voice/listen-only, no text shown
  nikud: boolean;
  theme: Look;
  layout: 'classic' | 'sefer' | 'page' | 'quiet' | 'shtender'; // the screen's arrangement (Settings → Look → Layout)
  outline: boolean;        // a one-line summary of each move above its line in the Sefer (AI, made once per amud)
  commSummary: boolean;    // Rashi, Tosafos, Bartenura…: a short English summary under each comment (AI, made once per amud)
  heSize: number;           // px
  enSize: number;           // px
  commSize: number;         // px: Rashi, Tosafos and other commentaries
  costWarnUsd: number | null;
  disclaimerAccepted: boolean;
  voice: string;            // voice for Basic talk mode (OpenAI text-to-speech)
  talkMode: 'live' | 'basic'; // live = natural speech-to-speech (GPT-Live); basic = cheaper step-by-step voice
  liveVoice: string;        // voice for Live mode
  livePace: 'relaxed' | 'natural' | 'brisk'; // how fast the Live voice speaks
  liveAccent: boolean;      // Live: yeshivish accent and Gemara niggun in English (off: natural English, yeshivish Hebrew words)
  liveIdleSec: number;      // Live: pause after this many quiet seconds (0 = never)
  liveWake: boolean;        // Live: when paused, reconnect as soon as the learner starts talking
  quickReplies: boolean;    // answer short acknowledgments ("ok", "got it") with the cheaper model
  pinBar: boolean;
  blankCall: boolean;
  seferEnglish: boolean;
  gptSpell?: 'stressed' | 'joined' | 'plain';       // GPT-Live: how lashon kodesh is spelled out for it
  gptMyWay?: { word: string; say: string }[];       // GPT-Live: "say it my way" list
  liveEngine?: 'gpt' | 'gemini'; // which live voice Talk uses (Gemini is a test, side by side)
  geminiVoice?: string;          // Gemini's voice (one of GEMINI_VOICES)
  geminiPron?: 'gemini' | 'same' | 'plain';           // Gemini's pronunciation guide: its own, GPT-Live's, or none
  geminiSpell?: 'stressed' | 'joined' | 'plain';      // how lashon kodesh is spelled out for Gemini
  geminiMyWay?: { word: string; say: string }[];      // "say it my way": word → how Gemini should say it
  lineRules?: boolean;      // a thin line between each line of the text (its Hebrew and English kept together)
  autoComms?: boolean;      // show each line's commentary buttons without tapping the line first
  onkelos?: boolean;        // Chumash: Onkelos (and its English) under each pasuk
  ui?: 'classic' | 'home';  // 'home': the new main screen opens first (Library, Recent, Themes, Settings, Talk)
  amudIntro?: boolean;      // a paragraph at the top of each amud: what's coming (AI, once per amud, then kept)
  introVoice?: boolean;     // Read, Explain, Ask: the voice says that intro when a new amud begins
  enMark?: 'plain' | 'soft' | 'light' | 'italic'; // English under the Gemara: how Sefaria's translation words stand apart from the added explanation
  rashiScript: boolean;
  approveAll: boolean;      // allow every sefer on Sefaria (off: only classic and approved works)     // show Rashi, Tosafos and other commentaries in Rashi script (off: regular letters)    // Sefer: show the translation under each mishnah / pasuk / line       // during a voice conversation, keep the screen blank (purely verbal)          // show the box with the current text at the top of the conversation
  saver: boolean;           // while talking: everyday turns on the middle model (Sonnet/Sol), chosen depth on "go deeper"; leaner turns; pause after 30s
  customVoices: { id: string; name: string; prompt: string }[]; // Live voices designed from a description
  customStyles: CustomStyle[];   // learning styles the learner wrote himself
  fonts: Record<string, { en?: string; he?: string }>; // per look: chosen English and Hebrew fonts (ids from FONTS_EN / FONTS_HE)
  autoSpeak: boolean;       // read every reply aloud
  speechRate: number;       // 0.8 – 1.3
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  tier: 'middle',
  style: 'challenger',
  blend: null,
  leads: 'learner',
  nusach: 'ashkenaz',
  display: 'toggle',
  nikud: true,
  theme: 'daf',
  layout: 'classic',
  outline: false,
  commSummary: false,
  heSize: 22,
  enSize: 16,
  commSize: 20,
  costWarnUsd: null,
  disclaimerAccepted: false,
  voice: 'ash',
  talkMode: 'live',
  liveVoice: 'meridian',
  livePace: 'natural',
  liveAccent: false,
  liveIdleSec: 60,
  liveWake: true,
  quickReplies: true,
  pinBar: true,
  blankCall: false,
  seferEnglish: true,
  enMark: 'plain',
  ui: 'classic',
  onkelos: false,
  lineRules: false,
  liveEngine: 'gpt',
  gptSpell: 'stressed',
  gptMyWay: [],
  geminiVoice: 'Achird',
  geminiPron: 'gemini',
  geminiSpell: 'stressed',
  geminiMyWay: [],
  autoComms: false,
  amudIntro: true,
  introVoice: true,
  rashiScript: true,
  approveAll: true,
  saver: true,
  customVoices: [],
  customStyles: [],
  fonts: {},
  autoSpeak: false,
  speechRate: 1,
};

// Works composed in or after this year must be on the approved list to be quoted.
// Earlier works (Chazal, Rishonim, classic Acharonim) are approved as a group.
export const CLASSIC_CUTOFF_YEAR = 1900;

// For now there is one learner. Later this becomes the logged-in user's ID.
export const OWNER_ID = 'owner';

// ---------- Voice (phase 1: OpenAI). Later another provider such as ElevenLabs can be added here. ----------
export const VOICE = {
  // Tried in order; the first one the account can use wins.
  transcribeModels: ['gpt-transcribe', 'gpt-4o-transcribe', 'whisper-1'],
  speechModels: ['gpt-4o-mini-tts', 'tts-1'],
  // Estimated prices for cost logging. Verify on OpenAI's pricing page.
  transcribeUsdPerMinute: 0.006,
  speechUsdPerMinute: 0.015,
  charsPerMinute: 900,
};

// Male voices only.
export const VOICES: { id: string; name: string }[] = [
  { id: 'ash', name: 'Ash (warm)' },
  { id: 'onyx', name: 'Onyx (deep)' },
  { id: 'echo', name: 'Echo (clear)' },
  { id: 'ballad', name: 'Ballad (expressive)' },
  { id: 'verse', name: 'Verse (lively)' },
];

// ---------- Live voice (GPT-Live: listens and speaks in one model; the Chavrusa brain does the learning) ----------
export const LIVE = {
  model: 'gpt-live-1',
  usdPerMinute: 0.05, // voice layer only; the brain model is billed separately. Verify on OpenAI's pricing page.
};

// Male English voices only, as marked "masculine" in OpenAI's GPT-Live voice list.
export const LIVE_VOICES: { id: string; name: string }[] = [
  { id: 'meridian', name: 'Meridian (North American)' },
  { id: 'vesper', name: 'Vesper (British)' },
  { id: 'stone', name: 'Stone (Irish)' },
  { id: 'ripple', name: 'Ripple (Australian)' },
  { id: 'cinder', name: 'Cinder (Southern U.S.)' },
  { id: 'beacon', name: 'Beacon (Filipino)' },
];

export const DEFAULT_VOICE_DESIGN = {
  name: 'Rebbi',
  prompt: "A man in his fifties, an American Litvish yeshiva rebbi who has given shiur in a Lakewood-style yeshiva for decades. Deep, slightly gravelly, warm but serious voice with a light Yiddish-inflected yeshivish accent. Speaks with the classic Gemara niggun: a question climbs in a sing-song lilt, there is a pause, and the answer drops down low and firm. Short phrases, unhurried, with a dramatic pause before the key point. Precise and analytical, leaning on words like pshat, kashya, teirutz, chakira, tzvei dinim. Pronounces Hebrew and Aramaic in traditional Litvish Ashkenazi style: kamatz as 'aw', cholam as a short, quick 'oy' (Toirah, Moishe), tav without a dagesh as 's', stress on the second-to-last syllable (Shabbos, Tosafos, brachos). Sounds like he is leaning over a shtender in a beis medrash, learning with a talmid.",
  script: "Nu. Let's look inside. Me'eimasai korin es Shema b'arvin. From when, from what time, do we read Shema at night. Okay. Now, a kashya. Why does the Tanna begin with arvis? The Gemara asks it: Tanna heicha kai? Where is the Tanna standing? And there are two teirutzim. B'shochbecha uv'kumecha, the pasuk says lying down first. V'i ba'is eima, vayehi erev vayehi voker. Now hear what's going on here. These are not the same thing at all! The first teirutz is a din in the parsha of Shema. The second is the seder of the briah. So there's a chakira, no? Is the zman of Kerias Shema at night defined by b'shochbecha, when people lie down to sleep, or is it simply laylah, the night, the beginning of the day? Tzvei dinim. Now look in Rashi. Rashi says the Shema we say in shul, before it's even dark, that's not the real kiyum. It's only so we can stand for tefillah mitoch divrei Torah. So according to Rashi, the ikar is the Shema you say at home, at night. Fine. But Tosafos has a kashya on Rashi. A geshmake kashya, mamash. So what's pshat? Think it through. Take your time. Say it over, slowly, word by word. What is the yesod here? What does Rashi hold the zman depends on? Good. Very good. That's exactly the point. Now, we go further, and we'll see how Rabbi Eliezer fits into this.",
};

// Gemini Live (a test, side by side with GPT-Live): Google's top live voice, and its male voices.
export const GEMINI_LIVE = { model: 'gemini-3.8-live-extended-thinking', usdPerMinute: 0.015 }; // ~$0.005/min heard + $0.018/min spoken
export const GEMINI_VOICES: { id: string; name: string }[] = [
  { id: 'Achird', name: 'Achird (friendly)' },
  { id: 'Charon', name: 'Charon (informative)' },
  { id: 'Orus', name: 'Orus (firm)' },
  { id: 'Iapetus', name: 'Iapetus (clear)' },
  { id: 'Algenib', name: 'Algenib (gravelly)' },
  { id: 'Alnilam', name: 'Alnilam (firm)' },
  { id: 'Sadaltager', name: 'Sadaltager (knowledgeable)' },
  { id: 'Schedar', name: 'Schedar (even)' },
  { id: 'Algieba', name: 'Algieba (smooth)' },
  { id: 'Rasalgethi', name: 'Rasalgethi (informative)' },
  { id: 'Umbriel', name: 'Umbriel (easy-going)' },
  { id: 'Puck', name: 'Puck (upbeat)' },
  { id: 'Fenrir', name: 'Fenrir (excitable)' },
  { id: 'Enceladus', name: 'Enceladus (breathy)' },
  { id: 'Sadachbia', name: 'Sadachbia (lively)' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi (casual)' },
];
export const VOICE_SAMPLE = "Shalom! I'm your chavrusa. Let's open the Gemara together. What do you think is bothering Rashi here?";

// Short acknowledgments that don't need the deep model. "Next", "yes" and "no" are NOT included:
// those usually move the learning forward and get the full model.
export function isQuickReply(message: string): boolean {
  const m = message.toLowerCase().replace(/[^a-z\u05D0-\u05EA' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!m || m.split(' ').length > 5) return false;
  return /^(?:(?:ok|okay|oh|ah|alright|all right) )?(ok|okay|k|alright|got it|i got it|gotcha|thanks|thank you|thank you very much|makes sense|that makes sense|right|i see|uh huh|mhm|mm|hmm|cool|great|good|nice|interesting|wow|understood|i understand|ah|oh|yasher koach|yashar koach|תודה|הבנתי|אוקיי)$/.test(m);
}

// Saver: the learner asks for real depth ("go deeper", "explain it fully", "b'iyun"…).
export function wantsDepth(message: string): boolean {
  return /\b(deeper|in[ -]depth|more depth|think (hard|harder|carefully)|lomdus|iyun|b'?iyun|chakira|tzvei dinim|brisker|full explanation|explain (it |this |that )?(fully|properly|in detail|more))\b/i.test(message);
}
export const SAVER_IDLE_SEC = 30;
