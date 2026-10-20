'use client';
import { useEffect, useState } from 'react';
import { LIVE_VOICES, MODELS, Provider, Settings, STYLES, Tier, TIER_LABELS, VOICES } from '@/lib/config';
import type { Memory } from '@/lib/db';
import { LookPicker } from './Modals';

interface Props { settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void; onHelp: () => void }

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}

export default function SettingsDrawer({ settings: s, onChange, onClose, onHelp }: Props) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [newMem, setNewMem] = useState('');
  const [costs, setCosts] = useState<{ totalUsd: number; byModel: Record<string, { exchanges: number; usd: number }> } | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetch('/api/memory').then((r) => r.json()).then((d) => {
      setMemories(Array.isArray(d) ? d : []);
      if (d?.error) setLoadError(d.error);
    }).catch((e) => { setMemories([]); setLoadError(String(e)); });
    fetch('/api/costs').then((r) => r.json()).then((d) => {
      if (d && d.byModel && typeof d.totalUsd === 'number') setCosts(d);
      else { setCosts({ totalUsd: 0, byModel: {} }); if (d?.error) setLoadError(d.error); }
    }).catch((e) => { setCosts({ totalUsd: 0, byModel: {} }); setLoadError(String(e)); });
  }, []);

  async function removeMem(id: string) {
    await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
    setMemories((m) => (m ?? []).filter((x) => x.id !== id));
  }
  async function addMem() {
    if (!newMem.trim()) return;
    const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'instruction', content: newMem.trim() }) });
    const m = await res.json();
    if (m.id) setMemories((list) => [...(list ?? []), m]);
    setNewMem('');
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer right" role="dialog" aria-label="Settings">
        <div className="drawer-head"><h2>Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="drawer-body">
          {loadError && <div className="error">Could not reach the database: {loadError}</div>}
          <div className="section">
            <h3>Learning style</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Or just tell your chavrusa: “be gentler,” “quiz me,” “go deeper.” <a href="#" onClick={(e) => { e.preventDefault(); onHelp(); }}>What can I ask for?</a></p>
            <div className="style-list">
              {STYLES.map((st) => (
                <button key={st.id} className={`style-opt ${s.style === st.id ? 'on' : ''}`} onClick={() => onChange({ style: st.id, blend: null })}>
                  <b>{st.name}</b><span>{st.blurb}</span>
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Who explains first</label>
              <Seg value={s.leads} options={[['learner', 'I do'], ['chavrusa', 'Chavrusa does']]} onPick={(v) => onChange({ leads: v })} />
            </div>
            <div className="field">
              <label>Nusach and pronunciation</label>
              <Seg value={s.nusach} options={[['ashkenaz', 'Ashkenaz'], ['sephardi', 'Sephardi']]} onPick={(v) => onChange({ nusach: v })} />
            </div>
          </div>

          <div className="section">
            <h3>Depth and AI model</h3>
            <div className="field">
              <label>Company</label>
              <Seg<Provider> value={s.provider} options={[['anthropic', 'Claude'], ['openai', 'OpenAI']]} onPick={(v) => onChange({ provider: v })} />
            </div>
            <div className="field">
              <label>Depth</label>
              <Seg<Tier> value={s.tier} options={(['basic', 'middle', 'top'] as Tier[]).map((t) => [t, TIER_LABELS[t]])} onPick={(v) => onChange({ tier: v })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Using {MODELS[s.provider][s.tier].label} · about ${MODELS[s.provider][s.tier].inputPerM}/${MODELS[s.provider][s.tier].outputPerM} per million tokens in/out
              </div>
            </div>
            <div className="field">
              <label>Quick replies (“OK,” “got it,” “thanks”)</label>
              <Seg value={s.quickReplies ? 'cheap' : 'full'} options={[['cheap', 'Use the cheaper model'], ['full', 'Always use my chosen depth']]} onPick={(v) => onChange({ quickReplies: v === 'cheap' })} />
            </div>
            <div className="field">
              <label>Warn me when a session costs more than (USD, blank for never)</label>
              <input type="number" min={0} step={0.1} value={s.costWarnUsd ?? ''} onChange={(e) => onChange({ costWarnUsd: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>

          <div className="section">
            <h3>Display</h3>
            <div className="field">
              <label>Look</label>
              <LookPicker value={s.theme} onPick={(v) => onChange({ theme: v })} />
            </div>
            <div className="field">
              <label>Source text</label>
              <Seg value={s.display} options={[['toggle', 'With translation'], ['original', 'Original only'], ['off', 'Off (verbal)']]} onPick={(v) => onChange({ display: v })} />
            </div>
            <div className="field">
              <label>Nikud</label>
              <Seg value={s.nikud ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ nikud: v === 'on' })} />
            </div>
            <div className="field">
              <label>Hebrew text size</label>
              <div className="range"><input type="range" min={16} max={36} value={s.heSize} onChange={(e) => onChange({ heSize: Number(e.target.value) })} /><span className="he" style={{ fontSize: s.heSize }}>אבג</span></div>
            </div>
            <div className="field">
              <label>English text size</label>
              <div className="range"><input type="range" min={13} max={24} value={s.enSize} onChange={(e) => onChange({ enSize: Number(e.target.value) })} /><span style={{ fontSize: s.enSize }}>Abc</span></div>
            </div>
          </div>

          <div className="section">
            <h3>Voice</h3>
            <div className="field">
              <label>Talk mode</label>
              <Seg value={s.talkMode} options={[['live', 'Live (most natural)'], ['basic', 'Basic (cheapest)']]} onPick={(v) => onChange({ talkMode: v })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {s.talkMode === 'live'
                  ? 'Live: natural voice that answers almost instantly and can be interrupted. About $0.05 per minute for the voice, plus the AI model.'
                  : 'Basic: step-by-step voice. Slower and less natural, but costs only a few cents per hour for the voice.'}
              </div>
            </div>
            {s.talkMode === 'live' && (
              <div className="field">
                <label htmlFor="live-voice-pick">Live voice</label>
                <select id="live-voice-pick" value={s.liveVoice} onChange={(e) => onChange({ liveVoice: e.target.value })}>
                  {LIVE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A new voice applies the next time you tap Talk.</div>
              </div>
            )}
            {s.talkMode === 'live' && (
              <div className="field">
                <label htmlFor="live-idle">Pause the call when it’s quiet for (saves cost)</label>
                <select id="live-idle" value={String(s.liveIdleSec)} onChange={(e) => onChange({ liveIdleSec: Number(e.target.value) })}>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="120">2 minutes</option>
                  <option value="300">5 minutes</option>
                  <option value="0">Never pause</option>
                </select>
              </div>
            )}
            {s.talkMode === 'live' && s.liveIdleSec > 0 && (
              <div className="field">
                <label>When paused</label>
                <Seg value={s.liveWake ? 'wake' : 'tap'} options={[['wake', 'Start talking to resume'], ['tap', 'Tap Resume']]} onPick={(v) => onChange({ liveWake: v === 'wake' })} />
                {s.liveWake && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your first second or two may be missed while it reconnects. While paused, the microphone listens only on your device; nothing is sent until you speak.</div>}
              </div>
            )}
            <div className="field">
              <label htmlFor="voice-pick">Basic voice (also used for Listen)</label>
              <select id="voice-pick" value={s.voice} onChange={(e) => onChange({ voice: e.target.value })}>
                {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Read every reply aloud</label>
              <Seg value={s.autoSpeak ? 'on' : 'off'} options={[['off', 'Only when I tap Listen or Talk'], ['on', 'Always']]} onPick={(v) => onChange({ autoSpeak: v === 'on' })} />
            </div>
            <div className="field">
              <label>Speaking speed</label>
              <div className="range"><input type="range" min={0.8} max={1.3} step={0.05} value={s.speechRate} onChange={(e) => onChange({ speechRate: Number(e.target.value) })} /><span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.speechRate.toFixed(2)}×</span></div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Tap <b>Talk</b> at the top for a hands-free conversation: speak, pause, and your chavrusa answers out loud.</p>
          </div>

          <div className="section">
            <h3>What your chavrusa remembers</h3>
            {memories === null && <div className="muted">Loading…</div>}
            {memories?.length === 0 && <div className="muted" style={{ fontSize: 14 }}>Nothing yet. Tell your chavrusa how you like to learn and it will remember.</div>}
            {memories?.map((m) => (
              <div className="mem" key={m.id}>
                <div><div className="kind">{m.kind}{m.scope ? ` · ${m.scope}` : ''}</div>{m.content}</div>
                <button className="x" onClick={() => removeMem(m.id)} aria-label="Forget">×</button>
              </div>
            ))}
            <div className="field" style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Add an instruction, e.g. Don't translate Rashi" value={newMem} onChange={(e) => setNewMem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMem()} />
              <button className="btn" onClick={addMem}>Add</button>
            </div>
          </div>

          <div className="section">
            <h3>Cost, last 30 days</h3>
            {!costs && <div className="muted">Loading…</div>}
            {costs && (
              <table className="costs">
                <thead><tr><th>Model</th><th className="n">Exchanges</th><th className="n">USD</th></tr></thead>
                <tbody>
                  {Object.entries(costs.byModel).map(([k, v]) => <tr key={k}><td>{k}</td><td className="n">{v.exchanges}</td><td className="n">${v.usd.toFixed(3)}</td></tr>)}
                  <tr><td><b>Total</b></td><td /><td className="n"><b>${costs.totalUsd.toFixed(2)}</b></td></tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="section">
            <h3>About</h3>
            <p className="muted" style={{ fontSize: 13 }}>This is an AI learning tool. It can make mistakes. Do not rely on it for accuracy in Torah learning, halacha, or hashkafa. For practical questions, ask your rav.</p>
            <button className="btn" onClick={() => { window.location.href = '/api/logout'; }}>Log out</button>
          </div>
        </div>
      </div>
    </>
  );
}
