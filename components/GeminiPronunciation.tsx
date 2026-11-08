'use client';
// Gemini only (Settings → Voice): tune how Gemini says Hebrew and yeshivish words. GPT-Live isn't affected.
// The guide it follows, how lashon kodesh is spelled out for it, your own "say it my way" list, and a test box
// that says any word or line the way a Gemini call would.
import { useRef, useState } from 'react';
import type { Settings } from '@/lib/config';

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=';
const PRESETS = [
  'בְּרֵאשִׁית בָּרָא אֱלֹקִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ',
  'מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִין',
  'Rashi says, Tosafos asks a kashya, and the Gemara answers. Shabbos, Moishe Rabbeinu, machlokes.',
];

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>;
}

export default function GeminiPronunciation({ s, onChange }: { s: Settings; onChange: (p: Partial<Settings>) => void }) {
  const list = s.geminiMyWay ?? [];
  const [word, setWord] = useState('');
  const [say, setSay] = useState('');
  const [text, setText] = useState(PRESETS[0]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'playing'>('idle');
  const [msg, setMsg] = useState('');
  const [spoken, setSpoken] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const lastUrl = useRef('');

  const player = () => (audio.current ??= new Audio());
  const playNow = (url: string) => {
    const a = player();
    a.onended = () => setState('idle');
    a.src = url;
    return a.play().then(() => setState('playing'));
  };
  async function hear() {
    setMsg('');
    if (state === 'playing') { audio.current?.pause(); setState('idle'); return; }
    if (state === 'ready' && lastUrl.current) { void playNow(lastUrl.current).catch(() => setMsg('Safari blocked the sound. Check that silent mode is off, then tap ▶ Play again.')); return; }
    const a = player(); a.src = SILENCE; a.play().catch(() => {}); // unlock sound inside the tap
    setState('loading');
    try {
      const r = await fetch('/api/gemini/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: s.geminiVoice }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error ?? 'Could not get it.'); setState('idle'); return; }
      setSpoken(decodeURIComponent(r.headers.get('X-Spoken-As') ?? ''));
      const url = URL.createObjectURL(await r.blob());
      lastUrl.current = url;
      await playNow(url).catch(() => setState('ready'));
    } catch (e) { setMsg((e as Error).message); setState('idle'); }
  }
  const changed = () => { setState('idle'); lastUrl.current = ''; };

  return (
    <div className="field gem-pron">
      <label>Gemini pronunciation (Gemini only; GPT-Live isn&apos;t changed)</label>

      <div className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>Guide it follows</div>
      <Seg value={s.geminiPron ?? 'gemini'} options={[['gemini', "Gemini's own"], ['same', 'Same as GPT-Live'], ['plain', 'None']]} onPick={(v) => { onChange({ geminiPron: v }); changed(); }} />

      <div className="muted" style={{ fontSize: 12, margin: '10px 0 6px' }}>How lashon kodesh is spelled out for it</div>
      <Seg value={s.geminiSpell ?? 'stressed'} options={[['stressed', 'be-REI-shis'], ['joined', 'beREIshis'], ['plain', 'bereishis']]} onPick={(v) => { onChange({ geminiSpell: v }); changed(); }} />

      <div className="muted" style={{ fontSize: 12, margin: '12px 0 6px' }}>Say it my way (word → how it should sound)</div>
      {list.length > 0 && (
        <ul className="myway">
          {list.map((x, i) => (
            <li key={`${x.word}-${i}`}><span>{x.word}</span><span className="arrow">→</span><span>{x.say}</span>
              <button aria-label={`Remove ${x.word}`} onClick={() => { onChange({ geminiMyWay: list.filter((_, k) => k !== i) }); changed(); }}>×</button></li>
          ))}
        </ul>
      )}
      <div className="myway-add">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Tosafos" />
        <span className="arrow">→</span>
        <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="TOSS-fis" />
        <button className="btn" disabled={!word.trim() || !say.trim()} onClick={() => { onChange({ geminiMyWay: [...list, { word: word.trim(), say: say.trim() }] }); setWord(''); setSay(''); changed(); }}>Add</button>
      </div>

      <div className="muted" style={{ fontSize: 12, margin: '12px 0 6px' }}>Test it: type a word or a line (Hebrew or English), or pick one</div>
      <div className="presets">{PRESETS.map((p) => <button key={p} className={`chip ${p === text ? 'on' : ''}`} dir="auto" onClick={() => { setText(p); changed(); }}>{p.length > 28 ? `${p.slice(0, 28)}…` : p}</button>)}</div>
      <textarea rows={2} dir="auto" value={text} onChange={(e) => { setText(e.target.value); changed(); }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <button className={`btn ${state === 'ready' ? 'primary' : ''}`} onClick={hear} disabled={state === 'loading' || !text.trim()}>
          {state === 'loading' ? 'Preparing…' : state === 'playing' ? '■ Stop' : state === 'ready' ? '▶ Play' : '▶ Hear it'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>in {s.geminiVoice || 'Achird'}’s voice · about a cent for each new line</span>
      </div>
      {spoken && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Gemini was given: <i>{spoken}</i></div>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
