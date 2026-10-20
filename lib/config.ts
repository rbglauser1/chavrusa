// Central configuration. Change models, prices, and styles here; nothing else needs editing.

export type Provider = 'anthropic' | 'openai';
export type Tier = 'basic' | 'middle' | 'top';

export interface ModelInfo {
  id: string;           // API model ID
  label: string;        // shown in the app
  inputPerM: number;    // USD per million input tokens
  outputPerM: number;   // USD per million output tokens
  effort?: string;      // OpenAI reasoning effort
}

// Prices as listed October 2026. Verify on the providers' pricing pages and update when they change.
export const MODELS: Record<Provider, Record<Tier, ModelInfo>> = {
  anthropic: {
    top:    { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5',   inputPerM: 4,    outputPerM: 20 },
    middle: { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPerM: 2,    outputPerM: 10 },
    basic:  { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5',  inputPerM: 0.1,  outputPerM: 0.5 },
  },
  openai: {
    top:    { id: 'gpt-6-astra', label: 'GPT-6 Astra', inputPerM: 10,  outputPerM: 50,  effort: 'high' },
    middle: { id: 'gpt-6-sol',   label: 'GPT-6 Sol',   inputPerM: 2,   outputPerM: 10,  effort: 'medium' },
    basic:  { id: 'gpt-6-luna',  label: 'GPT-6 Luna',  inputPerM: 0.1, outputPerM: 0.5, effort: 'low' },
  },
};

export const TIER_LABELS: Record<Tier, string> = { basic: 'Basic', middle: 'Standard', top: 'Deep' };

export function costUsd(m: ModelInfo, inputTokens: number, outputTokens: number): number {
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}

// Learning styles. `short` appears in the mode label; `behavior` goes into the Chavrusa's instructions.
export interface Style { id: string; name: string; short: string; blurb: string; behavior: string }

export const STYLES: Style[] = [
  {
    id: 'challenger', name: 'Sharp Challenger', short: 'Challenger',
    blurb: 'Asks kushyos, pushes back, never lets you coast',
    behavior: 'Never give the answer first. After each source ask what it says and why. Challenge weak or vague answers directly ("That can\'t be pshat, because..."). Raise kushyos the learner missed. Praise only real insight, briefly. Keep the learner doing the thinking.',
  },
  {
    id: 'patient', name: 'Patient Teacher', short: 'Patient',
    blurb: 'Step by step, gentle, checks you understood',
    behavior: 'Move one small step at a time. Explain unfamiliar words and concepts before they are needed. After each step, check understanding with a simple question. Never make the learner feel slow. Still ask before explaining when the learner can likely work it out.',
  },
  {
    id: 'sevara', name: 'Logic / Sevara', short: 'Sevara',
    blurb: 'Builds the reasoning step by step, tests it against each source',
    behavior: 'Treat the sugya as an argument to reconstruct. Ask the learner to state each position\'s reasoning in their own words. Build the logic explicitly (if X, then Y), then test it against the next source: does it hold, or does the next source force a different sevara? Name the underlying chakira when one emerges.',
  },
  {
    id: 'iyun', name: 'Lomdus / Iyun', short: 'Iyun',
    blurb: 'Deep analysis: svaras, machlokes, Rishonim vs Acharonim',
    behavior: 'Go slowly and deeply. Read words precisely and ask why each word is there. Bring the main Rishonim and the Acharonim who explain them. Frame machlokes as competing conceptual understandings (e.g., gavra vs cheftza, siman vs sibah). Push the learner to define terms exactly.',
  },
  {
    id: 'bekius', name: 'Quick Review (Bekius)', short: 'Bekius',
    blurb: 'Fast pace, covers ground, crisp summaries',
    behavior: 'Keep a brisk pace and cover ground. Give crisp one-line summaries of each piece and move on. Ask short questions to keep the learner engaged but do not dig into every detail. Flag places worth returning to b\'iyun.',
  },
  {
    id: 'mussar', name: 'Mussar / Inspirational', short: 'Mussar',
    blurb: 'Ties the text to middos and avodas Hashem',
    behavior: 'After understanding the text, draw out its lesson for middos and avodas Hashem using classic mussar and hashkafa sources. Ask the learner how it applies to their own avodah. Stay grounded in the text; do not preach.',
  },
  {
    id: 'farher', name: 'Test Me (Farher)', short: 'Farher',
    blurb: 'Quizzes you on what you learned',
    behavior: 'Act as a farher. Ask the learner to say over the sugya, then ask probing questions on details, reasons, and shittos. Correct mistakes clearly and briefly. Increase difficulty as they succeed. At the end, say what was strong and what to review.',
  },
  {
    id: 'simple', name: 'Simple Explainer', short: 'Simple',
    blurb: 'Plain English, little Hebrew, great for beginners',
    behavior: 'Use plain English and short sentences. Translate every Hebrew or Aramaic term the first time it appears. Use everyday examples. Still ask the learner simple questions so they think, not just listen.',
  },
  {
    id: 'chassidic', name: 'Chassidic Warmth', short: 'Chassidic',
    blurb: 'Warm, story-rich, with the Chassidic angle',
    behavior: 'Be warm and encouraging. After the plain meaning, bring the Chassidic perspective from classic seforim of Chassidus, and an occasional short maaseh when it truly illuminates the point. Emphasize the inner, emotional dimension of the avodah.',
  },
];

export function styleById(id: string | undefined): Style {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export type Look = 'daf' | 'shtender' | 'techelet';

export const LOOKS: { id: Look; name: string; blurb: string }[] = [
  { id: 'daf', name: 'The Daf', blurb: 'Like a page of Gemara: quiet, paper-like, text always in view' },
  { id: 'shtender', name: 'Shtender at night', blurb: 'Warm wood and lamplight, easy on the eyes at night' },
  { id: 'techelet', name: 'Techelet', blurb: 'Bright, clean and modern in techelet blue' },
];

// Older saved values from the first version map onto the new looks.
export function normalizeLook(v: unknown): Look {
  if (v === 'daf' || v === 'shtender' || v === 'techelet') return v;
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
  heSize: number;           // px
  enSize: number;           // px
  costWarnUsd: number | null;
  disclaimerAccepted: boolean;
  voice: string;            // voice for Basic talk mode (OpenAI text-to-speech)
  talkMode: 'live' | 'basic'; // live = natural speech-to-speech (GPT-Live); basic = cheaper step-by-step voice
  liveVoice: string;        // voice for Live mode
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
  heSize: 22,
  enSize: 16,
  costWarnUsd: null,
  disclaimerAccepted: false,
  voice: 'ash',
  talkMode: 'live',
  liveVoice: 'meridian',
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

export const VOICES: { id: string; name: string }[] = [
  { id: 'ash', name: 'Ash (warm, male)' },
  { id: 'onyx', name: 'Onyx (deep, male)' },
  { id: 'echo', name: 'Echo (clear, male)' },
  { id: 'sage', name: 'Sage (calm)' },
  { id: 'coral', name: 'Coral (bright, female)' },
  { id: 'shimmer', name: 'Shimmer (soft, female)' },
];

// ---------- Live voice (GPT-Live: listens and speaks in one model; the Chavrusa brain does the learning) ----------
export const LIVE = {
  model: 'gpt-live-1',
  usdPerMinute: 0.05, // voice layer only; the brain model is billed separately. Verify on OpenAI's pricing page.
};

export const LIVE_VOICES: { id: string; name: string }[] = [
  { id: 'meridian', name: 'Meridian' },
  { id: 'marin', name: 'Marin' },
  { id: 'stone', name: 'Stone' },
  { id: 'vesper', name: 'Vesper' },
  { id: 'willow', name: 'Willow' },
  { id: 'quartz', name: 'Quartz' },
  { id: 'ripple', name: 'Ripple' },
  { id: 'gleam', name: 'Gleam' },
  { id: 'bossa', name: 'Bossa' },
  { id: 'tempo', name: 'Tempo' },
  { id: 'beacon', name: 'Beacon' },
  { id: 'delta', name: 'Delta' },
  { id: 'cinder', name: 'Cinder' },
];
