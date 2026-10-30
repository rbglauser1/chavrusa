'use client';
// GPT-Live (Settings → Voice): tune how your voice says Hebrew and yeshivish words. Gemini has its own section.
// A light yeshivish accent and niggun, how lashon kodesh is spelled out for it, your own "say it my way" list
// (also filled by saying "it's TOSS-fis, not Tosafos" in a call), and a test box that has the voice say any line.
import { useEffect, useRef, useState } from 'react';
import type { Settings } from '@/lib/config';
import { silentWav } from './useVoice';

const PRESETS = [
  'בְּרֵאשִׁית בָּרָא אֱלֹקִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ',
  'מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִין',
  'Rashi says, Tosafos asks a kashya, and the Gemara answers. Shabbos, Moishe Rabbeinu, machlokes.',
];

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>;
}

export default function GptPronunciation({ s, onChange, disabled }: { s: Settings; onChange: (p: Partial<Settings>) => void; disabled?: boolean }) {
  const list = s.gptMyWay ?? [];
  const [word, setWord] = useState('');
  const [say, setSay] = useState('');
  const [text, setText] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [given, setGiven] = useState('');
  const el = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { endRef.current?.(); ctxRef.current?.close().catch(() => {}); }, []);

  // Have GPT-Live say the line, the way a call would (a short Live connection, about a cent).
  async function hear() {
    if (busy) { endRef.current?.(); return; }
    setMsg(''); setGiven('');
    // Inside the tap: unlock the player and the small sound engine (phones only allow sound a tap began).
    let a = el.current;
    if (!a) { a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); el.current = a; }
    a.srcObject = null; a.src = silentWav(); a.play().catch(() => {});
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (ctxRef.current ??= new AC());
    void ctx.resume();
    setBusy(true);
    const pc = new RTCPeerConnection();
    const osc = ctx.createOscillator(); const gn = ctx.createGain(); gn.gain.value = 0;
    const dest = ctx.createMediaStreamDestination(); osc.connect(gn).connect(dest); osc.start();
    dest.stream.getAudioTracks().forEach((t) => pc.addTrack(t, dest.stream));
    const dc = pc.createDataChannel('oai-events');
    const player = a;
    player.autoplay = true;
    pc.ontrack = (ev) => { player.removeAttribute('src'); player.srcObject = ev.streams[0]; player.play().catch(() => setMsg('Your phone blocked the sound. Check silent mode, then tap ▶ Hear it again.')); };
    const started = Date.now();
    let ended = false, said = '', lastWord = 0;
    const end = () => {
      if (ended) return;
      ended = true;
      try { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'session.close', event_id: `evt_${Date.now()}` })); } catch { /* ignore */ }
      setTimeout(() => { try { pc.close(); } catch { /* ignore */ } player.pause(); player.srcObject = null; try { osc.stop(); } catch { /* ignore */ } }, 300);
      fetch('/api/live/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: Math.max(15, (Date.now() - started) / 1000) }) }).catch(() => {});
      if (!said) setMsg('The voice connected but didn’t speak. Try again.');
      setBusy(false);
      endRef.current = null;
    };
    endRef.current = end;
    dc.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'session.output_transcript.delta' && e.delta) { said += e.delta; lastWord = Date.now(); }
        if (e.type === 'error' || e.type === 'session.error') setMsg(`Live voice: ${e.error?.message ?? e.message ?? 'error'}`);
      } catch { /* ignore */ }
    };
    // Finish a moment after it stops speaking (or after 30 seconds at most).
    const watch = window.setInterval(() => {
      if (ended) { clearInterval(watch); return; }
      if ((lastWord && Date.now() - lastWord > 2500) || Date.now() - started > 30_000) { clearInterval(watch); end(); }
    }, 300);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const q = new URLSearchParams({ preview: '1', voice: s.liveVoice || 'meridian', say: text });
      const res = await fetch(`/api/live/session?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp ?? '' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sdp) { said = 'x'; end(); setMsg(d.error ?? 'Could not start the test.'); return; }
      if (d.line) setGiven(d.line);
      await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } catch (e) { said = 'x'; end(); setMsg((e as Error).message); }
  }

  return (
    <div className="field gem-pron">
      <label>How your voice says Hebrew and yeshivish words (GPT-Live)</label>

      <div className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>Yeshivish accent and the Gemara niggun on kashyos</div>
      <Seg value={s.liveAccent ? 'on' : 'off'} options={[['off', 'Off (plain American)'], ['on', 'On (light)']]} onPick={(v) => onChange({ liveAccent: v === 'on' })} />

      <div className="muted" style={{ fontSize: 12, margin: '10px 0 6px' }}>How lashon kodesh is spelled out for it</div>
      <Seg value={s.gptSpell ?? 'stressed'} options={[['stressed', 'be-REI-shis'], ['joined', 'beREIshis'], ['plain', 'bereishis']]} onPick={(v) => onChange({ gptSpell: v })} />

      <div className="muted" style={{ fontSize: 12, margin: '12px 0 6px' }}>Say it my way (word → how it should sound). In a call you can also just say “it’s TOSS-fis, not Tosafos.”</div>
      {list.length > 0 && (
        <ul className="myway">
          {list.map((x, i) => (
            <li key={`${x.word}-${i}`}><span>{x.word}</span><span className="arrow">→</span><span>{x.say}</span>
              <button aria-label={`Remove ${x.word}`} onClick={() => onChange({ gptMyWay: list.filter((_, k) => k !== i) })}>×</button></li>
          ))}
        </ul>
      )}
      <div className="myway-add">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Tosafos" />
        <span className="arrow">→</span>
        <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="TOSS-fis" />
        <button className="btn" disabled={!word.trim() || !say.trim()} onClick={() => { onChange({ gptMyWay: [...list.filter((x) => x.word.toLowerCase() !== word.trim().toLowerCase()), { word: word.trim(), say: say.trim() }] }); setWord(''); setSay(''); }}>Add</button>
      </div>

      <div className="muted" style={{ fontSize: 12, margin: '12px 0 6px' }}>Test it: type a word or a line (Hebrew or English), or pick one</div>
      <div className="presets">{PRESETS.map((p) => <button key={p} className={`chip ${p === text ? 'on' : ''}`} dir="auto" onClick={() => setText(p)}>{p.length > 28 ? `${p.slice(0, 28)}…` : p}</button>)}</div>
      <textarea rows={2} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <button className="btn" onClick={hear} disabled={disabled || !text.trim()}>{busy ? '■ Stop' : '▶ Hear it'}</button>
        <span className="muted" style={{ fontSize: 12 }}>in your voice, as in a call · about a cent each</span>
      </div>
      {disabled && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>End the current call to test.</div>}
      {given && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The voice was given: <i>{given}</i></div>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
