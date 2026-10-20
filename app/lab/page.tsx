'use client';
import { useEffect, useState } from 'react';
import { MODELS, Provider, STYLES, Tier, TIER_LABELS } from '@/lib/config';
import { Formatted } from '@/components/Message';

interface Result { style: string; name?: string; text?: string; error?: string; usd?: number; seconds?: number; words?: number }

// Style lab: compare every learning style on the same source and learner message.
export default function Lab() {
  const [source, setSource] = useState('Berachos 2a');
  const [message, setMessage] = useState("Let's start the Mishnah.");
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [tier, setTier] = useState<Tier>('middle');
  const [picked, setPicked] = useState<string[]>(STYLES.map((s) => s.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [meta, setMeta] = useState('');

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s.provider) setProvider(s.provider);
      if (s.tier) setTier(s.tier);
      if (s.theme) document.documentElement.dataset.look = s.theme;
    }).catch(() => {});
  }, []);

  async function run() {
    setBusy(true); setError(''); setResults([]); setMeta('');
    try {
      const res = await fetch('/api/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, message, provider, tier, styles: picked }) });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setResults(d.results);
      const total = d.results.reduce((a: number, r: Result) => a + (r.usd ?? 0), 0);
      setMeta(`${d.ref ?? 'No source'} · ${d.model} · total $${total.toFixed(3)}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="lab">
      <header className="lab-head">
        <a href="/" className="brand" style={{ textDecoration: 'none' }}>חברותא</a>
        <h1>Style lab</h1>
      </header>
      <p className="muted lab-intro">Run the same source and learner message through each learning style, and compare the replies side by side. Nothing is saved to your sessions. Each style is one AI call.</p>

      <div className="lab-form">
        <div className="field"><label htmlFor="lab-src">Source</label><input id="lab-src" type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Berachos 2a" /></div>
        <div className="field"><label htmlFor="lab-msg">What the learner says</label><input id="lab-msg" type="text" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div className="field"><label htmlFor="lab-model">Model</label>
          <select id="lab-model" value={`${provider}:${tier}`} onChange={(e) => { const [p, t] = e.target.value.split(':'); setProvider(p as Provider); setTier(t as Tier); }}>
            {(['anthropic', 'openai'] as Provider[]).flatMap((p) => (['basic', 'middle', 'top'] as Tier[]).map((t) => (
              <option key={`${p}:${t}`} value={`${p}:${t}`}>{TIER_LABELS[t]} · {MODELS[p][t].label}</option>
            )))}
          </select>
        </div>
        <div className="lab-styles">
          {STYLES.map((s) => (
            <label key={s.id} className="lab-check">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} />
              {s.name}
            </label>
          ))}
        </div>
        <button className="btn primary" onClick={run} disabled={busy || !picked.length}>{busy ? `Running ${picked.length} styles…` : `Compare ${picked.length} styles`}</button>
        {error && <div className="error">{error}</div>}
        {meta && <div className="muted" style={{ fontSize: 13 }}>{meta}</div>}
      </div>

      <div className="lab-grid">
        {results.map((r) => (
          <section key={r.style} className="lab-card">
            <h2>{r.name ?? r.style}</h2>
            {r.error ? <div className="error">{r.error}</div> : (
              <>
                <div className="say"><Formatted text={r.text ?? ''} /></div>
                <div className="lab-stats">{r.words} words · {r.seconds?.toFixed(1)}s · ${r.usd?.toFixed(4)}</div>
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
