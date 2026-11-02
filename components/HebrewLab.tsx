'use client';
// Settings → Voice → Hebrew reading test: the same line of lashon kodesh in several ways of giving it to the voice
// (Hebrew letters, or spelled out in English letters in different ways), each heard in your own voice the way a call
// would read it. Pick the one that sounds best by ear, and the app uses it everywhere in calls.
import { useEffect, useRef, useState } from 'react';
import { LIVE_VOICES, type Settings } from '@/lib/config';
import { RULES, STANDARD_RULES } from '@/lib/live';
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
];

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
  const [votes, setVotesRaw] = useState<Votes>(() => { try { return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}'); } catch { return {}; } });
  const setVotes = (f: (v: Votes) => Votes) => setVotesRaw((v) => { const n = f(v); try { localStorage.setItem(VOTES_KEY, JSON.stringify(n)); } catch { /* not kept */ } return n; });
  // The rule lab: which rules are switched on for the next listen (starts from what calls use), and the score so far.
  // The built-in rules and the ones he wrote himself (kept in his settings, so calls can use them too).
  const mine = s.customRules ?? [];
  const allRules: { id: string; name: string; about: string; mine?: boolean }[] = [...RULES, ...mine.map((r) => ({ id: r.id, name: r.name, about: r.text, mine: true }))];
  const comboId = (ids: string[]) => { const k = allRules.filter((r) => ids.includes(r.id)).map((r) => r.id); return k.length ? k.join(',') : 'none'; };
  const comboName = (id: string) => (id === 'none' ? 'No rules at all' : id.split(',').map((x) => allRules.find((r) => r.id === x)?.name ?? '(a deleted rule)').join(' + '));
  const [draft, setDraft] = useState<{ id: string; name: string; text: string } | null>(null);
  // One rule at a time (each its own row, nothing piles up) or mixing several.
  const [labMode, setLabModeRaw] = useState<'one' | 'mix'>(() => { try { return localStorage.getItem('chavrusa-rule-lab-mode') === 'mix' ? 'mix' : 'one'; } catch { return 'one'; } });
  const setLabMode = (m: 'one' | 'mix') => { setLabModeRaw(m); try { localStorage.setItem('chavrusa-rule-lab-mode', m); } catch { /* not kept */ } };
  function saveDraft() {
    if (!draft || !draft.text.trim()) return;
    const id = draft.id || `my-${Date.now().toString(36)}`;
    const rule = { id, name: draft.name.trim() || `My rule ${mine.length + 1}`, text: draft.text.trim().slice(0, 800) };
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
  async function hear(mode: HeRead, voice?: string, rules?: string, instr?: 'short' | 'full', keyAs?: string, pace?: string) {
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
      const q = new URLSearchParams({ preview: '1', voice: voice || s.liveVoice || 'meridian', say: text, mode });
      if (rules !== undefined) q.set('rules', rules);
      if (instr) q.set('instr', instr);
      if (pace) q.set('pace', pace);
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) {
        said = 'x'; end();
        // OpenAI turned this voice down: it isn't on GPT-Live (remembered, so it's set aside).
        if (voice && /\(4\d\d\): .*voice/i.test(String(d.error ?? ''))) { setVotes((v) => ({ ...v, [voice]: { good: 0, bad: 0, gone: true } })); note(`Not available on GPT-Live. OpenAI says: ${String(d.error).replace(/^Live voice could not start \(\d+\): /, '').slice(0, 200)}`); return; }
        note(d.error ?? 'Could not start the test.'); return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch (e) { said = 'x'; end(); note((e as Error).message); }
  }

  // ---------- The easy way: "which sounds better, A or B?" ----------
  // A whole setup is tuned, one choice at a time, by ear alone: how the Hebrew is given, (optionally) which voice, the
  // rules one by one, then adding the good rules together, then short or full instructions, and last a check of the
  // winner against what calls use now. Each step pits the best so far against one change; he hears A and B (which is
  // which stays hidden) and taps the better. "About the same" keeps the best so far, so a change has to earn its place.
  type Pace = 'slow' | 'relaxed' | 'natural' | 'brisk';
  type Cfg = { mode: HeRead; voice: string; rules: string; instr: 'short' | 'full'; pace: Pace };
  type StageId = 'way' | 'voice' | 'rules' | 'mix' | 'trim' | 'way2' | 'instr' | 'pace' | 'final';
  type Tune = { stages: StageId[]; si: number; step: number; champ: Cfg; chal: Cfg | null; champOnA: boolean; good: string[]; goodWays: HeRead[]; start: Cfg; done: boolean; won: boolean; back?: Omit<Tune, 'back'>[] };
  const cfgKey = (c: Cfg) => `c:${c.mode}|${c.voice}|${c.rules}|${c.instr}|${c.pace}`;
  const sameCfg = (a: Cfg, b: Cfg) => cfgKey(a) === cfgKey(b);
  const STAGE_NAME: Record<StageId, string> = { way: 'How the Hebrew is given', voice: 'Which voice', rules: 'The rules, one at a time', mix: 'Adding rules together, one at a time', trim: 'Taking each rule out again, to see if it’s better without it', way2: 'How the Hebrew is given, again, with the rules chosen', instr: 'Short or full instructions', pace: 'Speaking speed', final: 'Last check: against what calls use now' };
  const [withVoices, setWithVoices] = useState(true);
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
  function challengers(st: StageId, t: Pick<Tune, 'good' | 'goodWays' | 'start'>): ((c: Cfg) => Cfg | null)[] {
    // Every way of giving it the Hebrew (the spelled-out ones need nikud in the line); the second time, only the ways
    // that won or held their own the first time.
    if (st === 'way') return HE_READS.map((m) => m.id).filter((m) => hasNikud(text) || isHebrewLetters(m)).map((m) => (c) => ({ ...c, mode: m }));
    if (st === 'way2') return t.goodWays.map((m) => (c) => ({ ...c, mode: m }));
    if (st === 'voice') return voicesOk.map((v) => (c) => ({ ...c, voice: v }));
    if (st === 'rules') return ['none', comboId(STANDARD_RULES), ...allRules.map((r) => r.id)].map((r) => (c) => ({ ...c, rules: r, instr: 'short' }));
    // Adding: every rule gets a turn being added to the best so far (the ones that did well alone first). An addition
    // only stays if the whole set with it beats the set without it, so a rule that's good alone but spoils the others
    // never gets in.
    if (st === 'mix') return [...t.good, ...allRules.map((r) => r.id).filter((r) => !t.good.includes(r))].map((r) => (c) => {
      const have = c.rules === 'none' ? [] : c.rules.split(',');
      if (have.includes(r)) return null;
      return { ...c, rules: comboId([...have, r]), instr: 'short' };
    });
    // Taking out: each rule in the best set is tried without it, in case one that helped early is now in the way.
    if (st === 'trim') return allRules.map((r) => r.id).map((r) => (c) => {
      const have = c.rules === 'none' ? [] : c.rules.split(',');
      if (!have.includes(r) || have.length < 2) return null;
      return { ...c, rules: comboId(have.filter((x) => x !== r)), instr: 'short' };
    });
    if (st === 'instr') return [(c) => ({ ...c, instr: c.instr === 'short' ? 'full' : 'short' })];
    if (st === 'pace') return (['slow', 'relaxed', 'natural', 'brisk'] as Pace[]).map((p) => (c) => ({ ...c, pace: p }));
    return [() => t.start];
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
    return { ...t, si, step, chal: null, done: true, won: !sameCfg(t.champ, t.start) };
  }
  const startTune = () => {
    const stages: StageId[] = ['way', ...(withVoices ? (['voice'] as StageId[]) : []), 'rules', 'mix', 'trim', 'way2', 'instr', ...(withPace ? (['pace'] as StageId[]) : []), 'final'];
    setTune(advance({ stages, si: 0, step: 0, champ: startCfg, chal: null, champOnA: true, good: [], goodWays: [], start: startCfg, done: false, won: false }));
  };
  const tuneA = tune?.chal ? (tune.champOnA ? tune.champ : tune.chal) : null;
  const tuneB = tune?.chal ? (tune.champOnA ? tune.chal : tune.champ) : null;
  const pick = (side: 'A' | 'B' | 'same') => {
    if (!tune?.chal) return;
    endRef.current?.();
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
    setTune({ ...advance({ ...before, champ, good, goodWays, step: tune.step + 1 }), back: [...back, before].slice(-80) });
  };
  // Undo: back to the pair before the last pick, as it was (A and B the same way round), as many times as wanted.
  const undo = () => {
    if (!tune?.back?.length) return;
    endRef.current?.();
    const back = tune.back.slice(0, -1);
    setTune({ ...tune.back[tune.back.length - 1], back });
  };
  const describe = (c: Cfg) => [
    `Hebrew given as: ${HE_READS.find((m) => m.id === c.mode)?.name ?? c.mode}`,
    `Voice: ${LIVE_VOICES.find((v) => v.id === c.voice)?.name ?? c.voice}`,
    c.instr === 'full' ? 'Instructions: Full (the rules aren’t used with these)' : `Instructions: Short · Rules: ${comboName(c.rules)}`,
    `Speed: ${({ slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' } as Record<Pace, string>)[c.pace]}`,
  ];
  const useSetup = (c: Cfg) => onChange({ heRead: c.mode, liveVoice: c.voice, liveRules: c.rules === 'none' ? ['none'] : c.rules.split(','), liveShort: c.instr === 'short', livePace: c.pace });
  const setupInCalls = sameCfg(startCfg, tune?.champ ?? startCfg);

  return (
    <div className="field he-lab">
      <label>Hebrew reading test</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Choose a line (or paste one), then use the easy test below. Whatever you choose applies from the next Talk.</div>
      <div className="presets">{LINES.map((l) => <button key={l.name} className={`chip ${l.he === text ? 'on' : ''}`} onClick={() => setText(l.he)}>{l.name}</button>)}</div>
      <textarea rows={2} dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a line with nikud" />
      {text.trim() && !hasNikud(text) && <div className="goto-msg" style={{ padding: '6px 0 0' }}>This line has no nikud (vowels). Only the Hebrew-letters versions can read it; the spelled-out ones need the vowels to know how each word sounds. Paste the line with nikud (on Sefaria, turn vowels on) to try them all.</div>}
      <div className="tuner">
        <div className="tuner-title">Find the best setup, the easy way</div>
        {!tune && (
          <>
            <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>You&apos;ll hear the line above read two ways, A and B, and tap the one that sounds better. Step by step it tries everything that changes how the Hebrew sounds: how the Hebrew is given to the voice, the voices, every rule on its own (yours too), adding rules together one at a time (each addition has to beat the set without it), taking each one out again to check it still helps, how the Hebrew is given again with those rules, short or full instructions, and the speed. Each step keeps the best so far, and at the end the winner has to beat what calls use now. About 30–45 pairs, about 2¢ a pair (60–90¢ in all). You can stop and start again any time.</div>
            <label className="tuner-check"><input type="checkbox" checked={withVoices} onChange={(e) => setWithVoices(e.target.checked)} /> Compare the voices too ({voicesOk.length - 1} pairs)</label>
            <label className="tuner-check"><input type="checkbox" checked={withPace} onChange={(e) => setWithPace(e.target.checked)} /> Compare the speaking speeds too (3 pairs; the speed also applies to the rest of the call)</label>
            <button className="btn primary" disabled={disabled || !text.trim()} onClick={startTune}>Start</button>
          </>
        )}
        {tune && !tune.done && tuneA && tuneB && (
          <>
            <div className="tuner-step">Step {tune.si + 1} of {tune.stages.length}: {STAGE_NAME[tune.stages[tune.si]]} · saved as you go</div>
            <div className="tuner-ab">
              {(['A', 'B'] as const).map((side) => {
                const c = side === 'A' ? tuneA : tuneB;
                const key = `${side}:${cfgKey(c)}`;
                return (
                  <div key={side} className="tuner-side">
                    <button className="btn tuner-play" disabled={disabled} onClick={() => void hear(c.mode, c.voice, c.rules, c.instr, key, c.pace)}>{playing === key ? '■ Stop' : `▶ Hear ${side}`}</button>
                    <button className="btn primary" onClick={() => pick(side)}>{side} is better</button>
                  </div>
                );
              })}
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => pick('same')}>About the same</button>
            {msg && /^[AB]:/.test(msg.mode) && /^(Live voice|Could not|Your phone|The voice connected|Not available)/.test(msg.text) && <div className="he-lab-said">{msg.text}</div>}
            <div className="tuner-foot">
              {!!tune.back?.length && <button className="btn" onClick={undo}>← Undo last pick</button>}
              <span>Not sure? Hear them again.</span>
              <button className="linkish" onClick={() => { endRef.current?.(); setTune(null); }}>Stop and start over</button>
            </div>
          </>
        )}
        {tune?.done && (
          <>
            {tune.won ? <div className="tuner-win">The winner is a new setup, and it beat what calls use now:</div> : <div className="tuner-win">What calls use now held up: nothing beat it.</div>}
            <ul className="tuner-setup">{describe(tune.champ).map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="he-lab-btns">
              {setupInCalls ? <span className="he-lab-inuse">✓ Calls use this</span> : <button className="btn primary" onClick={() => useSetup(tune.champ)}>Use this setup in calls</button>}
              <button className="btn" onClick={startTune}>Test again</button>
              {!!tune.back?.length && <button className="btn" onClick={undo}>← Undo last pick</button>}
              <button className="linkish" onClick={() => setTune(null)}>Done</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>The voice varies from one listen to the next. If the same setup wins twice, it&apos;s the one.</div>
          </>
        )}
        <div className="tuner-now">Calls use now: {describe(startCfg).join(' · ')}</div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '14px 0 2px' }}>More (to test things one at a time yourself):</div>
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
                  <div className="rule-lab-what">{r.about}{isMine && <> <button className="linkish" onClick={() => { const m = mine.find((x) => x.id === r.id); if (m) setDraft({ ...m }); }}>Edit</button></>}</div>
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
        <div className="rule-write">
          <input type="text" placeholder="A short name (e.g. Lakewood bochur)" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <textarea rows={4} placeholder="The rule, the way you'd tell the voice. For example: Read the Gemara like a Lakewood bochur saying it over to his chavrusa: relaxed, in the niggun, every word clear." value={draft.text} maxLength={800} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
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
