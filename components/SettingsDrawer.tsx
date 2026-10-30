'use client';
import { useEffect, useState } from 'react';
import { CustomStyle, DEFAULT_VOICE_DESIGN, FONTS_EN, FONTS_HE, LIVE_VOICES, MODELS, Provider, Settings, STYLES, Tier, TIER_LABELS } from '@/lib/config';
import type { Memory } from '@/lib/db';
import { LookPicker } from './Modals';
import { VoicePicker } from './VoicePicker';
import GeminiSample from './GeminiSample';
import GeminiPronunciation from './GeminiPronunciation';
import GptPronunciation from './GptPronunciation';

interface Props {
  settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void; onHelp: () => void; liveActive?: boolean;
  // The new main screen splits this in two: 'themes' (look, fonts, sizes) and 'settings' (everything else), each a full page.
  part?: 'all' | 'themes' | 'settings';
  asPage?: boolean;
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}

export default function SettingsDrawer({ settings: s, onChange, onClose, onHelp, liveActive, part = 'all', asPage = false }: Props) {
  const themes = part !== 'settings', rest = part !== 'themes';
  const [editing, setEditing] = useState<CustomStyle | null>(null);
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
      {!asPage && <div className="scrim" onClick={onClose} />}
      <div className={asPage ? 'settings-page' : 'drawer right'} role={asPage ? undefined : 'dialog'} aria-label="Settings">
        {!asPage && <div className="drawer-head"><h2>Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>}
        <div className={asPage ? '' : 'drawer-body'}>
          {rest && <>
          {loadError && <div className="error">Could not reach the database: {loadError}</div>}
          <div className="section">
            <h3>Learning style</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Or just tell your chavrusa: “be gentler,” “quiz me,” “go deeper.” <a href="/guide">How we learn</a> · <a href="#" onClick={(e) => { e.preventDefault(); onHelp(); }}>What can I ask for?</a> · <a href="/lab">Compare styles</a></p>
            <div className="style-list">
              {STYLES.map((st) => (
                <button key={st.id} className={`style-opt ${s.style === st.id ? 'on' : ''}`} onClick={() => onChange({ style: st.id, blend: null })}>
                  <b>{st.name}</b><span>{st.blurb}</span>
                </button>
              ))}
              {(s.customStyles ?? []).map((c) => (
                <div key={c.id} className={`style-opt custom ${s.style === c.id ? 'on' : ''}`}>
                  <button className="style-pick" onClick={() => onChange({ style: c.id, blend: null })}>
                    <b>{c.name}</b><span>{c.blurb || 'Your own style'}</span>
                  </button>
                  <span className="style-acts">
                    <button onClick={() => setEditing(c)}>Edit</button>
                    <button onClick={() => onChange({ customStyles: (s.customStyles ?? []).filter((x) => x.id !== c.id), ...(s.style === c.id ? { style: STYLES[0].id } : {}) })}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
            {editing ? (
              <StyleMaker key={editing.id || 'new'} start={editing} onCancel={() => setEditing(null)} onSave={(c) => {
                const list = s.customStyles ?? [];
                const next = list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
                onChange({ customStyles: next, style: c.id, blend: null });
                setEditing(null);
              }} />
            ) : (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => setEditing({ id: '', name: '', blurb: '', behavior: '' })}>+ Create your own style</button>
            )}
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
              <label>Saver (typing and talking)</label>
              <Seg value={s.saver !== false ? 'saver' : 'full'} options={[['saver', 'Saver'], ['full', 'Full depth every turn']]} onPick={(v) => onChange({ saver: v === 'saver' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {s.saver !== false
                  ? `Saver: everyday turns, typed or spoken, use ${MODELS[s.provider][s.tier === 'basic' ? 'basic' : 'middle'].label}. Say or type “go deeper” or “explain it fully” and ${MODELS[s.provider][s.tier].label} takes over for the next few turns. Calls pause after 15 quiet seconds.`

                  : `Every turn uses ${MODELS[s.provider][s.tier].label}.`}
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

          </>}
          {themes && (
          <div className="section">
            <h3>{asPage ? 'Look' : 'Look and text'}</h3>
            <div className="field">
              <label>Lines between lines</label>
              <Seg value={s.lineRules ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ lineRules: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A thin line between each line of the text, with its Hebrew and English kept together above it. Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Show commentaries</label>
              <Seg value={s.autoComms ? 'on' : 'off'} options={[['off', 'When I tap a line'], ['on', 'Under every line']]} onPick={(v) => onChange({ autoComms: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Rashi, Tosafos and the other commentaries&apos; buttons under every line, without tapping it first. Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Look</label>
              <LookPicker value={s.theme} onPick={(v) => onChange({ theme: v })} />
            </div>
            <div className="field">
              <label>English font for this look</label>
              <FontPicker list={FONTS_EN} sample="Let's learn the Gemara together" value={s.fonts?.[s.theme]?.en ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), en: id } } })} />
              <label style={{ marginTop: 10 }}>Hebrew font for this look</label>
              <FontPicker list={FONTS_HE} sample="בְּרֵאשִׁית בָּרָא אֱלֹקִים" rtl value={s.fonts?.[s.theme]?.he ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), he: id } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Each look remembers its own fonts. Rashi and Tosafos keep the Rashi script.</div>
            </div>
            <div className="field">
              <label>In the English: the translation and the added explanation</label>
              <Seg value={s.enMark ?? 'plain'} options={[['plain', 'Plain'], ['soft', 'Softer'], ['light', 'Lighter'], ['italic', 'Italics']]} onPick={(v) => onChange({ enMark: v as 'plain' | 'soft' | 'light' | 'italic' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sefaria&apos;s English mixes the word-for-word translation with words it adds to explain. Plain: all alike. Softer: the explanation in light grey. Lighter: just a shade lighter. Italics: the explanation in italics.</div>
            </div>
            <div className="field">
              <label>Rashi, Tosafos and other commentaries</label>
              <Seg value={s.rashiScript ? 'rashi' : 'regular'} options={[['regular', 'Regular letters'], ['rashi', 'Rashi script']]} onPick={(v) => onChange({ rashiScript: v === 'rashi' })} />
            </div>
            <div className="field">
              <label>Hebrew text size</label>
              <div className="range"><input type="range" min={16} max={36} value={s.heSize} onChange={(e) => onChange({ heSize: Number(e.target.value) })} /><span className="he" style={{ fontSize: s.heSize }}>אבג</span></div>
            </div>
            <div className="field">
              <label>Commentary text size (Rashi, Tosafos…)</label>
              <div className="range"><input type="range" min={14} max={36} value={s.commSize ?? 20} onChange={(e) => onChange({ commSize: Number(e.target.value) })} /><span className="he rashi" style={{ fontSize: s.commSize ?? 20 }}>אבג</span></div>
            </div>
            <div className="field">
              <label>English text size</label>
              <div className="range"><input type="range" min={13} max={24} value={s.enSize} onChange={(e) => onChange({ enSize: Number(e.target.value) })} /><span style={{ fontSize: s.enSize }}>Abc</span></div>
            </div>
          </div>
          )}
          {rest && (
          <div className="section">
            <h3>Text and display</h3>
            <div className="field">
              <label>Screen during voice conversations</label>
              <Seg value={s.blankCall ? 'blank' : 'show'} options={[['show', 'Show the conversation'], ['blank', 'Blank (voice only)']]} onPick={(v) => onChange({ blankCall: v === 'blank' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Blank keeps the screen empty while you talk, for focus. It doesn't change the cost. Everything is still saved, so you can read it after the call.</div>
            </div>
            <div className="field">
              <label>Source text</label>
              <Seg value={s.display} options={[['toggle', 'With translation'], ['original', 'Original only'], ['off', 'Off (verbal)']]} onPick={(v) => onChange({ display: v })} />
            </div>
            <div className="field">
              <label>English translation under the Gemara</label>
              <Seg value={s.seferEnglish !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ seferEnglish: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sefaria&apos;s English under each line of the text. Also in the ⋯ menu as “Translation”.</div>
            </div>
            <div className="field">
              <label>Onkelos (Chumash)</label>
              <Seg value={s.onkelos ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ onkelos: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Onkelos under each pasuk, with its English when Sefaria has one. Straight from Sefaria, no AI, free. Also in Quiet chat&apos;s ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Amud intro (a paragraph on what&apos;s coming, at the top of each amud)</label>
              <Seg value={s.amudIntro !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ amudIntro: v === 'on' })} />
              <label style={{ marginTop: 10 }}>Voice says the intro (Read, Explain, Ask)</label>
              <Seg value={s.introVoice !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ introVoice: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The AI writes each amud&apos;s intro once (about 1–2 cents the first time), then it&apos;s kept, free. In Read, Explain, Ask the voice says it when a new amud begins, once per session.</div>
            </div>
            <div className="field">
              <label>Steps (a one-line summary above each move)</label>
              <Seg value={s.outline ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ outline: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The AI summarizes each step of an amud or perek once (about 1–2 cents the first time), then it's kept, free.</div>
            </div>
            <div className="field">
              <label>Commentary summaries (Rashi, Tosafos, Bartenura… in short English)</label>
              <Seg value={s.commSummary ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ commSummary: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>When you open a commentary, a sentence or two under each comment saying what it explains or asks (not a literal translation). Made once per commentator per amud (about 1–2 cents), then kept, free. Only for commentaries you open.</div>
            </div>
            <div className="field">
              <label>Seforim from Sefaria</label>
              <Seg value={s.approveAll ? 'all' : 'approved'} options={[['all', 'Allow all'], ['approved', 'Classic and approved only']]} onPick={(v) => onChange({ approveAll: v === 'all' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>“Classic and approved only” allows works before 1900 and ones you approved. Either way, the Chavrusa speaks only from an Orthodox perspective.</div>
            </div>
            <div className="field">
              <label>Nikud</label>
              <Seg value={s.nikud ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ nikud: v === 'on' })} />
            </div>
          </div>
          )}

          {rest && <>
          <div className="section">
            <h3>Voice</h3>
            <div className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Live voice: natural, answers almost instantly, and can be interrupted. About $0.05 per minute for the voice, plus the AI model.</div>
            {(
              <div className="field">
                <label>Live voice (tap ▶ to hear it; a sample costs about 1 cent)</label>
                <VoicePicker kind="live" voices={[...(s.customVoices ?? []).map((v) => ({ id: v.id, name: `${v.name} (your design)` })), ...LIVE_VOICES]} value={s.liveVoice} onPick={(v) => onChange({ liveVoice: v })} disabled={liveActive} />
                <VoiceDesigner onCreated={(p) => onChange(p)} hasCustom={(s.customVoices ?? []).length > 0} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A new voice applies the next time you tap Talk.</div>
              </div>
            )}
            <div className="field">
              <label>Steady mode (the voice sticks to your style and instructions)</label>
              <Seg value={s.liveSteady !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveSteady: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.liveSteady !== false
                ? 'On: every learning turn (reading, explaining, kashyos, your answers, your instructions) goes through the brain, which follows your style closely; the voice says its words as given. About 1–3 seconds more before an answer, and about 1–3¢ a turn for the brain.'
                : 'Off: the voice answers quick learning turns itself. A little faster and cheaper, but it follows your style and instructions loosely.'}</div>
            </div>
            <div className="field">
              <label>Standard pronunciations</label>
              <Seg value={s.houseSay !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ houseSay: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>On: one fixed way to say the common words, from the app&apos;s yeshivish rules: Tosafos = TOSS-fos, Gemara = g&apos;MOH-rah, Mishnah = MISH-nah, Rashi = RAH-shee, kashya = KOSH-ya, machlokes = mach-LOI-kes, halacha = ha-LOH-cha, Torah = TOI-rah, Moshe = MOI-sheh, Shabbos = SHAH-bos, and more. Your own “say it my way” words win over these.</div>
            </div>
            <GptPronunciation s={s} onChange={onChange} disabled={liveActive} />
            <div className="field">
              <label>Live voice for calls</label>
              <Seg value={s.liveEngine === 'gemini' ? 'gemini' : 'gpt'} options={[['gpt', 'GPT-Live (current)'], ['gemini', 'Gemini Live (test)']]} onPick={(v) => onChange({ liveEngine: v as 'gpt' | 'gemini' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.liveEngine === 'gemini'
                ? 'Gemini Live (Google), a test: about 1–2¢ a minute for the voice, plus the AI model for learning turns. Applies the next time you tap Talk; switch back any time.'
                : 'GPT-Live (OpenAI): about 5¢ a minute for the voice, plus the AI model for learning turns. Gemini Live is cheaper; try it side by side.'}</div>
            </div>
            <GeminiSample value={s.geminiVoice} onPick={(v) => onChange({ geminiVoice: v })} />
            <GeminiPronunciation s={s} onChange={onChange} />
            {(
              <div className="field">
                <label>Speaking speed</label>
                <Seg value={s.livePace ?? 'natural'} options={[['relaxed', 'Relaxed'], ['natural', 'Normal'], ['brisk', 'Brisk']]} onPick={(v) => onChange({ livePace: v })} />
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>Applies the next time you tap Talk. In a call you can also just say “speak faster.”</div>
                <label htmlFor="live-idle">Pause the call when it’s quiet for (saves cost)</label>
                <select id="live-idle" value={String(s.liveIdleSec)} onChange={(e) => onChange({ liveIdleSec: Number(e.target.value) })}>
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="120">2 minutes</option>
                  <option value="300">5 minutes</option>
                  <option value="0">Never pause</option>
                </select>
                {s.saver !== false && s.liveIdleSec > 15 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Saver is on, so the call pauses after 15 quiet seconds.</div>}
              </div>
            )}
            {s.liveIdleSec > 0 && (
              <div className="field">
                <label>When paused</label>
                <Seg value={s.liveWake ? 'wake' : 'tap'} options={[['wake', 'Start talking to resume'], ['tap', 'Tap Resume']]} onPick={(v) => onChange({ liveWake: v === 'wake' })} />
                {s.liveWake && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your first second or two may be missed while it reconnects. While paused, the microphone listens only on your device; nothing is sent until you speak.</div>}
              </div>
            )}
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
          </>}
        </div>
      </div>
    </>
  );
}

// Design a Live voice from a description (OpenAI creates it in your account).
// Fonts, each shown in its own letters: the current one, and a list to choose from when tapped.
function FontPicker({ list, sample, value, onPick, rtl }: { list: { id: string; name: string; stack: string }[]; sample: string; value: string; onPick: (id: string) => void; rtl?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = list.find((f) => f.id === value) ?? list[0];
  const row = (f: { id: string; name: string; stack: string }) => (
    <>
      <span className="fp-sample" dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: f.stack || (rtl ? 'var(--f-he)' : 'var(--f-body)') }}>{sample}</span>
      <span className="fp-name">{f.name}</span>
    </>
  );
  return (
    <div className="fp">
      <button className="fp-cur" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{row(cur)}<span className="fp-arrow" aria-hidden="true">{open ? '▴' : '▾'}</span></button>
      {open && (
        <div className="fp-list" role="listbox">
          {list.map((f) => (
            <button key={f.id || 'own'} role="option" aria-selected={f.id === value} className={`fp-opt ${f.id === value ? 'on' : ''}`} onClick={() => { onPick(f.id); setOpen(false); }}>{row(f)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Create or edit a learning style in your own words. Free: it's saved as you wrote it, no AI.
function StyleMaker({ start, onSave, onCancel }: { start: CustomStyle; onSave: (c: CustomStyle) => void; onCancel: () => void }) {
  const [name, setName] = useState(start.name);
  const [blurb, setBlurb] = useState(start.blurb);
  const [behavior, setBehavior] = useState(start.behavior);
  const ok = name.trim() && behavior.trim();
  return (
    <div className="style-maker">
      <div className="field"><label htmlFor="sm-name">Name</label><input id="sm-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shiur style" /></div>
      <div className="field"><label htmlFor="sm-blurb">Short description (optional)</label><input id="sm-blurb" type="text" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="e.g. Reads it all, then one big question" /></div>
      <div className="field">
        <label htmlFor="sm-how">How should your chavrusa learn with you?</label>
        <textarea id="sm-how" rows={7} value={behavior} onChange={(e) => setBehavior(e.target.value)}
          placeholder={'In your own words. For example:\nRead the whole piece of Gemara first, Hebrew and English phrase by phrase. Don\'t stop to explain in the middle. When the piece is done, tell me in two sentences what the Gemara said, then ask me one hard question. If I get it wrong, give me a hint before the answer.'} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your words become the style's rules. Where they differ from the basic formula, yours win.</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" disabled={!ok} onClick={() => onSave({ id: start.id || `custom-${Date.now().toString(36)}`, name: name.trim(), blurb: blurb.trim(), behavior: behavior.trim() })}>{start.id ? 'Save changes' : 'Save and use it'}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function VoiceDesigner({ onCreated, hasCustom }: { onCreated: (p: Partial<Settings>) => void; hasCustom: boolean }) {
  const [open, setOpen] = useState(!hasCustom);
  const [name, setName] = useState(DEFAULT_VOICE_DESIGN.name);
  const [prompt, setPrompt] = useState(DEFAULT_VOICE_DESIGN.prompt);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function create() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/live/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, prompt, script: DEFAULT_VOICE_DESIGN.script }) });
      const d = await res.json();
      if (d.error) { setMsg(d.error); return; }
      onCreated({ customVoices: d.settings.customVoices, liveVoice: d.voice.id });
      setMsg(`Created "${d.voice.name}" and selected it. Tap ▶ Hear to try it.`);
      setOpen(false);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!open) return (
    <div style={{ marginTop: 8 }}>
      <button className="btn" onClick={() => setOpen(true)}>Redesign Rebbi or design another voice</button>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
  return (
    <div className="designer">
      <div className="field"><label htmlFor="vd-name">Design a voice: name</label><input id="vd-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field">
        <label htmlFor="vd-prompt">Describe how it should sound</label>
        <textarea id="vd-prompt" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Describe qualities (age, accent, pace, tone), not a real person. Works with Live only. A new voice with the same name replaces the old one.</div>
      <button className="btn primary" onClick={create} disabled={busy || prompt.trim().length < 20}>{busy ? 'Creating…' : 'Create voice'}</button>
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
