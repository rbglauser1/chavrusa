'use client';
import { useEffect, useState } from 'react';
import { COLOR_DEFAULTS, COLOR_IDS, COLOR_PARTS, colorOf, CustomStyle, DEFAULT_VOICE_DESIGN, FONTS_COMM, FONTS_EN, FONTS_HE, LIVE_VOICES, MODELS, Provider, Settings, STYLES, styleById, Tier, TIER_LABELS } from '@/lib/config';
import type { Memory } from '@/lib/db';
import { LookPicker } from './Modals';
import { VoicePicker } from './VoicePicker';
import GeminiSample from './GeminiSample';
import GeminiPronunciation from './GeminiPronunciation';
import CallLogs from './CallLogs';
import HebrewLab from './HebrewLab';
import GptPronunciation from './GptPronunciation';
import { Group, GroupList } from './SettingsGroup';

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
        <div className={asPage ? 'sg-page' : 'drawer-body'}>
          <GroupList id="settings">
          {rest && <>
          {loadError && <div className="error">Could not reach the database: {loadError}</div>}
          <Group id="style" title="Learning style" hint={`${styleById(s.style, s.customStyles).name} · ${s.leads === 'learner' ? 'you explain first' : 'chavrusa explains first'} · ${s.nusach === 'sephardi' ? 'Sephardi' : 'Ashkenaz'}`}>
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
          </Group>

          <Group id="ai" title="Depth, AI and cost" hint={`${MODELS[s.provider][s.tier].label}${s.saver !== false ? ' · Saver' : ''}`}>
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
            <Group id="ai-cost" level={2} title="Cost, last 30 days" hint={costs ? `$${costs.totalUsd.toFixed(2)}` : undefined}>
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
          </Group>
          </Group>

          </>}
          {themes && (
          <Group id="look" title={asPage ? 'Look' : 'Look and text'} hint="Look, fonts, colors, sizes, commentaries" flat={part === 'themes'}>
            <Group id="look-look" level={2} title="Look and fonts">
            <div className="field">
              <label>Look</label>
              <LookPicker value={s.theme} onPick={(v) => onChange({ theme: v })} />
            </div>
            <div className="field">
              <label>English font for this look</label>
              <FontPicker list={FONTS_EN} sample="Let's learn the Gemara together" value={s.fonts?.[s.theme]?.en ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), en: id } } })} />
              <label style={{ marginTop: 10 }}>Hebrew font for this look</label>
              <FontPicker list={FONTS_HE} sample="בְּרֵאשִׁית בָּרָא אֱלֹקִים" rtl value={s.fonts?.[s.theme]?.he ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), he: id } } })} />
              <label style={{ marginTop: 10 }}>Hebrew font for the commentaries</label>
              <FontPicker list={FONTS_COMM} sample="וַיִּהְיוּ חַיֵּי שָׂרָה – לכך נכתב שנה" rtl value={s.fonts?.[s.theme]?.comm || (s.rashiScript ? 'rashi' : 'same')} onPick={(id) => onChange({ rashiScript: id === 'rashi', fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), comm: id } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Each look remembers its own fonts. The commentaries&apos; font is for Rashi, Tosafos and all the meforshim.</div>
            </div>
            </Group>
            <Group id="look-colors" level={2} title="Colors and bold">
            <div className="field">
              <label>Colors and bold</label>
              {COLOR_PARTS.map((part) => {
                const cur = colorOf(s, part.id);
                return (
                  <div key={part.id} className="color-row" role="radiogroup" aria-label={`${part.name} color`}>
                    <span className="color-name">{part.name}<small>{COLOR_IDS.find((c) => c.id === cur)?.name}</small></span>
                    <button className={`bold-btn ${s.bold?.[part.id] ? 'on' : ''}`} aria-pressed={!!s.bold?.[part.id]} aria-label={`${part.name} bold`} title="Bold"
                      onClick={() => onChange({ bold: { ...(s.bold ?? {}), [part.id]: !s.bold?.[part.id] } })}>B</button>
                    {COLOR_IDS.map((c) => (
                      <button key={c.id} role="radio" aria-checked={cur === c.id} aria-label={c.name} title={c.name}
                        className={`color-dot ${c.id === 'ink' ? 'swatch-ink' : ''} ${cur === c.id ? 'on' : ''}`}
                        style={c.id === 'ink' ? undefined : { background: `var(--hue-${c.id})` }}
                        onClick={() => onChange({ colors: { ...COLOR_DEFAULTS, ...(s.colors ?? {}), [part.id]: c.id } })} />
                    ))}
                  </div>
                );
              })}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Meforshim includes their translation and summaries, and Onkelos. The first circle is the text&apos;s own color. <b>B</b> makes that part bold.</div>
            </div>
            </Group>
            <Group id="look-sizes" level={2} title="Text sizes" hint={`Hebrew ${s.heSize}${(s.heSpacing ?? 'normal') !== 'normal' ? ` (${s.heSpacing})` : ''} · Rashi ${s.commSize ?? 20} · English ${s.enSize}`}>
            <div className="field">
              <label>Hebrew text size</label>
              <div className="range"><input type="range" min={16} max={36} value={s.heSize} onChange={(e) => onChange({ heSize: Number(e.target.value) })} /><span className="he" style={{ fontSize: s.heSize }}>אבג</span></div>
            </div>
            <div className="field">
              <label>Hebrew spacing</label>
              <Seg value={s.heSpacing ?? 'normal'} options={[['normal', 'Normal'], ['close', 'Close'], ['closer', 'Closer']]} onPick={(v) => onChange({ heSpacing: v as 'normal' | 'close' | 'closer' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>How tightly the Hebrew is set: the lines and the words closer together, more like a printed sefer. Rashi and the meforshim too.</div>
            </div>
            <div className="field">
              <label>Commentary text size (Rashi, Tosafos…)</label>
              <div className="range"><input type="range" min={14} max={36} value={s.commSize ?? 20} onChange={(e) => onChange({ commSize: Number(e.target.value) })} /><span className="he rashi" style={{ fontSize: s.commSize ?? 20 }}>אבג</span></div>
            </div>
            <div className="field">
              <label>English text size</label>
              <div className="range"><input type="range" min={13} max={24} value={s.enSize} onChange={(e) => onChange({ enSize: Number(e.target.value) })} /><span style={{ fontSize: s.enSize }}>Abc</span></div>
            </div>
            </Group>
            <Group id="look-comms" level={2} title="Commentaries on the page" hint={`${s.autoComms ? 'under every line' : 'when I tap a line'}${s.autoRashi ? ' · Rashi open' : ''}${s.autoTosfos ? ' · Tosafos open' : ''}${s.rashiScript ? ' · Rashi script' : ''}`}>
            <div className="field">
              <label>Show commentaries</label>
              <Seg value={s.autoComms ? 'on' : 'off'} options={[['off', 'When I tap a line'], ['on', 'Under every line']]} onPick={(v) => onChange({ autoComms: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Rashi, Tosafos and the other commentaries&apos; buttons under every line, without tapping it first. Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Rashi open on every line</label>
              <Seg value={s.autoRashi ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ autoRashi: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Rashi&apos;s words open by themselves under each line that has a Rashi, on Gemara and Chumash (on Mishnayos, the Bartenura). Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Tosafos open on every line</label>
              <Seg value={s.autoTosfos ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ autoTosfos: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>On the Gemara, Tosafos opens by itself under each line that has a Tosafos (after Rashi, if Rashi is on too). Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>Rashi, Tosafos and other commentaries</label>
              <Seg value={s.rashiScript ? 'rashi' : 'regular'} options={[['regular', 'Regular letters'], ['rashi', 'Rashi script']]} onPick={(v) => onChange({ rashiScript: v === 'rashi', fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), comm: v === 'rashi' ? 'rashi' : 'same' } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Any other font: Look and fonts → Hebrew font for the commentaries.</div>
            </div>
            </Group>
            <Group id="look-lines" level={2} title="Lines and the English">
            <div className="field">
              <label>Lines between lines</label>
              <Seg value={s.lineRules ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ lineRules: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A thin line between each line of the text, with its Hebrew and English kept together above it. Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>English layout</label>
              <Seg value={s.interlinear ? 'phrase' : 'line'} options={[['line', 'Under the line'], ['phrase', 'Phrase by phrase']]} onPick={(v) => onChange({ interlinear: v === 'phrase' })} />
              {s.interlinear && <>
                <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Under each phrase:</div>
                <Seg value={s.ilEn ?? (s.enMark === 'only' ? 'only' : 'full')} options={[['full', 'Sefaria’s full English'], ['only', 'Only the translation']]} onPick={(v) => onChange({ ilEn: v as 'full' | 'only' })} />
              </>}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Phrase by phrase: each line is cut into short Hebrew phrases, each with its English right under it. On the Gemara it&apos;s lined up by Sefaria&apos;s word-for-word translation, so it&apos;s exact. In Chumash and Tanach each pasuk is cut at its trop (etnachta, zakef…), and in the Mishnah and other seforim at the punctuation; there the English is matched by length, so now and then a word lands one phrase off. A line that can&apos;t be lined up is shown the usual way. Also on the Mikraos Gedolos page, when its English is on.</div>
            </div>
            <div className="field">
              <label>The word-for-word translation in bold</label>
              <Seg value={s.enBold === false ? 'off' : 'on'} options={[['on', 'Bold'], ['off', 'Not bold']]} onPick={(v) => onChange({ enBold: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>As on Sefaria: the words that translate the Gemara in bold, the words Sefaria adds to explain in regular type.</div>
            </div>
            <div className="field">
              <label>In the English: the translation and the added explanation</label>
              <Seg value={s.enMark ?? 'plain'} options={[['plain', 'Plain'], ['soft', 'Softer'], ['light', 'Lighter'], ['italic', 'Italics'], ['only', 'Only translation']]} onPick={(v) => onChange({ enMark: v as 'plain' | 'soft' | 'light' | 'italic' | 'only' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sefaria&apos;s English mixes the word-for-word translation with words it adds to explain. Plain: all alike. Softer: the explanation in light grey. Lighter: just a shade lighter. Italics: the explanation in italics. Only translation: just Sefaria&apos;s word-for-word translation, with the explanation left out (a line with nothing marked shows all of it).</div>
            </div>
            </Group>
          </Group>
          )}
          {rest && (
          <Group id="shown" title="What's shown" hint="The text, translation, AI extras, seforim">
            <Group id="shown-text" level={2} title="The text and its translation" hint={`${s.display === 'original' ? 'original only' : s.display === 'off' ? 'off (verbal)' : 'with translation'}${s.nikud ? ' · nikud' : ''}${s.onkelos ? ' · Onkelos' : ''}`}>
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
            </Group>
            <Group id="shown-ai" level={2} title="Extras written by the AI" hint="Amud intro, steps, commentary summaries">
            <div className="field">
              <label>Amud intro (a paragraph on what&apos;s coming, at the top of each amud)</label>
              <Seg value={s.amudIntro !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ amudIntro: v === 'on' })} />
              <label style={{ marginTop: 10 }}>Voice says the intro (Read &amp; Big Picture)</label>
              <Seg value={s.introVoice !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ introVoice: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The AI writes each amud&apos;s intro once (about 1–2 cents the first time), then it&apos;s kept, free. In Read &amp; Big Picture the voice says it when a new amud begins, once per session.</div>
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
            </Group>
            <Group id="shown-sef" level={2} title="Seforim from Sefaria" hint={s.approveAll ? 'all allowed' : 'classic and approved only'}>
            <div className="field">
              <label>Seforim from Sefaria</label>
              <Seg value={s.approveAll ? 'all' : 'approved'} options={[['all', 'Allow all'], ['approved', 'Classic and approved only']]} onPick={(v) => onChange({ approveAll: v === 'all' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>“Classic and approved only” allows works before 1900 and ones you approved. Either way, the Chavrusa speaks only from an Orthodox perspective.</div>
            </div>
            <div className="field">
              <label>Nikud</label>
              <Seg value={s.nikud ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ nikud: v === 'on' })} />
            </div>
            </Group>
            <Group id="shown-call" level={2} title="The screen during calls" hint={s.blankCall ? 'blank' : 'shows the conversation'}>
            <div className="field">
              <label>Screen during voice conversations</label>
              <Seg value={s.blankCall ? 'blank' : 'show'} options={[['show', 'Show the conversation'], ['blank', 'Blank (voice only)']]} onPick={(v) => onChange({ blankCall: v === 'blank' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Blank keeps the screen empty while you talk, for focus. It doesn't change the cost. Everything is still saved, so you can read it after the call.</div>
            </div>
            </Group>
          </Group>
          )}

          {rest && <>
          <Group id="voice" title="Voice" hint={`${s.liveEngine === 'gemini' ? 'Gemini Live' : (LIVE_VOICES.find((v) => v.id === s.liveVoice)?.name ?? (s.customVoices ?? []).find((v) => v.id === s.liveVoice)?.name ?? s.liveVoice).replace(/ \(.*\)$/, '')} · ${({ slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' } as Record<string, string>)[s.livePace ?? 'natural']} · pauses ${s.livePauses ?? 'normal'}`}>
            <div className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Live voice: natural, answers almost instantly, and can be interrupted. About $0.05 per minute for the voice, plus the AI model.</div>
            <Group id="voice-which" level={2} title="Which voice" hint={(LIVE_VOICES.find((v) => v.id === s.liveVoice)?.name ?? (s.customVoices ?? []).find((v) => v.id === s.liveVoice)?.name ?? s.liveVoice).replace(/ \(.*\)$/, '')}>
              {(
                <div className="field">
                  <label>Live voice (tap ▶ to hear it; a sample costs about 1 cent)</label>
                  <VoicePicker kind="live" voices={[...(s.customVoices ?? []).map((v) => ({ id: v.id, name: `${v.name} (your design)` })), ...LIVE_VOICES]} value={s.liveVoice} onPick={(v) => onChange({ liveVoice: v })} disabled={liveActive} />
                  <VoiceDesigner onCreated={(p) => onChange(p)} hasCustom={(s.customVoices ?? []).length > 0} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A new voice applies the next time you tap Talk.</div>
                </div>
              )}
            </Group>
            <Group id="voice-speed" level={2} title="Speed and pauses" hint={`${({ slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' } as Record<string, string>)[s.livePace ?? 'natural']} · pauses ${s.livePauses ?? 'normal'}`}>
              {(
                <div className="field">
                  <label>Speaking speed</label>
                  <Seg value={s.livePace ?? 'natural'} options={[['slow', 'Slow'], ['relaxed', 'Relaxed'], ['natural', 'Normal'], ['brisk', 'Brisk']]} onPick={(v) => onChange({ livePace: v })} />
                  <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>Applies the next time you tap Talk. In a call you can also just say “speak faster.”</div>
                  <label>Pauses</label>
                  <Seg value={s.livePauses ?? 'normal'} options={[['few', 'Few'], ['normal', 'Normal'], ['more', 'More'], ['most', 'Most']]} onPick={(v) => onChange({ livePauses: v as 'few' | 'normal' | 'more' | 'most' })} />
                  <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>More: a short pause between phrases when it reads, a beat after each point, and time to think around a question. Most: long, unhurried pauses after every phrase and point. Applies the next time you tap Talk; in a call you can also say “slow down and pause more.”</div>
                </div>
              )}
            </Group>
            <Group id="voice-reads" level={2} title="Who reads the text, and the English" hint={`${(s.voiceReads ?? 'all') === 'all' ? 'he reads it all' : s.voiceReads === 'english' ? 'English only' : 'just the gist'} · ${(s.translate ?? 'full') === 'full' ? 'Sefaria’s full English' : s.translate === 'literal' ? 'just the literal words' : 'his own translation'}`}>
              <div className="field">
                <label>In a call, who reads the text</label>
                <Seg value={s.voiceReads ?? 'all'} options={[['all', 'He reads it all'], ['english', 'English only'], ['gist', 'Just the gist']]} onPick={(v) => onChange({ voiceReads: v as 'all' | 'english' | 'gist' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{(s.voiceReads ?? 'all') === 'all' ? 'The chavrusa reads the lashon kodesh and its English, phrase by phrase.' : (s.voiceReads === 'english' ? 'You read the lashon kodesh yourself; the chavrusa reads only the English, then goes on in your style.' : 'You read the text yourself; the chavrusa doesn\'t read it at all, just gives the gist of each piece and goes on in your style (explaining, asking…).')} Works with every style. Also in the ⋯ menu.</div>
              </div>
              <div className="field">
                <label>After each piece</label>
                <Seg value={s.autoGo ? 'go' : 'wait'} options={[['wait', 'Wait for me'], ['go', 'Keep going by itself']]} onPick={(v) => onChange({ autoGo: v === 'go' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.autoGo
                  ? `After reading and explaining a piece, the chavrusa waits a few seconds (${({ few: 2, normal: 4, more: 6, most: 8 } as Record<string, number>)[s.livePauses ?? 'normal'] ?? 4}, by your Pauses setting) and goes on to the next one by itself. Just start talking to stop him; say "stop" or "wait" to hold, and "go on" to start again. Not after a question: he waits for your answer. Good for Bekius.`
                  : 'After each piece he stops and waits for you to say "go on" (or anything else).'}</div>
              </div>
              <div className="field">
                <label>How the Hebrew is given to the voice</label>
                <Seg value={s.heRead === 'he' || s.heRead === 'he-bare' || s.heRead === 'he-key' || s.heRead === 'join-kh' ? s.heRead : 'other'} options={[['he', 'With nikud'], ['he-bare', 'Without vowels'], ['he-key', 'With a key'], ['join-kh', 'Spelled out only']]} onPick={(v) => onChange({ heRead: v as 'he' | 'he-bare' | 'he-key' | 'join-kh' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.heRead === 'join-kh'
                  ? 'No Hebrew letters at all: every word spelled out the yeshivish Ashkenazi way in English letters (hawishaw nikneis beshawloish derawchim), worked out from the nikud. The voice just says what it sees, so it can\'t slip into Israeli. How it was on Oct 31 – Nov 1.'
                  : s.heRead === 'he-bare'
                  ? 'The letters only, like a Gemara. The voice has to guess the vowels, and on bare letters it can slip into an Israeli accent.'
                  : s.heRead === 'he-key'
                  ? 'The Hebrew with nikud, plus an Ashkenazi spelling of every word in English letters (stressed syllable in capitals): nothing left to guess.'
                  : s.heRead === 'he'
                  ? 'The Hebrew with its nikud, as in a sefer: the voice sees every vowel.'
                  : 'Another way is chosen (in Pronunciation and tests). Pick one here to switch.'} Applies from the next Talk.</div>
              </div>
              <div className="field">
                <label>The English read with the text</label>
                <Seg value={s.translate ?? 'full'} options={[['full', 'Sefaria’s full English'], ['literal', 'Just the literal words'], ['own', 'The chavrusa’s own']]} onPick={(v) => onChange({ translate: v as 'full' | 'literal' | 'own' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{(s.translate ?? 'full') === 'full'
                  ? 'Sefaria’s English as it is, including the explanation it adds (on the Gemara it can run long).'
                  : s.translate === 'literal'
                    ? 'Only the word-for-word part of Sefaria’s English (the part it marks in bold), without the added explanation: shorter and closer to the words. Where Sefaria marks nothing, its full English.'
                    : 'A short, literal translation in the chavrusa’s own words, the way a rebbi translates inside in shiur. When the app reads a line by itself (no brain), it uses the literal words instead.'} In calls; applies from the next thing he reads.</div>
              </div>
            </Group>
            <Group id="voice-pron" level={2} title="Pronunciation and tests" hint={`Vowel key ${({ key: 'A', keyB: 'B', keyC: 'C', keyD: 'D' } as Record<string, string>)[(s.liveRules?.length ? s.liveRules : ['key']).find((r) => /^key[BCD]?$/.test(r)) ?? 'key'] ?? 'A'} · tests · say it my way`}>
              {(() => {
                // The Vowel key's versions, to choose and simply learn with (no test needed). Each is the same key with
                // one difference; all keep the rest of the rules in use.
                const VERSIONS: [string, string, string][] = [
                  ['key', 'A', 'The original: the tested best so far, and what you have been using. Most correct in the A-or-B tests.'],
                  ['keyD', 'D', 'A with a better shva: a quick "e" that is always heard, with no pause or breath (s\'MI-chah, never smicha). Meant to be smooth without swallowing shvas.'],
                  ['keyC', 'C', 'A with a very short shva, with no pause or breath. Smoothest on simple lines, but it can swallow shvas on hard Aramaic.'],
                  ['keyB', 'B', 'C plus a chirik rule and the short kamatz as "o". Smooth, but less correct in your test.'],
                ];
                const cur = s.liveRules?.length ? s.liveRules : ['guide', 'key'];
                const curKey = cur.find((r) => /^key[BCD]?$/.test(r)) ?? (cur[0] === 'none' ? '' : 'key');
                const pick = (k: string) => onChange({ liveRules: [...(cur[0] === 'none' ? [] : cur.filter((r) => !/^key[BCD]?$/.test(r))), k], liveShort: true });
                return (
                  <div className="field">
                    <label>Vowel key: which version to learn with</label>
                    <Seg value={curKey || 'key'} options={VERSIONS.map(([id, name]) => [id, name] as [string, string])} onPick={pick} />
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{VERSIONS.find(([id]) => id === (curKey || 'key'))?.[2]} Applies from the next Talk; switch any time and just learn with it. The call recorder shows which version each call used.</div>
                  </div>
                );
              })()}
              <div className="field">
                <label>Standard pronunciations</label>
                <Seg value={s.houseSay !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ houseSay: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>On: one fixed way to say the common words, from the app&apos;s yeshivish rules: Tosafos = TOSS-fos, Gemara = g&apos;MOR-ah, Mishnah = MISH-nah, Rashi = RAH-shee, kashya = KOSH-ya, machlokes = mach-LOI-kes, halacha = ha-LAW-cha, Torah = TOI-rah, Moshe = MOI-shuh, Shabbos = SHAH-bos, and more. Your own “say it my way” words win over these.</div>
              </div>
              <HebrewLab s={s} onChange={onChange} disabled={liveActive} />
              <GptPronunciation s={s} onChange={onChange} disabled={liveActive} />
            </Group>
            <Group id="voice-steady" level={2} title="Keeping it steady" hint={`${s.liveShort !== false ? 'short' : 'full'} instructions${s.liveFresh !== false ? ' · fresh starts' : ''}${s.liveCheck !== false ? ' · catch skips' : ''}`}>
              <div className="field">
                <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Ways to make the good readings the usual ones. Each applies the next time you tap Talk.</div>
                <label>Instructions to the voice</label>
                <Seg value={s.liveShort !== false ? 'short' : 'full'} options={[['short', 'Short'], ['full', 'Full']]} onPick={(v) => onChange({ liveShort: v === 'short' })} />
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>{s.liveShort !== false ? 'Short: the same rules, each said once, in well under half the words, with the full pronunciation guide kept. Long instructions make a live voice drift in accent and cadence.' : 'Full: every rule as it grew, word for word (Steady mode and the coach work only with these).'}</div>
                <label>Fresh start at each new section</label>
                <Seg value={s.liveFresh !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveFresh: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>When you move on to a new Mishnah, piece of Gemara or perek, the voice quietly reconnects at the next quiet moment, so it starts clean instead of drifting as a long call goes on. It remembers where you are; you may hear a second of quiet.</div>
                <label>Catch skipped words</label>
                <Seg value={s.liveCheck !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveCheck: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>The app compares what the voice actually said with the text it was given. If it left out the end, it goes back and reads the part it missed. Free.</div>
                <label>Open calls the Nov 3 way (a test)</label>
                <Seg value={s.liveOldOpen ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ liveOldOpen: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>A test of the calls that don&apos;t start: on, a call opens exactly the way it did on Nov 3 before the changes since (the voice opens the call itself, nothing is brought at the start, no automatic retry). Try a few calls with it on and a few with it off, and send the logs.</div>
                <label>Catch skipped Hebrew</label>
                <Seg value={s.liveCheckHe !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveCheckHe: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>After it reads, the app looks for each Hebrew phrase in what the voice said. If it read only the English of some phrases, or skipped their Hebrew, it reads that part again, inside. It acts only on a clear miss (turn it off if it ever re-reads what it said). Free.</div>
              </div>
              <div className="field">
                <label>Steady mode (the voice sticks to your style and instructions)</label>
                <Seg value={s.liveSteady === true ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveSteady: v === 'on' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.liveSteady === true
                  ? 'On: every learning turn (reading, explaining, kashyos, your answers, your instructions) goes through the brain, which plans it in your style; the voice reads the text inside and says the rest in its own words. About 1–3 seconds more before an answer, and about 1–3¢ a turn for the brain.'
                  : 'Off: the voice answers quick learning turns itself, faster and more natural. The coach below keeps it on your style and instructions.'}</div>
              </div>
              {s.liveSteady !== true && (
                <div className="field">
                  <label>Coach notes</label>
                  <Seg value={s.liveCoach === true ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ liveCoach: v === 'on' })} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>After each exchange, a quick brain check looks at what the voice said against your style and instructions. If it drifted, the voice quietly gets a short note for its next reply. It never waits for it. About a tenth of a cent an exchange.</div>
                </div>
              )}
            </Group>
            <Group id="voice-save" level={2} title="Pausing to save" hint={s.liveIdleSec ? `after ${s.liveIdleSec < 60 ? `${s.liveIdleSec} s` : `${s.liveIdleSec / 60} min`} quiet` : 'never'}>
              <div className="field">
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
              {s.liveIdleSec > 0 && (
                <div className="field">
                  <label>When paused</label>
                  <Seg value={s.liveWake ? 'wake' : 'tap'} options={[['wake', 'Start talking to resume'], ['tap', 'Tap Resume']]} onPick={(v) => onChange({ liveWake: v === 'wake' })} />
                  {s.liveWake && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your first second or two may be missed while it reconnects. While paused, the microphone listens only on your device; nothing is sent until you speak.</div>}
                </div>
              )}
            </Group>
            <Group id="voice-rec" level={2} title="Call recorder" hint="Send me a call's log">
              <CallLogs />
            </Group>
            <Group id="voice-gemini" level={2} title="GPT-Live or Gemini Live" hint={s.liveEngine === 'gemini' ? 'Gemini Live (test)' : 'GPT-Live'}>
              <div className="field">
                <label>Live voice for calls</label>
                <Seg value={s.liveEngine === 'gemini' ? 'gemini' : 'gpt'} options={[['gpt', 'GPT-Live (current)'], ['gemini', 'Gemini Live (test)']]} onPick={(v) => onChange({ liveEngine: v as 'gpt' | 'gemini' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.liveEngine === 'gemini'
                  ? 'Gemini Live (Google), a test: about 1–2¢ a minute for the voice, plus the AI model for learning turns. Applies the next time you tap Talk; switch back any time.'
                  : 'GPT-Live (OpenAI): about 5¢ a minute for the voice, plus the AI model for learning turns. Gemini Live is cheaper; try it side by side.'}</div>
              </div>
              <GeminiSample value={s.geminiVoice} onPick={(v) => onChange({ geminiVoice: v })} />
              <GeminiPronunciation s={s} onChange={onChange} />
            </Group>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Tap <b>Talk</b> at the top for a hands-free conversation: speak, pause, and your chavrusa answers out loud.</p>
          </Group>

          <Group id="extras" title="Extras" hint={[s.cacheTexts !== false && 'saved texts', s.notes && 'notes', s.sugyaMap && 'sugya map', s.review && 'review', s.chazara && 'chazara', s.progress && 'progress', s.driveMode && 'driving', s.offline && 'offline'].filter(Boolean).join(' · ') || 'all off'}>
            <div className="field">
              <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>Each one is optional: turn on what you want.</div>
              {([
                ['chazara', 'Chazara (review)', 'On Home: a short recap of what you learned last time, and a few questions on an older sugya. One small AI call per recap, kept so it is made once.'],
                ['sugyaMap', 'Sugya map', 'A map button at the top of the Sefer, all in English: the big picture of the amud or perek, then each topic with an intro, what you need to know for it, its steps (question, answer, proof…; for Mishnah its rulings and disputes; for Chumash and Nach its story, speeches, mitzvos and prophecies), and where it ends up. From Sefaria (free): the meforshim on each step, where the halacha is ruled, and the verses quoted. Tap a step to go there. The outline is made by the AI once per amud or perek and kept.'],
                ['explainLine', 'Explain button on each line', 'Next to Rashi and Tosafos on every line of Gemara, Mishnah, Chumash and Nach: “✦ Explain” opens, right under the line, what it says and where it stands in the sugya. Made by the AI (Claude Opus) once per line and kept for good.'],
                ['lineSources', 'Sources button on each line', 'Next to Rashi and Tosafos: “Sources” opens what Sefaria links to that line: where the halacha is, the same in Shas, Midrash, verses, and machshava, mussar and chassidus. Each opens right there in Hebrew and English. Free, no AI. Beside it, “✦ Ideas”: 2–4 points the AI (Opus) draws only from those seforim, each naming its source; made once per line and kept.'],
                ['mapComms', 'Meforshim in the sugya map', 'Under each step of the map, the meforshim on it (Rashi, Tosafos, Ritva…). Tap one and it opens right there in the map, Hebrew with English (translated by the AI where Sefaria has none, once, and kept).'],
                ['review', 'Review questions', 'A “Review” button at the top of the Sefer: questions on the amud or perek to test yourself, each with its answer hidden until you tap. Made by the AI once per amud or perek and kept for good.'],
                ['notes', 'Notes on the line', 'Add a note to any line (tap the line, then ✎), or say “make a note: …” in a call. Lines with notes show ✎; all your notes are in the Library under My Notes.'],
                ['progress', 'Progress and plans', 'On Home: the amudim and perakim you have learned, your goals (“finish Yoma by …”), daf yomi, and a siyum when you finish.'],
                ['driveMode', 'Driving mode', 'A 🚗 button on the learning screen: big buttons, the screen kept on, and your headphone or car buttons work (play/pause, next = go on, back = say it again).'],
                ['offline', 'Offline reading', 'A “Download” button on a masechta or sefer in the Library: read it with no internet (the chavrusa itself still needs internet).'],
                ['cacheTexts', 'Saved texts', 'Keep a copy of each text you open, so it still opens when Sefaria is slow or down. Free storage; refreshed monthly.'],
              ] as [keyof Settings, string, string][]).map(([k, label, about]) => {
                const on = k === 'cacheTexts' || k === 'mapComms' || k === 'explainLine' || k === 'lineSources' ? s[k] !== false : !!s[k];
                return (
                  <div key={k} style={{ marginBottom: 12 }}>
                    <label>{label}</label>
                    <Seg value={on ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ [k]: v === 'on' } as Partial<Settings>)} />
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{about}</div>
                  </div>
                );
              })}
            </div>
          </Group>

          <Group id="inbox" title="Messages" hint="What people sent through Contact us">
            <Inbox />
          </Group>

          <Group id="credits" title="Credits (selling the app)" hint={s.billing ? 'on' : 'off'}>
            <Credits on={!!s.billing} onToggle={(on) => onChange(on ? { billing: true, billingSince: s.billingSince ?? new Date().toISOString() } : { billing: false })} />
          </Group>

          <Group id="memory" title="What your chavrusa remembers" hint={memories ? `${memories.length} saved` : undefined}>
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
          </Group>

          <Group id="about" title="About and log out">
            <p className="muted" style={{ fontSize: 13 }}>This is an AI learning tool. It can make mistakes. Do not rely on it for accuracy in Torah learning, halacha, or hashkafa. For practical questions, ask your rav.</p>
            <p className="muted" style={{ fontSize: 13 }}><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a> · <a href="/terms" target="_blank" rel="noreferrer">Terms of use</a> · <a href="/credits">Credits and licenses</a> · <a href="/contact">Contact us</a> · <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('chavrusa-guide-go')); }}>How to use the app</a></p>
            <button className="btn" onClick={() => { window.location.href = '/api/logout'; }}>Log out</button>
          </Group>
          </>}
          </GroupList>
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

// Messages sent through Contact us (app/contact), newest first: tap one to mark it read; × deletes it.
function Inbox() {
  type M = { id: string; at: string; name: string; email: string; topic: string; text: string; read?: boolean };
  const [list, setList] = useState<M[] | null>(null);
  useEffect(() => { fetch('/api/contact').then((r) => r.json()).then((d) => setList(d.messages ?? [])).catch(() => setList([])); }, []);
  const read = (id: string) => { setList((l) => l?.map((x) => (x.id === id ? { ...x, read: true } : x)) ?? null); void fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); };
  const drop = (id: string) => { setList((l) => l?.filter((x) => x.id !== id) ?? null); void fetch(`/api/contact?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); };
  return (
    <div className="field">
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>The Contact us page is at <a href="/contact">/contact</a> (open to anyone, no sign-in). Messages land here.</div>
      {!list ? <div className="muted">Loading…</div> : !list.length ? <div className="muted">No messages yet.</div> : list.map((m) => (
        <div key={m.id} className={`inbox-item ${m.read ? '' : 'new'}`} onClick={() => !m.read && read(m.id)}>
          <div className="inbox-head"><b>{m.topic}{m.name ? ` · ${m.name}` : ''}</b><button className="linklike" aria-label="Delete this message" onClick={(e) => { e.stopPropagation(); drop(m.id); }}>×</button></div>
          <div className="muted" style={{ fontSize: 12 }}>{new Date(m.at).toLocaleString()}{m.email ? <> · <a href={`mailto:${m.email}`}>{m.email}</a></> : ' · no email left'}</div>
          <div className="inbox-text" dir="auto">{m.text}</div>
        </div>
      ))}
    </div>
  );
}

// Credits (selling the app): the switch, the balance, and buying credit with Stripe. Off until it's set up.
function Credits({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  const [b, setB] = useState<{ bought?: number; used?: number; left?: number; markup?: number; stripe?: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => fetch('/api/billing/balance').then((r) => r.json()).then(setB).catch(() => setB({ error: 'Couldn’t check.' }));
    void load();
    // Stripe's word that a payment went through can arrive a few seconds after coming back: look again shortly.
    const t = window.setTimeout(() => void load(), 5000);
    return () => window.clearTimeout(t);
  }, [on]);
  const buy = async (usd: number) => {
    setBusy(true);
    const r = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd }) }).then((x) => x.json()).catch(() => ({ error: 'Couldn’t reach the server.' }));
    setBusy(false);
    if (r.url) window.location.href = r.url; else setB((x) => ({ ...(x ?? {}), error: r.error }));
  };
  return (
    <div className="field">
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>For when others use the app: they buy credit (through Stripe), and what they use of the AI and voice comes off it. Off: nothing is counted or limited.</div>
      <Seg value={on ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onToggle(v === 'on')} />
      {on && b && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          {b.error ? <div className="muted">{b.error}</div> : <div>Balance: <b>${(b.left ?? 0).toFixed(2)}</b> of use left <span className="muted">(bought ${(b.bought ?? 0).toFixed(2)} · used ${(b.used ?? 0).toFixed(2)} · markup ×{b.markup})</span></div>}
          {b.stripe ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{[5, 10, 25, 50].map((u) => <button key={u} className="btn" disabled={busy} onClick={() => void buy(u)}>Add ${u}</button>)}</div>
          ) : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Stripe isn’t connected yet (STRIPE_SECRET_KEY in Vercel).</div>}
        </div>
      )}
    </div>
  );
}
