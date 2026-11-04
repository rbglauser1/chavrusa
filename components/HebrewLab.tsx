'use client';
// Settings → Voice → Hebrew reading test: the same line of lashon kodesh in several ways of giving it to the voice
// (Hebrew letters, or spelled out in English letters in different ways), each heard in your own voice the way a call
// would read it. Pick the one that sounds best by ear, and the app uses it everywhere in calls.
import { useEffect, useRef, useState } from 'react';
import { LIVE_VOICES, type Settings } from '@/lib/config';
import { RULES, ruleText, STANDARD_RULES } from '@/lib/live';
import { Group } from './SettingsGroup';
import { hasNikud, HE_READS, isHebrewLetters, voiceHe, type HeRead } from '@/lib/hebrew';
import { silentWav } from './useVoice';

const TEXT_KEY = 'chavrusa-hebrew-test-line';
const VOTES_KEY = 'chavrusa-voice-votes'; // per voice: how many listens were good / not (this device)
type Votes = Record<string, { good: number; bad: number; gone?: boolean }>;
const COMBO_KEY = 'chavrusa-rule-combos'; // the rule lab: per combination of rules, good / not listens (this device)
const LINES = [
  { name: 'Mishnah', he: 'הָאִשָּׁה נִקְנֵית בְּשָׁלֹשׁ דְּרָכִים, וְקוֹנָה אֶת עַצְמָהּ בִּשְׁתֵּי דְרָכִים. נִקְנֵית בְּכֶסֶף, בִּשְׁטָר, וּבְבִיאָה.' },
  { name: 'Beis Shammai', he: 'בְּכֶסֶף, בֵּית שַׁמַּאי אוֹמְרִים: בְּדִינָר וּבְשָׁוֶה דִינָר. וּבֵית הִלֵּל אוֹמְרִים: בִּפְרוּטָה וּבְשָׁוֶה פְרוּטָה.' },
  { name: 'Gemara', he: 'מַאי שְׁנָא הָכָא דְּתָנֵי הָאִשָּׁה נִקְנֵית, וּמַאי שְׁנָא הָתָם דְּתָנֵי הָאִישׁ מְקַדֵּשׁ?' },
  { name: 'Bereishis', he: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ.' },
  { name: 'Hard Gemara', he: 'אָמַר רַב יוֹסֵף: סְמִיכָה אִיכָּא בֵּינַיְיהוּ. לְמַאן דְּאָמַר כׇּל הַכָּתוּב בָּהֶן מְעַכֵּב בָּהֶן, סְמִיכָה מְעַכְּבָא.' },
];
// What was wrong with a reading (tapped after hearing it), so the kind of mistake can be told apart: the words
// themselves, the vowels, the stress, or the accent. Each needs a different fix.
const WRONG = [['word', 'Words'], ['vowel', 'Vowels'], ['stress', 'Stress'], ['accent', 'Accent']] as const;
type Wrong = (typeof WRONG)[number][0];
function WrongChips({ value, onChange, disabled }: { value: Wrong[]; onChange: (v: Wrong[]) => void; disabled?: boolean }) {
  return (
    <div className="tuner-wrong" role="group" aria-label="What was wrong">
      {WRONG.map(([id, name]) => {
        const on = value.includes(id);
        return <button key={id} className={`chip ${on ? 'picked' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])}>{on ? '✗ ' : ''}{name}</button>;
      })}
    </div>
  );
}

// A two-way switch (the same look as the switches in Settings).
function Seg2<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <div className="seg">{options.map(([v, label]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}</div>;
}

export default function HebrewLab({ s, onChange, disabled }: { s: Settings; onChange: (p: Partial<Settings>) => void; disabled?: boolean }) {
  // The line being tested is remembered on this device, so it stays when Settings re-open or the page refreshes.
  const [text, setTextRaw] = useState<string>(() => { try { return localStorage.getItem(TEXT_KEY) || LINES[0].he; } catch { return LINES[0].he; } });
  const setText = (t: string) => { setTextRaw(t); try { localStorage.setItem(TEXT_KEY, t); } catch { /* not kept */ } };
  // What's playing, and what's happening with it, shown in its row: a way of reading ("he", "join-kh"…) or a voice
  // ("v:cedar").
  const [playing, setPlaying] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ mode: string; text: string } | null>(null);
  const [votes, setVotesRaw] = useState<Votes>(() => {
    try {
      const v: Votes = JSON.parse(localStorage.getItem(VOTES_KEY) || '{}');
      // Once: forget the voices the old check marked unavailable (it could be wrong), so they get a fair try again.
      if (!localStorage.getItem('chavrusa-voice-gone-reset-1')) {
        for (const k of Object.keys(v)) if (v[k]?.gone) delete v[k];
        localStorage.setItem(VOTES_KEY, JSON.stringify(v));
        localStorage.setItem('chavrusa-voice-gone-reset-1', '1');
      }
      return v;
    } catch { return {}; }
  });
  const setVotes = (f: (v: Votes) => Votes) => setVotesRaw((v) => { const n = f(v); try { localStorage.setItem(VOTES_KEY, JSON.stringify(n)); } catch { /* not kept */ } return n; });
  // The rule lab: which rules are switched on for the next listen (starts from what calls use), and the score so far.
  // The built-in rules and the ones he wrote himself (kept in his settings, so calls can use them too).
  const mine = s.customRules ?? [];
  const allRules: { id: string; name: string; about: string; mine?: boolean }[] = [...RULES, ...mine.map((r) => ({ id: r.id, name: r.name, about: r.text, mine: true }))];
  const comboId = (ids: string[]) => { const k = allRules.filter((r) => ids.includes(r.id)).map((r) => r.id); return k.length ? k.join(',') : 'none'; };
  const comboName = (id: string) => (id === 'none' ? 'No rules at all' : id.split(',').map((x) => allRules.find((r) => r.id === x)?.name ?? '(a deleted rule)').join(' + '));
  const [draft, setDraft] = useState<{ id: string; name: string; text: string } | null>(null);
  const [showRule, setShowRule] = useState<string | null>(null); // a built-in rule whose exact words are shown
  // The rule editor opens at the bottom: bring it into view.
  const draftRef = useRef<HTMLDivElement | null>(null);
  const draftOpen = !!draft;
  useEffect(() => { if (draftOpen) requestAnimationFrame(() => draftRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })); }, [draftOpen]);
  // One rule at a time (each its own row, nothing piles up) or mixing several.
  const [labMode, setLabModeRaw] = useState<'one' | 'mix'>(() => { try { return localStorage.getItem('chavrusa-rule-lab-mode') === 'mix' ? 'mix' : 'one'; } catch { return 'one'; } });
  const setLabMode = (m: 'one' | 'mix') => { setLabModeRaw(m); try { localStorage.setItem('chavrusa-rule-lab-mode', m); } catch { /* not kept */ } };
  function saveDraft() {
    if (!draft || !draft.text.trim()) return;
    const id = draft.id || `my-${Date.now().toString(36)}`;
    const rule = { id, name: draft.name.trim() || `My rule ${mine.length + 1}`, text: draft.text.trim().slice(0, 3000) };
    onChange({ customRules: draft.id ? mine.map((r) => (r.id === id ? rule : r)) : [...mine, rule] });
    if (!draft.id && labMode === 'mix') setCombo((c) => [...c, id]); // a new rule is switched on, ready to hear
    setDraft(null);
  }
  function deleteRule(id: string) {
    onChange({ customRules: mine.filter((r) => r.id !== id), ...(s.liveRules?.includes(id) ? { liveRules: s.liveRules.filter((x) => x !== id) } : {}) });
    setCombo((c) => c.filter((x) => x !== id));
    setDraft(null);
  }
  const callRules = s.liveRules?.length ? s.liveRules : STANDARD_RULES;
  const [combo, setCombo] = useState<string[]>(() => (callRules[0] === 'none' ? [] : callRules));
  const [combos, setCombosRaw] = useState<Record<string, { good: number; bad: number }>>(() => { try { return JSON.parse(localStorage.getItem(COMBO_KEY) || '{}'); } catch { return {}; } });
  const setCombos = (f: (v: Record<string, { good: number; bad: number }>) => Record<string, { good: number; bad: number }>) => setCombosRaw((v) => { const n = f(v); try { localStorage.setItem(COMBO_KEY, JSON.stringify(n)); } catch { /* not kept */ } return n; });
  const cid = comboId(combo);
  const voteCombo = (good: boolean, id = cid) => setCombos((v) => ({ ...v, [id]: { good: (v[id]?.good ?? 0) + (good ? 1 : 0), bad: (v[id]?.bad ?? 0) + (good ? 0 : 1) } }));
  const useInCalls = (id: string) => onChange({ liveRules: id === 'none' ? ['none'] : id.split(','), liveShort: true });
  const inCalls = comboId(callRules[0] === 'none' ? [] : callRules);
  const vote = (id: string, good: boolean) => setVotes((v) => ({ ...v, [id]: { good: (v[id]?.good ?? 0) + (good ? 1 : 0), bad: (v[id]?.bad ?? 0) + (good ? 0 : 1) } }));
  const el = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { endRef.current?.(); ctxRef.current?.close().catch(() => {}); }, []);
  const inUse: HeRead = s.heRead ?? 'join-kh';

  // Have GPT-Live read the line given this way, the way a call would (a short Live connection, about a cent).
  async function hear(mode: HeRead, voice?: string, rules?: string, instr?: 'short' | 'full', keyAs?: string, pace?: string, say?: string) {
    const key = keyAs ?? (rules !== undefined ? `r:${rules}` : voice ? `v:${voice}` : mode);
    if (playing) { endRef.current?.(); if (playing === key) return; }
    setMsg(null);
    const note = (t: string) => setMsg({ mode: key, text: t });
    note('Connecting…');
    // Inside the tap: unlock the player and the small sound engine (phones only allow sound a tap began).
    let a = el.current;
    if (!a) { a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); el.current = a; }
    a.srcObject = null; a.src = silentWav(); a.play().catch(() => {});
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (ctxRef.current ??= new AC());
    void ctx.resume();
    setPlaying(key);
    const pc = new RTCPeerConnection();
    const osc = ctx.createOscillator(); const gn = ctx.createGain(); gn.gain.value = 0;
    const dest = ctx.createMediaStreamDestination(); osc.connect(gn).connect(dest); osc.start();
    dest.stream.getAudioTracks().forEach((t) => pc.addTrack(t, dest.stream));
    const dc = pc.createDataChannel('oai-events');
    const player = a;
    player.autoplay = true;
    pc.ontrack = (ev) => { player.removeAttribute('src'); player.srcObject = ev.streams[0]; player.play().catch(() => note('Your phone blocked the sound. Check silent mode, then tap ▶ again.')); };
    const started = Date.now();
    let ended = false, said = '', lastWord = 0;
    const end = () => {
      if (ended) return;
      ended = true;
      try { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'session.close', event_id: `evt_${Date.now()}` })); } catch { /* ignore */ }
      setTimeout(() => { try { pc.close(); } catch { /* ignore */ } player.pause(); player.srcObject = null; try { osc.stop(); } catch { /* ignore */ } }, 300);
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: Math.max(15, (Date.now() - started) / 1000) }) }).catch(() => {});
      if (!said) note('The voice connected but didn’t speak. Try again.');
      else if (said !== 'x') note(`It said: ${said}`);
      setPlaying((p) => (p === key ? null : p));
      if (endRef.current === end) endRef.current = null;
    };
    endRef.current = end;
    dc.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'session.output_transcript.delta' && e.delta) { said += e.delta; lastWord = Date.now(); note(`♪ ${said}`); }
        if (e.type === 'error' || e.type === 'session.error') note(`Live voice: ${e.error?.message ?? e.message ?? 'error'}`);
      } catch { /* ignore */ }
    };
    // Finish a moment after it stops speaking (or after 40 seconds at most).
    const watch = window.setInterval(() => {
      if (ended) { clearInterval(watch); return; }
      if ((lastWord && Date.now() - lastWord > 2500) || Date.now() - started > 40_000) { clearInterval(watch); end(); }
    }, 300);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const q = new URLSearchParams({ preview: '1', voice: voice || s.liveVoice || 'meridian', say: say ?? text, mode });
      if (rules !== undefined) q.set('rules', rules);
      if (instr) q.set('instr', instr);
      if (pace) q.set('pace', pace);
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) {
        said = 'x'; end();
        const err = String(d.error ?? '');
        const why = err.replace(/^Live voice could not start \(\d+\): /, '').slice(0, 220);
        const status = Number(err.match(/\((\d{3})\)/)?.[1] ?? 0);
        // Only a clear "this voice doesn't exist" sets a voice aside. (Before Nov 2 any refusal that mentioned the
        // word "voice" did, so a busy moment, too many listens in a row, wrongly marked voices as unavailable.)
        const noSuchVoice = voice && voice !== 'meridian' && (status === 400 || status === 404) && /(invalid|unsupported|not supported|unknown|not found|does not exist|not available)[^.]*voice|voice[^.]*(invalid|unsupported|not supported|unknown|not found|does not exist|not available)/i.test(why);
        if (noSuchVoice) { setVotes((v) => ({ ...v, [voice]: { good: 0, bad: 0, gone: true } })); note(`Not available on GPT-Live. OpenAI says: ${why}`); return; }
        if (status === 429 || /rate limit|too many|concurrent/i.test(why)) { note(`OpenAI is busy right now (too many listens in a row). Wait about a minute, then tap Hear again. OpenAI says: ${why}`); return; }
        note(err ? `Couldn't play this one. OpenAI says: ${why}` : 'Could not start the test.'); return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch (e) { said = 'x'; end(); note((e as Error).message); }
  }

  // The lines both tests use (a different one for each pair, in turn): the samples and any he added, each ticked on or off (kept on this device).
  const ABL_KEY = 'chavrusa-ab-lines';
  type AbLine = { name: string; he: string; on: boolean; mine?: boolean };
  const [abLines, setAbLinesRaw] = useState<AbLine[]>(() => {
    try { const x = JSON.parse(localStorage.getItem(ABL_KEY) || 'null'); if (Array.isArray(x) && x.length) return x; } catch { /* first time */ }
    return LINES.map((l) => ({ name: l.name, he: l.he, on: true }));
  });
  const setAbLines = (x: AbLine[]) => { setAbLinesRaw(x); try { localStorage.setItem(ABL_KEY, JSON.stringify(x)); } catch { /* not kept */ } };
  const [abNew, setAbNew] = useState<{ name: string; he: string } | null>(null);
  const abChosen = abLines.filter((l) => l.on && l.he.trim());
  const abLinesChosen = () => [...new Set(abChosen.map((l) => l.he.trim()))];
  // ---------- The easy way: "which sounds better, A or B?" ----------
  // A whole setup is tuned, one choice at a time, by ear alone: how the Hebrew is given, (optionally) which voice, the
  // rules one by one, then adding the good rules together, then short or full instructions, and last a check of the
  // winner against what calls use now. Each step pits the best so far against one change; he hears A and B (which is
  // which stays hidden) and taps the better. "About the same" keeps the best so far, so a change has to earn its place.
  type Pace = 'slow' | 'relaxed' | 'natural' | 'brisk';
  type Cfg = { mode: HeRead; voice: string; rules: string; instr: 'short' | 'full'; pace: Pace };
  type StageId = 'way' | 'voice' | 'rules' | 'mix' | 'trim' | 'way2' | 'instr' | 'pace' | 'final';
  type Tune = { stages: StageId[]; si: number; step: number; champ: Cfg; chal: Cfg | null; champOnA: boolean; good: string[]; goodWays: HeRead[]; start: Cfg; done: boolean; won: boolean; order?: string[]; prev?: Cfg | null; picked?: 'A' | 'B' | 'same'; rA?: Rate; rB?: Rate; wA?: Wrong[]; wB?: Wrong[]; back?: Omit<Tune, 'back'>[] };
  // How good a reading was on its own (not just better or worse than the other): good, OK or bad.
  type Rate = 'good' | 'ok' | 'bad';
  const cfgKey = (c: Cfg) => `c:${c.mode}|${c.voice}|${c.rules}|${c.instr}|${c.pace}`;
  const sameCfg = (a: Cfg, b: Cfg) => cfgKey(a) === cfgKey(b);
  const STAGE_NAME: Record<StageId, string> = { way: 'How the Hebrew is given', voice: 'Which voice', rules: 'The rules, one at a time', mix: 'Adding rules together, one at a time', trim: 'Taking each rule out again, to see if it’s better without it', way2: 'How the Hebrew is given, again, with the rules chosen', instr: 'Short or full instructions', pace: 'Speaking speed', final: 'Last check: against what calls use now (and the last run’s winner)' };
  const [withVoices, setWithVoices] = useState(false); // off: the test is about the rules and instructions, with your own voice
  const [withPace, setWithPace] = useState(true);
  // The test is kept on this device after every pair, so leaving Settings or closing the app doesn't lose it: it comes
  // back right where it was (with the same line), until it's finished and saved or stopped.
  const TUNE_KEY = 'chavrusa-voice-tune';
  const [tune, setTuneRaw] = useState<Tune | null>(() => { try { const t = JSON.parse(localStorage.getItem(TUNE_KEY) || 'null'); return t && Array.isArray(t.stages) ? t : null; } catch { return null; } });
  const setTune = (t: Tune | null) => { setTuneRaw(t); try { if (t) localStorage.setItem(TUNE_KEY, JSON.stringify(t)); else localStorage.removeItem(TUNE_KEY); } catch { /* not kept */ } };
  const startCfg: Cfg = { mode: inUse, voice: s.liveVoice || 'meridian', rules: inCalls, instr: s.liveShort !== false ? 'short' : 'full', pace: (s.livePace ?? 'natural') as Pace };
  const voicesOk = LIVE_VOICES.map((v) => v.id).filter((id) => !votes[id]?.gone);
  // A voice OpenAI turned down never stays in the test: if it's the challenger, the best so far wins that pair by
  // itself; if it got into the best setup (picked before it was found out), the best setup switches to a working voice.
  useEffect(() => {
    if (!tune || tune.done) return;
    const gone = (v: string) => !!votes[v]?.gone;
    const working = [tune.start.voice, 'meridian', ...voicesOk].find((v) => !gone(v)) ?? 'meridian';
    if (gone(tune.champ.voice)) {
      const fix = (c: Cfg): Cfg => (gone(c.voice) ? { ...c, voice: working } : c);
      const champ = fix(tune.champ);
      setTune(advance({ ...tune, champ, start: fix(tune.start), step: tune.step }));
    } else if (tune.chal && gone(tune.chal.voice)) {
      setTune(advance({ ...tune, step: tune.step + 1 }));
    }
  }, [votes]); // eslint-disable-line react-hooks/exhaustive-deps
  // The changes each step tries, as "the best so far, with one thing different".
  function challengers(st: StageId, t: Pick<Tune, 'good' | 'goodWays' | 'start' | 'order' | 'prev'>): ((c: Cfg) => Cfg | null)[] {
    // Every way of giving it the Hebrew (the spelled-out ones need nikud in the line); the second time, only the ways
    // that won or held their own the first time.
    if (st === 'way') return HE_READS.map((m) => m.id).filter((m) => hasNikud(text) || isHebrewLetters(m)).map((m) => (c) => ({ ...c, mode: m }));
    if (st === 'way2') return t.goodWays.map((m) => (c) => ({ ...c, mode: m }));
    if (st === 'voice') return voicesOk.map((v) => (c) => ({ ...c, voice: v }));
    // The rules in this run's own random order (each run a new one), so no rule is favored by always coming first.
    const ids = [...(t.order ?? []).filter((id) => allRules.some((r) => r.id === id)), ...allRules.map((r) => r.id).filter((id) => !(t.order ?? []).includes(id))];
    if (st === 'rules') return ['none', comboId(STANDARD_RULES), ...ids].map((r) => (c) => ({ ...c, rules: r, instr: 'short' }));
    // Adding: every rule gets a turn being added to the best so far (the ones that did well alone first). An addition
    // only stays if the whole set with it beats the set without it, so a rule that's good alone but spoils the others
    // never gets in.
    if (st === 'mix') return [...t.good, ...ids.filter((r) => !t.good.includes(r))].map((r) => (c) => {
      const have = c.rules === 'none' ? [] : c.rules.split(',');
      if (have.includes(r)) return null;
      return { ...c, rules: comboId([...have, r]), instr: 'short' };
    });
    // Taking out: each rule in the best set is tried without it, in case one that helped early is now in the way.
    if (st === 'trim') return ids.map((r) => (c) => {
      const have = c.rules === 'none' ? [] : c.rules.split(',');
      if (!have.includes(r) || have.length < 2) return null;
      return { ...c, rules: comboId(have.filter((x) => x !== r)), instr: 'short' };
    });
    if (st === 'instr') return [(c) => ({ ...c, instr: c.instr === 'short' ? 'full' : 'short' })];
    if (st === 'pace') return (['slow', 'relaxed', 'natural', 'brisk'] as Pace[]).map((p) => (c) => ({ ...c, pace: p }));
    // Last check: against what calls use now, and against the winner of the previous run (found in another order).
    return [() => t.start, ...(t.prev ? [() => t.prev as Cfg] : [])];
  }
  // Move to the next pair: the next change in this step that is really different, or the next step, or the end.
  function advance(t: Tune): Tune {
    let { si, step } = t;
    while (si < t.stages.length) {
      const list = challengers(t.stages[si], t);
      while (step < list.length) {
        const c = list[step](t.champ);
        if (c && !sameCfg(c, t.champ)) return { ...t, si, step, chal: c, champOnA: Math.random() < 0.5 };
        step++;
      }
      si++; step = 0;
    }
    try { localStorage.setItem('chavrusa-voice-tune-last', JSON.stringify(t.champ)); } catch { /* not kept */ }
    return { ...t, si, step, chal: null, done: true, won: !sameCfg(t.champ, t.start) };
  }
  const LAST_KEY = 'chavrusa-voice-tune-last';
  const startTune = () => {
    const order = allRules.map((r) => r.id).map((id) => ({ id, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.id);
    let prev: Cfg | null = null;
    try { prev = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { /* none */ }
    const stages: StageId[] = ['way', ...(withVoices ? (['voice'] as StageId[]) : []), 'rules', 'mix', 'trim', 'way2', 'instr', ...(withPace ? (['pace'] as StageId[]) : []), 'final'];
    setTune(advance({ stages, si: 0, step: 0, champ: startCfg, chal: null, champOnA: true, good: [], goodWays: [], start: startCfg, done: false, won: false, order, prev }));
  };
  // The line for this pair: the chosen lines in turn (or the line in the box, if none is chosen).
  const tuneLineOf = (n: number) => { const ls = abLinesChosen(); return ls.length ? ls[n % ls.length] : text; };
  const tuneLine = tuneLineOf(tune?.back?.length ?? 0);
  const tuneA = tune?.chal ? (tune.champOnA ? tune.champ : tune.chal) : null;
  const tuneB = tune?.chal ? (tune.champOnA ? tune.chal : tune.champ) : null;
  // Which of this pair's two readings he has heard (a pick is only allowed after hearing both), and a short "got it"
  // after each pick, so it's clear the pick counted and a new pair is up.
  const pairId = tune ? `${tune.si}:${tune.step}:${tune.back?.length ?? 0}` : '';
  const [heardAB, setHeardAB] = useState<{ id: string; a: boolean; b: boolean }>({ id: '', a: false, b: false });
  const heardBoth = heardAB.id === pairId && heardAB.a && heardAB.b;
  const markHeard = (side: 'A' | 'B') => setHeardAB((h) => (h.id === pairId ? { ...h, [side === 'A' ? 'a' : 'b']: true } : { id: pairId, a: side === 'A', b: side === 'B' }));
  const [flash, setFlash] = useState('');
  // After a pick, what A and B were (only then, so the listening stays blind).
  const [lastPair, setLastPair] = useState<{ a: string; b: string; chose: string } | null>(null);
  const PACE_NAME: Record<Pace, string> = { slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' };
  const whatDiffers = (st: StageId, c: Cfg): string =>
    st === 'way' || st === 'way2' ? HE_READS.find((m) => m.id === c.mode)?.name ?? c.mode
    : st === 'voice' ? (LIVE_VOICES.find((v) => v.id === c.voice)?.name ?? c.voice)
    : st === 'instr' ? `${c.instr === 'full' ? 'Full' : 'Short'} instructions`
    : st === 'pace' ? `${PACE_NAME[c.pace]} speed`
    : st === 'final' ? `${HE_READS.find((m) => m.id === c.mode)?.name ?? c.mode} · ${c.instr === 'full' ? 'Full instructions' : `rules: ${comboName(c.rules)}`} · ${PACE_NAME[c.pace]}`
    : `Rules: ${comboName(c.rules)}`;
  const flashT = useRef(0);
  const pick = (side: 'A' | 'B' | 'same') => {
    if (!tune?.chal || !heardBoth) return;
    endRef.current?.();
    setFlash(side === 'same' ? '✓ Got it: about the same. Here is the next pair.' : `✓ Got it: ${side} was better. Here is the next pair.`);
    {
      const st0 = tune.stages[tune.si];
      const a = tune.champOnA ? tune.champ : tune.chal, b = tune.champOnA ? tune.chal : tune.champ;
      setLastPair({ a: whatDiffers(st0, a), b: whatDiffers(st0, b), chose: side === 'same' ? 'about the same (the best so far stays)' : `${side}` });
    }
    window.clearTimeout(flashT.current); flashT.current = window.setTimeout(() => setFlash(''), 2500);
    const st = tune.stages[tune.si];
    const chalWon = side !== 'same' && (side === 'A') !== tune.champOnA;
    // A rule that won or held its own on its own is worth trying together with the others.
    const single = st === 'rules' && !tune.chal.rules.includes(',') && tune.chal.rules !== 'none' ? tune.chal.rules : '';
    const good = single && side !== (tune.champOnA ? 'A' : 'B') && !tune.good.includes(single) ? [...tune.good, single] : tune.good;
    const champ = chalWon ? tune.chal : tune.champ;
    // A way of giving the Hebrew that won or held its own gets a second look once the rules are chosen; so does the
    // one it was up against.
    const goodWays = st === 'way' && side !== (tune.champOnA ? 'A' : 'B') ? [...new Set([...tune.goodWays, tune.chal.mode, tune.champ.mode])] : tune.goodWays;
    // Kept for Undo: the test as it was before this pick (the last 80 picks).
    const { back = [], ...before } = tune;
    setTune({ ...advance({ ...before, picked: undefined, rA: undefined, rB: undefined, wA: undefined, wB: undefined, champ, good, goodWays, step: tune.step + 1 }), back: [...back, { ...before, picked: side }].slice(-200) });
  };
  // Undo: back to the pair before the last pick, as it was (A and B the same way round), as many times as wanted.
  const undo = () => {
    if (!tune?.back?.length) return;
    endRef.current?.();
    const back = tune.back.slice(0, -1);
    setTune({ ...tune.back[tune.back.length - 1], back });
    setFlash('↩ Back one pair.'); setLastPair(null);
    window.clearTimeout(flashT.current); flashT.current = window.setTimeout(() => setFlash(''), 2500);
  };
  // Back to the first pair of this step (as it was then), to redo the whole step.
  const redoStep = () => {
    if (!tune?.back?.length) return;
    endRef.current?.();
    let i = tune.back.length;
    while (i > 0 && tune.back[i - 1].si === tune.si) i--;
    if (i === tune.back.length) return;
    setTune({ ...tune.back[i], back: tune.back.slice(0, i) });
    setFlash('↩ Back to the start of this step.'); setLastPair(null);
    window.clearTimeout(flashT.current); flashT.current = window.setTimeout(() => setFlash(''), 2500);
  };
  const stepStarted = !!tune?.back?.length && tune.back[tune.back.length - 1].si === tune.si;
  const describe = (c: Cfg) => [
    `Hebrew given as: ${HE_READS.find((m) => m.id === c.mode)?.name ?? c.mode}`,
    `Voice: ${LIVE_VOICES.find((v) => v.id === c.voice)?.name ?? c.voice}`,
    c.instr === 'full' ? 'Instructions: Full (the rules aren’t used with these)' : `Instructions: Short · Rules: ${comboName(c.rules)}`,
    `Speed: ${({ slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' } as Record<Pace, string>)[c.pace]}`,
  ];
  const useSetup = (c: Cfg) => onChange({ heRead: c.mode, liveVoice: c.voice, liveRules: c.rules === 'none' ? ['none'] : c.rules.split(','), liveShort: c.instr === 'short', livePace: c.pace });
  const setupInCalls = sameCfg(startCfg, tune?.champ ?? startCfg);
  // The whole run written out, every pair and what was chosen, to send to Claude for a closer look.
  function resultsText(t: Tune): string {
    const out: string[] = [];
    out.push(`Chavrusa voice test · ${new Date().toLocaleString()}`);
    out.push(`Lines: ${abLinesChosen().map((l) => l.split(/\s+/).slice(0, 4).join(' ')).join(' | ') || text}`);
    out.push(`Started from (what calls used): ${describe(t.start).join(' · ')}`);
    if (t.order?.length) out.push(`Rule order this run: ${t.order.map((id) => comboName(id)).join(', ')}`);
    if (t.prev) out.push(`Previous run's winner (in the last check): ${describe(t.prev).join(' · ')}`);
    const steps = [...(t.back ?? []), t];
    let lastSi = -1;
    steps.forEach((x, i) => {
      if (!x.chal) return;
      const st = x.stages[x.si];
      if (x.si !== lastSi) { out.push(''); out.push(`Step ${x.si + 1}: ${STAGE_NAME[st]}`); lastSi = x.si; }
      const a = x.champOnA ? x.champ : x.chal, b = x.champOnA ? x.chal : x.champ;
      const next = steps[i + 1];
      let chose: string;
      if (!next) chose = '(not judged yet)';
      else if (x.picked) chose = x.picked === 'same' ? 'about the same (best so far kept)' : `${x.picked} (${whatDiffers(st, x.picked === 'A' ? a : b)})`;
      else chose = sameCfg(next.champ, x.chal) ? `the change (${whatDiffers(st, x.chal)})` : 'the best so far (or about the same)';
      const rt = (r?: Rate, w?: Wrong[]) => (r || w?.length ? ` (${[r === 'ok' ? 'OK' : r, w?.length ? `wrong: ${w.join(', ')}` : ''].filter(Boolean).join('; ')})` : '');
      out.push(`  A: ${whatDiffers(st, a)}${rt(x.rA, x.wA)} | B: ${whatDiffers(st, b)}${rt(x.rB, x.wB)} → chose ${chose}${sameCfg(a, x.champ) ? ' [A was the best so far]' : ' [B was the best so far]'}`);
    });
    out.push('');
    out.push(t.done ? `Result: ${describe(t.champ).join(' · ')}${t.won ? ' (beat what calls used)' : ' (what calls used held up)'}` : `Not finished yet. Best so far: ${describe(t.champ).join(' · ')}`);
    const wr = ratingsOf(t, t.champ);
    if (wr.length) out.push(`The winner's own ratings: ${wr.filter((r) => r === 'good').length} good, ${wr.filter((r) => r === 'ok').length} OK, ${wr.filter((r) => r === 'bad').length} bad`);
    return out.join('\n');
  }
  // Every rating a setup got during the run (whenever it was A or B).
  function ratingsOf(t: Tune, c: Cfg): Rate[] {
    const all = [...(t.back ?? []), t];
    const got: Rate[] = [];
    for (const x of all) {
      if (!x.chal) continue;
      const a = x.champOnA ? x.champ : x.chal, b = x.champOnA ? x.chal : x.champ;
      if (x.rA && sameCfg(a, c)) got.push(x.rA);
      if (x.rB && sameCfg(b, c)) got.push(x.rB);
    }
    return got;
  }
  const [copied, setCopied] = useState('');
  async function copyResults(t: Tune) {
    const txt = resultsText(t);
    try { await navigator.clipboard.writeText(txt); setCopied('Copied. Paste it into the chat with Claude.'); }
    catch {
      try { await navigator.share({ title: 'Chavrusa voice test', text: txt }); setCopied(''); }
      catch { setCopied('Couldn’t copy here.'); }
    }
    window.setTimeout(() => setCopied(''), 4000);
  }

  // ---------- A or B: two fixed versions, head to head ----------
  // A is exactly what calls use now; B is the same with one change (here: the Vowel key, version B). Each of several
  // lines (the line in the box and the samples, a hard Aramaic one included) is heard twice, A and B in a hidden,
  // shuffled order, so one lucky reading or one easy line can't decide it.
  type AbPair = { line: number; bOnA: boolean; pick?: 'A' | 'B' | 'same'; rA?: Rate; rB?: Rate; wA?: Wrong[]; wB?: Wrong[] };
  type Ab = { a: Cfg; b: Cfg; lines: string[]; pairs: AbPair[]; i: number; name: string };
  const AB_KEY = 'chavrusa-voice-ab';
  const [ab, setAbRaw] = useState<Ab | null>(() => { try { const x = JSON.parse(localStorage.getItem(AB_KEY) || 'null'); return x && Array.isArray(x.pairs) ? x : null; } catch { return null; } });
  const setAb = (x: Ab | null) => { setAbRaw(x); try { if (x) localStorage.setItem(AB_KEY, JSON.stringify(x)); else localStorage.removeItem(AB_KEY); } catch { /* not kept */ } };
  // Which change B is: a version of the Vowel key in place of the one in use.
  const AB_CHANGES = [
    { id: 'keyC', name: 'Vowel key, version C', about: 'your current Vowel key with only the new shva (a very short "e", no pause or breath)' },
    { id: 'keyB', name: 'Vowel key, version B', about: 'the new shva, the chirik "i" or "ee" by a rule, and the short kamatz as "o"' },
  ];
  const [abChange, setAbChangeRaw] = useState<string>(() => { try { return localStorage.getItem('chavrusa-ab-change') || 'keyC'; } catch { return 'keyC'; } });
  const setAbChange = (v: string) => { setAbChangeRaw(v); try { localStorage.setItem('chavrusa-ab-change', v); } catch { /* not kept */ } };
  const withKey = (c: Cfg, k: string): Cfg => {
    const have = c.rules === 'none' || c.instr === 'full' ? [] : c.rules.split(',');
    const keys = ['key', 'keyB', 'keyC'];
    const next = have.some((r) => keys.includes(r)) ? have.map((r) => (keys.includes(r) ? k : r)) : [...have, k];
    return { ...c, rules: comboId([...new Set(next)]), instr: 'short' };
  };
  const startAb = () => {
    const lines = [...new Set(abChosen.map((l) => l.he.trim()))];
    if (!lines.length) return;
    const pairs: AbPair[] = lines.flatMap((_, k) => [{ line: k, bOnA: Math.random() < 0.5 }, { line: k, bOnA: Math.random() < 0.5 }]).map((p) => ({ p, k: Math.random() })).sort((x, y) => x.k - y.k).map((x) => x.p);
    const ch = AB_CHANGES.find((x) => x.id === abChange) ?? AB_CHANGES[0];
    setAb({ a: startCfg, b: withKey(startCfg, ch.id), lines, pairs, i: 0, name: ch.name });
  };
  // Ticking lines on or off in the middle of a run changes the rest of the run right away: the pairs already judged
  // stay as they were, and the pairs still to come are made again from the lines ticked now (two each, shuffled).
  const chosenKey = abChosen.map((l) => l.he.trim()).join('\u0001');
  useEffect(() => {
    if (!ab || ab.i >= ab.pairs.length) return;
    const now = [...new Set(abChosen.map((l) => l.he.trim()))];
    if (!now.length) return;
    const ahead = ab.pairs.slice(ab.i);
    if (ahead.every((p) => now.includes(ab.lines[p.line])) && now.every((l) => ahead.some((p) => ab.lines[p.line] === l))) return; // already matches
    const lines = [...ab.lines, ...now.filter((l) => !ab.lines.includes(l))];
    const fresh: AbPair[] = now.flatMap((l) => [0, 1].map(() => ({ line: lines.indexOf(l), bOnA: Math.random() < 0.5 })))
      .map((p) => ({ p, k: Math.random() })).sort((x, y) => x.k - y.k).map((x) => x.p);
    setAb({ ...ab, lines, pairs: [...ab.pairs.slice(0, ab.i), ...fresh] });
    setAbHeard({ i: -1, a: false, b: false }); // a new pair: hear both again
  }, [chosenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const abPair = ab && ab.i < ab.pairs.length ? ab.pairs[ab.i] : null;
  const [abHeard, setAbHeard] = useState<{ i: number; a: boolean; b: boolean }>({ i: -1, a: false, b: false });
  const abBoth = !!ab && abHeard.i === ab.i && abHeard.a && abHeard.b;
  const abSet = (patch: Partial<AbPair>) => { if (!ab || !abPair) return; const pairs = ab.pairs.slice(); pairs[ab.i] = { ...abPair, ...patch }; setAb({ ...ab, pairs }); };
  const abPick = (side: 'A' | 'B' | 'same') => {
    if (!ab || !abPair || !abBoth) return;
    endRef.current?.();
    const pairs = ab.pairs.slice(); pairs[ab.i] = { ...abPair, pick: side };
    setAb({ ...ab, pairs, i: ab.i + 1 });
    setFlash(side === 'same' ? '✓ Got it: about the same.' : `✓ Got it: ${side} was better.`);
    window.clearTimeout(flashT.current); flashT.current = window.setTimeout(() => setFlash(''), 2000);
    // Only now, after the choice, say which version was on which side.
    const nameA = abPair.bOnA ? ab.name : 'what calls use now', nameB = abPair.bOnA ? 'what calls use now' : ab.name;
    const chose = side === 'same' ? 'about the same' : `${side} (${side === 'A' ? nameA : nameB})`;
    setAbLast(`A was ${nameA}; B was ${nameB}. You chose ${chose}.`);
  };
  const [abLast, setAbLast] = useState('');
  // The tally, by version (not by side): which won, how each was rated, what was wrong with each.
  function abTally(x: Ab) {
    const t = { a: 0, b: 0, same: 0, rate: { a: [] as Rate[], b: [] as Rate[] }, wrong: { a: [] as Wrong[], b: [] as Wrong[] } };
    for (const p of x.pairs) {
      if (!p.pick) continue;
      const pickedB = p.pick !== 'same' && (p.pick === 'A') === p.bOnA;
      if (p.pick === 'same') t.same++; else if (pickedB) t.b++; else t.a++;
      const [rOfA, rOfB] = p.bOnA ? [p.rB, p.rA] : [p.rA, p.rB];
      const [wOfA, wOfB] = p.bOnA ? [p.wB, p.wA] : [p.wA, p.wB];
      if (rOfA) t.rate.a.push(rOfA); if (rOfB) t.rate.b.push(rOfB);
      t.wrong.a.push(...(wOfA ?? [])); t.wrong.b.push(...(wOfB ?? []));
    }
    return t;
  }
  const countOf = (xs: string[]) => Object.entries(xs.reduce((m, w) => ({ ...m, [w]: (m[w] ?? 0) + 1 }), {} as Record<string, number>)).map(([w, n]) => `${WRONG.find((x) => x[0] === w)?.[1] ?? w} ${n}`).join(', ') || 'nothing marked';
  const rateOf = (xs: Rate[]) => xs.length ? `${xs.filter((r) => r === 'good').length} good, ${xs.filter((r) => r === 'ok').length} OK, ${xs.filter((r) => r === 'bad').length} bad` : 'not rated';
  function abText(x: Ab): string {
    const t = abTally(x);
    const out = [`Chavrusa A-or-B test · ${new Date().toLocaleString()}`, `A (what calls use): ${describe(x.a).join(' · ')}`, `B: ${describe(x.b).join(' · ')}`, ''];
    x.pairs.forEach((p, k) => {
      if (!p.pick) return;
      const rt = (r?: Rate, w?: Wrong[]) => [r === 'ok' ? 'OK' : r, w?.length ? `wrong: ${w.join(', ')}` : ''].filter(Boolean).join('; ');
      const [labA, labB] = p.bOnA ? ['B', 'A'] : ['A', 'B'];
      out.push(`Pair ${k + 1} · line ${p.line + 1} (${x.lines[p.line].slice(0, 30)}…): left=${labA}${rt(p.rA, p.wA) ? ` (${rt(p.rA, p.wA)})` : ''}, right=${labB}${rt(p.rB, p.wB) ? ` (${rt(p.rB, p.wB)})` : ''} → ${p.pick === 'same' ? 'about the same' : `${p.pick === 'A' ? labA : labB} better`}`);
    });
    out.push('', `A won ${t.a}, B won ${t.b}, about the same ${t.same}.`, `A rated: ${rateOf(t.rate.a)}; wrong: ${countOf(t.wrong.a)}.`, `B rated: ${rateOf(t.rate.b)}; wrong: ${countOf(t.wrong.b)}.`);
    return out.join('\n');
  }
  async function copyAb(x: Ab) {
    try { await navigator.clipboard.writeText(abText(x)); setCopied('Copied. Paste it into the chat with Claude.'); }
    catch { try { await navigator.share({ title: 'Chavrusa A-or-B test', text: abText(x) }); } catch { setCopied('Couldn’t copy here.'); } }
    window.setTimeout(() => setCopied(''), 4000);
  }

  return (
    <div className="field he-lab">
      <label>Hebrew reading test</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Tick the lines to test with in the list below; both tests use them, a different line for each pair. Whatever you choose applies from the next Talk.</div>
      <div className="ab-lines">
        <div className="ab-lines-title">Lines for the tests ({abChosen.length} chosen)</div>
        <div className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>Both tests below use these, a different line for each pair in turn, so no single line decides. Tick the ones to use, or add your own.</div>
        {abLines.map((l, k) => (
          <label key={k} className={`ab-line ${l.on ? 'on' : ''}`}>
            <input type="checkbox" checked={l.on} onChange={() => setAbLines(abLines.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} />
            <span className="ab-line-name">{l.name}</span>
            <span className="ab-line-he" dir="rtl">{l.he.split(/\s+/).slice(0, 5).join(' ')}…</span>
            {l.mine && <button className="calllog-x" aria-label={`Remove ${l.name}`} onClick={(e) => { e.preventDefault(); setAbLines(abLines.filter((_, j) => j !== k)); }}>×</button>}
          </label>
        ))}
        {abNew ? (
          <div className="rule-write">
            <input type="text" placeholder="A short name (e.g. Rashi on Bereishis)" value={abNew.name} maxLength={40} onChange={(e) => setAbNew({ ...abNew, name: e.target.value })} />
            <textarea rows={3} dir="rtl" placeholder="Paste the line in Hebrew (with nikud if you have it)" value={abNew.he} onChange={(e) => setAbNew({ ...abNew, he: e.target.value })} />
            <div className="he-lab-btns">
              <button className="btn primary" disabled={!abNew.he.trim()} onClick={() => { setAbLines([...abLines, { name: abNew.name.trim() || `My line ${abLines.filter((x) => x.mine).length + 1}`, he: abNew.he.trim(), on: true, mine: true }]); setAbNew(null); }}>Add</button>
              <button className="btn" onClick={() => setAbNew(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="he-lab-btns" style={{ marginTop: 6 }}>
            <button className="linkish" onClick={() => setAbNew({ name: '', he: '' })}>+ Add a line</button>
            {text.trim() && !abLines.some((x) => x.he.trim() === text.trim()) && <button className="linkish" onClick={() => setAbLines([...abLines, { name: 'The line in the box', he: text.trim(), on: true, mine: true }])}>+ Add the line from the box below</button>}
          </div>
        )}
      </div>
      <div className="tuner">
        <div className="tuner-title">Find the best setup, the easy way</div>
        {!tune && (
          <>
            <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>You&apos;ll hear the chosen lines read two ways, A and B (a different line each pair), and tap the one that sounds better. Step by step it tries everything that changes how the Hebrew sounds: how the Hebrew is given to the voice, the voices, every rule on its own (yours too), adding rules together one at a time (each addition has to beat the set without it), taking each one out again to check it still helps, how the Hebrew is given again with those rules, short or full instructions, and the speed. Each step keeps the best so far, and at the end the winner has to beat what calls use now. About 30–45 pairs, about 2¢ a pair (60–90¢ in all). You can stop and start again any time.</div>
            <label className="tuner-check"><input type="checkbox" checked={withVoices} onChange={(e) => setWithVoices(e.target.checked)} /> Compare the voices too ({voicesOk.length - 1} pairs). Each voice sounds different; leave this off to keep your own voice and test only the rules and instructions.</label>
            <label className="tuner-check"><input type="checkbox" checked={withPace} onChange={(e) => setWithPace(e.target.checked)} /> Compare the speaking speeds too (3 pairs; the speed also applies to the rest of the call)</label>
            <button className="btn primary" disabled={disabled || !tuneLine.trim()} onClick={startTune}>Start</button>
          </>
        )}
        {tune && !tune.done && tuneA && tuneB && (
          <>
            <div className="tuner-step"><b>Step {tune.si + 1} of {tune.stages.length}:</b> {STAGE_NAME[tune.stages[tune.si]]} · <b>pair {tune.step + 1} of {challengers(tune.stages[tune.si], tune).length}</b> · saved as you go</div>
            <div className="tuner-step">This pair&apos;s line: <span dir="rtl">{tuneLine.split(/\s+/).slice(0, 5).join(' ')}…</span></div>
            {flash && <div className="tuner-flash">{flash}</div>}
            {lastPair && <div className="tuner-last"><b>The pair you just judged:</b> A was {lastPair.a}; B was {lastPair.b}. You chose {lastPair.chose}.</div>}
            <div className="tuner-ab">
              {(['A', 'B'] as const).map((side) => {
                const c = side === 'A' ? tuneA : tuneB;
                const key = `${side}:${cfgKey(c)}`;
                return (
                  <div key={side} className="tuner-side">
                    <button className="btn tuner-play" disabled={disabled} onClick={() => { markHeard(side); void hear(c.mode, c.voice, c.rules, c.instr, key, c.pace, tuneLine); }}>{playing === key ? '■ Stop' : `▶ Hear ${side}`}{heardAB.id === pairId && heardAB[side === 'A' ? 'a' : 'b'] && playing !== key ? ' ✓' : ''}</button>
                    <div className="tuner-rate" role="group" aria-label={`How good was ${side} on its own?`}>
                      {(['good', 'ok', 'bad'] as Rate[]).map((r) => {
                        const cur = side === 'A' ? tune.rA : tune.rB;
                        return <button key={r} aria-pressed={cur === r} className={`chip rate-${r} ${cur === r ? 'picked' : ''}`} disabled={!(heardAB.id === pairId && heardAB[side === 'A' ? 'a' : 'b'])} onClick={() => setTune({ ...tune, [side === 'A' ? 'rA' : 'rB']: cur === r ? undefined : r })}>{cur === r ? '✓ ' : ''}{r === 'good' ? 'Good' : r === 'ok' ? 'OK' : 'Bad'}</button>;
                      })}
                    </div>
                    <WrongChips value={(side === 'A' ? tune.wA : tune.wB) ?? []} disabled={!(heardAB.id === pairId && heardAB[side === 'A' ? 'a' : 'b'])} onChange={(v) => setTune({ ...tune, [side === 'A' ? 'wA' : 'wB']: v })} />
                    {(side === 'A' ? tune.rA : tune.rB) && <div className="tuner-rated">{side} marked: <b>{(side === 'A' ? tune.rA : tune.rB) === 'good' ? 'Good' : (side === 'A' ? tune.rA : tune.rB) === 'ok' ? 'OK' : 'Bad'}</b></div>}
                    <button className="btn primary" disabled={!heardBoth} onClick={() => pick(side)}>{side} is better</button>
                  </div>
                );
              })}
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={!heardBoth} onClick={() => pick('same')}>About the same</button>
            {!heardBoth && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Hear both A and B first; then the buttons to choose come on.</div>}
            {heardBoth && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Under each, you can also mark how it was on its own (Good, OK, Bad) and what was wrong (the words, the vowels, the stress, the accent). Mark these before choosing.</div>}
            {msg && /^[AB]:/.test(msg.mode) && /^(Live voice|Could not|Couldn|OpenAI is busy|Your phone|The voice connected|Not available)/.test(msg.text) && <div className="he-lab-said">{msg.mode.startsWith('A:') ? 'A' : 'B'}: {msg.text}</div>}
            <div className="tuner-foot">
              {!!tune.back?.length && <button className="btn" onClick={undo}>← Undo last pick</button>}
              {stepStarted && <button className="btn" onClick={redoStep}>↺ Redo this step</button>}
              <span>Not sure? Hear them again.</span>
              <button className="linkish" onClick={() => void copyResults(tune)}>Copy the results so far</button>
              <button className="linkish" onClick={() => { endRef.current?.(); setTune(null); }}>Stop and start over</button>
            </div>
          </>
        )}
        {tune?.done && (
          <>
            {tune.won ? <div className="tuner-win">The winner is a new setup, and it beat what calls use now:</div> : <div className="tuner-win">What calls use now held up: nothing beat it.</div>}
            {(() => {
              const wr = ratingsOf(tune, tune.champ);
              if (!wr.length) return null;
              const bad = wr.filter((r) => r === 'bad').length, good = wr.filter((r) => r === 'good').length;
              return <div className={bad > good ? 'tuner-warn' : 'muted'} style={{ fontSize: 12.5, margin: '2px 0 6px' }}>You rated the winner {good} good, {wr.length - good - bad} OK, {bad} bad.{bad > good ? ' The best setup is still bad: rules and instructions alone aren’t enough for this voice. Send me the results; the next step is a different kind of fix.' : ''}</div>;
            })()}
            <ul className="tuner-setup">{describe(tune.champ).map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="he-lab-btns">
              {setupInCalls ? <span className="he-lab-inuse">✓ Calls use this</span> : <button className="btn primary" onClick={() => useSetup(tune.champ)}>Use this setup in calls</button>}
              {tune.champ.voice !== tune.start.voice && <button className="btn" onClick={() => useSetup({ ...tune.champ, voice: tune.start.voice })}>Use it, but keep {LIVE_VOICES.find((v) => v.id === tune.start.voice)?.name.replace(/ \(.*\)$/, '') ?? tune.start.voice}</button>}
              <button className="btn" onClick={startTune}>Test again</button>
              {!!tune.back?.length && <button className="btn" onClick={undo}>← Undo last pick</button>}
              <button className="btn" onClick={() => void copyResults(tune)}>Copy the results (for Claude)</button>
              <button className="linkish" onClick={() => setTune(null)}>Done</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>The voice varies from one listen to the next. If the same setup wins twice, it&apos;s the one.</div>
          </>
        )}
        {copied && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{copied}</div>}
        <div className="tuner-now">Calls use now: {describe(startCfg).join(' · ')}</div>
      </div>
      <div className="tuner">
        <div className="tuner-title">A or B: test one change</div>
        {copied && <div className="goto-msg" style={{ padding: '2px 0 6px' }}>{copied}</div>}
        {!ab && (
          <>
            <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}><b>A</b> is exactly what your calls use now. <b>B</b> is the same with one change, chosen here. You&apos;ll hear each line ticked above twice, A and B in a hidden order, and pick the better each time. About 2¢ a pair.</div>
            <div className="ab-change" role="radiogroup" aria-label="What B changes">
              {AB_CHANGES.map((x) => (
                <label key={x.id} className={`ab-line ${abChange === x.id ? 'on' : ''}`}>
                  <input type="radio" name="ab-change" checked={abChange === x.id} onChange={() => setAbChange(x.id)} />
                  <span><b>{x.name}:</b> {x.about}</span>
                </label>
              ))}
            </div>
            <button className="btn primary" disabled={disabled || !abChosen.length} onClick={startAb}>Start A or B</button>
          </>
        )}
        {ab && abPair && (
          <>
            <div className="tuner-step"><b>Testing:</b> what calls use now against <b>{ab.name}</b> (which is A and which is B changes each pair)</div>
            <div className="tuner-step"><b>Pair {ab.i + 1} of {ab.pairs.length}</b> · line: <span dir="rtl">{ab.lines[abPair.line].split(/\s+/).slice(0, 4).join(' ')}…</span> · saved as you go</div>
            {flash && <div className="tuner-flash">{flash}</div>}
            {abLast && ab.i > 0 && <div className="tuner-last"><b>The pair you just judged:</b> {abLast}</div>}
            <div className="tuner-ab">
              {(['A', 'B'] as const).map((side) => {
                const isB = (side === 'A') === abPair.bOnA;
                const c = isB ? ab.b : ab.a;
                const key = `ab${ab.i}:${side}`;
                const heard = abHeard.i === ab.i && abHeard[side === 'A' ? 'a' : 'b'];
                const r = side === 'A' ? abPair.rA : abPair.rB;
                return (
                  <div key={side} className="tuner-side">
                    <button className="btn tuner-play" disabled={disabled} onClick={() => { setAbHeard((h) => (h.i === ab.i ? { ...h, [side === 'A' ? 'a' : 'b']: true } : { i: ab.i, a: side === 'A', b: side === 'B' })); void hear(c.mode, c.voice, c.rules, c.instr, key, c.pace, ab.lines[abPair.line]); }}>{playing === key ? '■ Stop' : `▶ Hear ${side}`}{heard && playing !== key ? ' ✓' : ''}</button>
                    <div className="tuner-rate">
                      {(['good', 'ok', 'bad'] as Rate[]).map((x) => <button key={x} aria-pressed={r === x} className={`chip rate-${x} ${r === x ? 'picked' : ''}`} disabled={!heard} onClick={() => abSet({ [side === 'A' ? 'rA' : 'rB']: r === x ? undefined : x })}>{r === x ? '✓ ' : ''}{x === 'good' ? 'Good' : x === 'ok' ? 'OK' : 'Bad'}</button>)}
                    </div>
                    <WrongChips value={(side === 'A' ? abPair.wA : abPair.wB) ?? []} disabled={!heard} onChange={(v) => abSet({ [side === 'A' ? 'wA' : 'wB']: v })} />
                    <button className="btn primary" disabled={!abBoth} onClick={() => abPick(side)}>{side} is better</button>
                  </div>
                );
              })}
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={!abBoth} onClick={() => abPick('same')}>About the same</button>
            {!abBoth && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Hear both first. Then mark each (Good, OK, Bad, and what was wrong), and choose.</div>}
            {msg && /^ab\d+:/.test(msg.mode) && /^(Live voice|Could not|Couldn|OpenAI is busy|Your phone|The voice connected|Not available)/.test(msg.text) && <div className="he-lab-said">{msg.text}</div>}
            <div className="tuner-foot">
              {ab.i > 0 && <button className="btn" onClick={() => { endRef.current?.(); setAbLast(''); setAb({ ...ab, i: ab.i - 1 }); }}>← Back one pair</button>}
              <button className="linkish" onClick={() => void copyAb(ab)}>Copy the results so far</button>
              <button className="linkish" onClick={() => { endRef.current?.(); setAb(null); }}>Stop and start over</button>
            </div>
          </>
        )}
        {ab && !abPair && (() => {
          const t = abTally(ab);
          const verdict = t.b >= t.a + 2 ? 'b' : t.a >= t.b + 2 ? 'a' : 'tie';
          return (
            <>
              <div className="tuner-win">{verdict === 'b' ? 'B is better.' : verdict === 'a' ? 'A, what calls use now, is better.' : 'Too close to call.'}</div>
              <ul className="tuner-setup">
                <li>A won {t.a}, B won {t.b}, about the same {t.same}</li>
                <li>A rated {rateOf(t.rate.a)}; wrong: {countOf(t.wrong.a)}</li>
                <li>B rated {rateOf(t.rate.b)}; wrong: {countOf(t.wrong.b)}</li>
              </ul>
              <div className="he-lab-btns">
                {verdict === 'b' && (sameCfg(startCfg, ab.b) ? <span className="he-lab-inuse">✓ Calls use B</span> : <button className="btn primary" onClick={() => useSetup(ab.b)}>Use B in calls</button>)}
                <button className="btn" onClick={() => void copyAb(ab)}>Copy the results (for Claude)</button>
                <button className="btn" onClick={startAb}>Test again</button>
                <button className="linkish" onClick={() => setAb(null)}>Done</button>
              </div>
              {verdict === 'tie' && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Neither won by 2 or more. Test again, or keep A.</div>}
            </>
          );
        })()}
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '14px 0 2px' }}>More (to test things one at a time yourself):</div>
      <div className="muted" style={{ fontSize: 12, margin: '4px 0 4px' }}>The line for these one-at-a-time sections (the two tests above use the ticked list instead):</div>
      <div className="presets">{LINES.map((l) => <button key={l.name} className={`chip ${l.he === text ? 'on' : ''}`} onClick={() => setText(l.he)}>{l.name}</button>)}</div>
      <textarea rows={2} dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a line with nikud" />
      {text.trim() && !hasNikud(text) && <div className="goto-msg" style={{ padding: '6px 0 0' }}>This line has no nikud (vowels). Only the Hebrew-letters versions can read it; the spelled-out ones need the vowels to know how each word sounds. Paste the line with nikud (on Sefaria, turn vowels on) to try them all.</div>}
      <Group id="lab-ways" level={3} title="Ways of giving it the Hebrew" hint={HE_READS.find((m) => m.id === inUse)?.name}>
      <div className="he-lab-list">
        {HE_READS.map((m) => (
          <div key={m.id} className={`he-lab-row ${inUse === m.id ? 'on' : ''}`}>
            <div className="he-lab-name">{m.name}</div>
            <div className="he-lab-shows" dir={m.id === 'he-key' ? 'auto' : isHebrewLetters(m.id) ? 'rtl' : 'ltr'}>{voiceHe(text, m.id)}</div>
            <div className="he-lab-btns">
              <button className="btn" disabled={disabled || !text.trim() || (!hasNikud(text) && m.id !== 'he' && m.id !== 'he-plain' && m.id !== 'he-bare')} onClick={() => void hear(m.id)}>{playing === m.id ? '■ Stop' : '▶ Hear'}</button>
              {inUse === m.id ? <span className="he-lab-inuse">✓ In use</span> : <button className="btn" onClick={() => onChange({ heRead: m.id })}>Use this</button>}
            </div>
            {msg?.mode === m.id && msg.text && <div className="he-lab-said">{msg.text}</div>}
          </div>
        ))}
      </div>
      </Group>
      <Group id="lab-rules" level={3} title="The rules one by one, or mixed" hint={`in calls: ${comboName(inCalls)}`}>
      <div className="rule-lab-now">
        <span>In calls now: <b>{comboName(inCalls)}</b>{!s.liveRules?.length && ' (the standard)'}</span>
        {!!s.liveRules?.length && <button className="linkish" onClick={() => onChange({ liveRules: [] })}>Back to the standard</button>}
      </div>
      {s.liveShort === false && <div className="goto-msg" style={{ padding: '0 0 8px' }}>Calls are set to the Full instructions, so they don&apos;t use these rules. <button className="linkish" onClick={() => onChange({ liveShort: true })}>Switch calls to Short</button></div>}
      {s.nusach === 'sephardi' && <div className="goto-msg" style={{ padding: '0 0 8px' }}>These rules are for Ashkenaz; with Sephardi chosen, calls use the Sephardi guide.</div>}
      <Seg2 value={labMode} options={[['one', 'One rule at a time'], ['mix', 'Mix rules']]} onPick={setLabMode} />
      {labMode === 'one' ? (
        <>
          <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>Each row is the voice with <b>only that one rule</b>, nothing else added. Tap ▶ Hear three times on a row and mark each listen 👍 or 👎. Then do the next row. The row with the best score wins: tap its &ldquo;Use in calls&rdquo;.</div>
          <div className="he-lab-list">
            {[{ id: 'none', name: 'No rules at all', about: 'The voice on its own, to compare against.' }, ...allRules, { id: comboId(STANDARD_RULES), name: 'The standard', about: 'Yeshivish guide + Vowel key: what calls used until now.' }].map((r) => {
              const id = r.id === 'none' ? 'none' : r.id;
              const t = combos[id];
              const isMine = 'mine' in r && r.mine;
              return (
                <div key={id} className={`he-lab-row ${inCalls === id ? 'on' : ''}`}>
                  <div className="he-lab-name">{r.name}{t ? <span className="he-lab-tally"> · {t.good} good of {t.good + t.bad}</span> : null}</div>
                  <div className="rule-lab-what">{r.about}{isMine && <> <button className="linkish" onClick={() => { const m = mine.find((x) => x.id === r.id); if (m) setDraft({ ...m }); }}>Edit</button></>}
                    {!isMine && id !== 'none' && <> <button className="linkish" onClick={() => setShowRule(showRule === id ? null : id)}>{showRule === id ? 'Hide the words' : 'Read the exact words'}</button></>}
                  </div>
                  {showRule === id && (() => {
                    const words = id.split(',').map((x) => ruleText(x, inUse)).filter(Boolean).join('\n\n');
                    return (
                      <div className="rule-words">
                        <div className="rule-words-text" dir="auto">{words}</div>
                        <button className="btn" onClick={() => { setDraft({ id: '', name: `My ${r.name}`, text: words }); setShowRule(null); }}>Make my own rule from this</button>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Opens it as a new rule of yours, to change any words you like. The original stays as it is.</div>
                      </div>
                    );
                  })()}
                  <div className="he-lab-btns">
                    <button className="btn" disabled={disabled || !text.trim()} onClick={() => void hear(inUse, undefined, id)}>{playing === `r:${id}` ? '■ Stop' : '▶ Hear'}</button>
                    <button className="btn" aria-label="Good" onClick={() => voteCombo(true, id)}>👍</button>
                    <button className="btn" aria-label="Not good" onClick={() => voteCombo(false, id)}>👎</button>
                    {inCalls === id ? <span className="he-lab-inuse">✓ In calls</span> : <button className="btn" onClick={() => useInCalls(id)}>Use in calls</button>}
                  </div>
                  {msg?.mode === `r:${id}` && msg.text && <div className="he-lab-said">{msg.text}</div>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>Tap rules to switch them on or off. <b>Everything switched on is heard together.</b> Hear it three times, mark each listen, and try another mix. The best mixes are listed below; tap one to load it.</div>
          <div className="presets">
            {allRules.map((r) => <button key={r.id} className={`chip ${r.mine ? 'mine' : ''} ${combo.includes(r.id) ? 'on' : ''}`} title={r.about} onClick={() => setCombo((c) => (c.includes(r.id) ? c.filter((x) => x !== r.id) : [...c, r.id]))}>{combo.includes(r.id) ? '✓ ' : ''}{r.name}</button>)}
            {combo.length > 0 && <button className="chip" onClick={() => setCombo([])}>Clear all</button>}
          </div>
          <div className="he-lab-row on">
            <div className="he-lab-name">Now: {comboName(cid)}{combos[cid] ? <span className="he-lab-tally"> · {combos[cid].good} good of {combos[cid].good + combos[cid].bad}</span> : null}</div>
            <div className="he-lab-btns">
              <button className="btn primary" disabled={disabled || !text.trim()} onClick={() => void hear(inUse, undefined, cid)}>{playing === `r:${cid}` ? '■ Stop' : '▶ Hear'}</button>
              <button className="btn" aria-label="Good" onClick={() => voteCombo(true)}>👍</button>
              <button className="btn" aria-label="Not good" onClick={() => voteCombo(false)}>👎</button>
              {inCalls === cid ? <span className="he-lab-inuse">✓ In calls</span> : <button className="btn" onClick={() => useInCalls(cid)}>Use in calls</button>}
            </div>
            {msg?.mode === `r:${cid}` && msg.text && <div className="he-lab-said">{msg.text}</div>}
          </div>
          {Object.keys(combos).some((id) => id.includes(',')) && (
            <div className="rule-lab-scores">
              <div className="muted" style={{ fontSize: 12, margin: '8px 0 4px' }}>Mixes tried (best first). Tap one to load it.</div>
              {Object.entries(combos).filter(([id]) => id.includes(',')).sort((a, b) => (b[1].good / Math.max(1, b[1].good + b[1].bad)) - (a[1].good / Math.max(1, a[1].good + a[1].bad)) || b[1].good - a[1].good).map(([id, t]) => (
                <button key={id} className={`rule-lab-score ${id === cid ? 'on' : ''}`} onClick={() => setCombo(id.split(','))}>
                  <span>{comboName(id)}{id === inCalls ? ' (in calls)' : ''}</span><span>{t.good} of {t.good + t.bad}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {draft ? (
        <div className="rule-write" ref={draftRef}>
          <input type="text" placeholder="A short name (e.g. Lakewood bochur)" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <textarea rows={4} placeholder="The rule, the way you'd tell the voice. For example: Read the Gemara like a Lakewood bochur saying it over to his chavrusa: relaxed, in the niggun, every word clear." value={draft.text} maxLength={3000} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <div className="he-lab-btns">
            <button className="btn primary" disabled={!draft.text.trim()} onClick={saveDraft}>Save</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            {draft.id && <button className="btn" onClick={() => deleteRule(draft.id)}>Delete</button>}
          </div>
        </div>
      ) : <button className="linkish" style={{ fontSize: 13, margin: '10px 0 4px' }} onClick={() => setDraft({ id: '', name: '', text: '' })}>+ Write your own rule</button>}
      {Object.keys(combos).length > 0 && <div><button className="linkish" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setCombos(() => ({}))}>Clear all the scores</button></div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Uses your voice and the way of giving it the Hebrew chosen above. The rules apply with the Short instructions (Use in calls sets that).</div>
      </Group>
      <Group id="lab-voices" level={3} title="Which voice is steadiest" hint="Hear each voice, mark each listen">
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>The same line in each voice, read the way in use above. A voice can sound great once and not the next time, so hear each a few times and mark every listen 👍 or 👎. The one with the most good listens is the steadiest. About a cent per listen.</div>
      <div className="he-lab-list">
        {LIVE_VOICES.map((v) => {
          const t = votes[v.id];
          const key = `v:${v.id}`;
          if (t?.gone) return <div key={v.id} className="he-lab-row gone"><div className="he-lab-name">{v.name}</div><div className="he-lab-said">Not available on GPT-Live. <button className="linkish" onClick={() => setVotes((x) => { const n = { ...x }; delete n[v.id]; return n; })}>Try again</button></div></div>;
          return (
            <div key={v.id} className={`he-lab-row ${s.liveVoice === v.id ? 'on' : ''}`}>
              <div className="he-lab-name">{v.name}{t && (t.good || t.bad) ? <span className="he-lab-tally"> · {t.good} good of {t.good + t.bad}</span> : null}</div>
              <div className="he-lab-btns">
                <button className="btn" disabled={disabled || !text.trim()} onClick={() => void hear(inUse, v.id)}>{playing === key ? '■ Stop' : '▶ Hear'}</button>
                <button className="btn" aria-label="Good" onClick={() => vote(v.id, true)}>👍</button>
                <button className="btn" aria-label="Not good" onClick={() => vote(v.id, false)}>👎</button>
                {s.liveVoice === v.id ? <span className="he-lab-inuse">✓ In use</span> : <button className="btn" onClick={() => onChange({ liveVoice: v.id })}>Use this</button>}
              </div>
              {msg?.mode === key && msg.text && <div className="he-lab-said">{msg.text}</div>}
            </div>
          );
        })}
      </div>
      {Object.values(votes).some((x) => x.good || x.bad) && <button className="linkish" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setVotes((x) => Object.fromEntries(Object.entries(x).filter(([, y]) => y.gone)))}>Clear the marks</button>}
      </Group>
      {disabled && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>End the current call to test.</div>}
    </div>
  );
}
