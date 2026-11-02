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
  async function hear(mode: HeRead, voice?: string, rules?: string) {
    const key = rules !== undefined ? `r:${rules}` : voice ? `v:${voice}` : mode;
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
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) {
        said = 'x'; end();
        // OpenAI turned this voice down: it isn't on GPT-Live (remembered, so it's set aside).
        if (voice && /\(4\d\d\): .*voice/i.test(String(d.error ?? ''))) { setVotes((v) => ({ ...v, [voice]: { good: 0, bad: 0, gone: true } })); note('Not available on GPT-Live.'); return; }
        note(d.error ?? 'Could not start the test.'); return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch (e) { said = 'x'; end(); note((e as Error).message); }
  }

  return (
    <div className="field he-lab">
      <label>Hebrew reading test</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>The same line, given to your voice in different ways. Tap ▶ on each and listen, then tap “Use this” on the one that sounds cleanest. Calls use it from the next Talk. About a cent per listen.</div>
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
              <button className="btn" disabled={disabled || !text.trim() || (!hasNikud(text) && m.id !== 'he' && m.id !== 'he-plain')} onClick={() => void hear(m.id)}>{playing === m.id ? '■ Stop' : '▶ Hear'}</button>
              {inUse === m.id ? <span className="he-lab-inuse">✓ In use</span> : <button className="btn" onClick={() => onChange({ heRead: m.id })}>Use this</button>}
            </div>
            {msg?.mode === m.id && msg.text && <div className="he-lab-said">{msg.text}</div>}
          </div>
        ))}
      </div>
      </Group>
      <Group id="lab-rules" level={3} title="Try the rules" hint={`in calls: ${comboName(inCalls)}`}>
      <div className="rule-lab-now">
        <span>In calls now: <b>{comboName(inCalls)}</b>{!s.liveRules?.length && ' (the standard)'}</span>
        {!!s.liveRules?.length && <button className="linkish" onClick={() => onChange({ liveRules: [] })}>Back to the standard</button>}
      </div>
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
