'use client';
// Settings → Voice → Hebrew reading test: the same line of lashon kodesh in several ways of giving it to the voice
// (Hebrew letters, or spelled out in English letters in different ways), each heard in your own voice the way a call
// would read it. Pick the one that sounds best by ear, and the app uses it everywhere in calls.
import { useEffect, useRef, useState } from 'react';
import type { Settings } from '@/lib/config';
import { hasNikud, HE_READS, isHebrewLetters, voiceHe, type HeRead } from '@/lib/hebrew';
import { silentWav } from './useVoice';

const TEXT_KEY = 'chavrusa-hebrew-test-line';
const LINES = [
  { name: 'Mishnah', he: 'הָאִשָּׁה נִקְנֵית בְּשָׁלֹשׁ דְּרָכִים, וְקוֹנָה אֶת עַצְמָהּ בִּשְׁתֵּי דְרָכִים. נִקְנֵית בְּכֶסֶף, בִּשְׁטָר, וּבְבִיאָה.' },
  { name: 'Beis Shammai', he: 'בְּכֶסֶף, בֵּית שַׁמַּאי אוֹמְרִים: בְּדִינָר וּבְשָׁוֶה דִינָר. וּבֵית הִלֵּל אוֹמְרִים: בִּפְרוּטָה וּבְשָׁוֶה פְרוּטָה.' },
  { name: 'Gemara', he: 'מַאי שְׁנָא הָכָא דְּתָנֵי הָאִשָּׁה נִקְנֵית, וּמַאי שְׁנָא הָתָם דְּתָנֵי הָאִישׁ מְקַדֵּשׁ?' },
  { name: 'Bereishis', he: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ.' },
];

export default function HebrewLab({ s, onChange, disabled }: { s: Settings; onChange: (p: Partial<Settings>) => void; disabled?: boolean }) {
  // The line being tested is remembered on this device, so it stays when Settings re-open or the page refreshes.
  const [text, setTextRaw] = useState<string>(() => { try { return localStorage.getItem(TEXT_KEY) || LINES[0].he; } catch { return LINES[0].he; } });
  const setText = (t: string) => { setTextRaw(t); try { localStorage.setItem(TEXT_KEY, t); } catch { /* not kept */ } };
  const [playing, setPlaying] = useState<HeRead | null>(null);
  const [msg, setMsg] = useState('');
  const el = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { endRef.current?.(); ctxRef.current?.close().catch(() => {}); }, []);
  const inUse: HeRead = s.heRead ?? 'join-kh';

  // Have GPT-Live read the line given this way, the way a call would (a short Live connection, about a cent).
  async function hear(mode: HeRead) {
    if (playing) { endRef.current?.(); if (playing === mode) return; }
    setMsg('');
    // Inside the tap: unlock the player and the small sound engine (phones only allow sound a tap began).
    let a = el.current;
    if (!a) { a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); el.current = a; }
    a.srcObject = null; a.src = silentWav(); a.play().catch(() => {});
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (ctxRef.current ??= new AC());
    void ctx.resume();
    setPlaying(mode);
    const pc = new RTCPeerConnection();
    const osc = ctx.createOscillator(); const gn = ctx.createGain(); gn.gain.value = 0;
    const dest = ctx.createMediaStreamDestination(); osc.connect(gn).connect(dest); osc.start();
    dest.stream.getAudioTracks().forEach((t) => pc.addTrack(t, dest.stream));
    const dc = pc.createDataChannel('oai-events');
    const player = a;
    player.autoplay = true;
    pc.ontrack = (ev) => { player.removeAttribute('src'); player.srcObject = ev.streams[0]; player.play().catch(() => setMsg('Your phone blocked the sound. Check silent mode, then tap ▶ again.')); };
    const started = Date.now();
    let ended = false, said = '', lastWord = 0;
    const end = () => {
      if (ended) return;
      ended = true;
      try { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'session.close', event_id: `evt_${Date.now()}` })); } catch { /* ignore */ }
      setTimeout(() => { try { pc.close(); } catch { /* ignore */ } player.pause(); player.srcObject = null; try { osc.stop(); } catch { /* ignore */ } }, 300);
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: Math.max(15, (Date.now() - started) / 1000) }) }).catch(() => {});
      if (!said) setMsg('The voice connected but didn’t speak. Try again.');
      setPlaying((p) => (p === mode ? null : p));
      if (endRef.current === end) endRef.current = null;
    };
    endRef.current = end;
    dc.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'session.output_transcript.delta' && e.delta) { said += e.delta; lastWord = Date.now(); }
        if (e.type === 'error' || e.type === 'session.error') setMsg(`Live voice: ${e.error?.message ?? e.message ?? 'error'}`);
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
      const q = new URLSearchParams({ preview: '1', voice: s.liveVoice || 'meridian', say: text, mode });
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) { said = 'x'; end(); setMsg(d.error ?? 'Could not start the test.'); return; }
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch (e) { said = 'x'; end(); setMsg((e as Error).message); }
  }

  return (
    <div className="field he-lab">
      <label>Hebrew reading test</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>The same line, given to your voice in different ways. Tap ▶ on each and listen, then tap “Use this” on the one that sounds cleanest. Calls use it from the next Talk. About a cent per listen.</div>
      <div className="presets">{LINES.map((l) => <button key={l.name} className={`chip ${l.he === text ? 'on' : ''}`} onClick={() => setText(l.he)}>{l.name}</button>)}</div>
      <textarea rows={2} dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a line with nikud" />
      {text.trim() && !hasNikud(text) && <div className="goto-msg" style={{ padding: '6px 0 0' }}>This line has no nikud (vowels). Only the Hebrew-letters versions can read it; the spelled-out ones need the vowels to know how each word sounds. Paste the line with nikud (on Sefaria, turn vowels on) to try them all.</div>}
      <div className="he-lab-list">
        {HE_READS.map((m) => (
          <div key={m.id} className={`he-lab-row ${inUse === m.id ? 'on' : ''}`}>
            <div className="he-lab-name">{m.name}</div>
            <div className="he-lab-shows" dir={m.id === 'he-key' ? 'auto' : isHebrewLetters(m.id) ? 'rtl' : 'ltr'}>{voiceHe(text, m.id)}</div>
            <div className="he-lab-btns">
              <button className="btn" disabled={disabled || !text.trim() || (!hasNikud(text) && m.id !== 'he' && m.id !== 'he-plain')} onClick={() => void hear(m.id)}>{playing === m.id ? '■ Stop' : '▶ Hear'}</button>
              {inUse === m.id ? <span className="he-lab-inuse">✓ In use</span> : <button className="btn" onClick={() => onChange({ heRead: m.id })}>Use this</button>}
            </div>
          </div>
        ))}
      </div>
      {disabled && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>End the current call to test.</div>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
