'use client';
import { useEffect, useState } from 'react';
import { useLab, setLab } from '@/lib/lab';
import { ALL_STARTERS } from '@/lib/starters';
import { COLOR_DEFAULTS, COLOR_IDS, COLOR_PARTS, colorOf, CustomStyle, DEFAULT_VOICE_DESIGN, FONTS_COMM, FONTS_EN, FONTS_HE, GEMINI_VOICES, LIVE_VOICES, MODELS, Provider, Settings, STYLES, styleById, Tier, TIER_LABELS, isSefariaLook, sefariaLook } from '@/lib/config';
import type { Memory } from '@/lib/db';
import { LookPicker } from './Modals';
import { VoicePicker } from './VoicePicker';
import GeminiSample from './GeminiSample';
import GeminiPronunciation from './GeminiPronunciation';
import CallLogs from './CallLogs';
import HebrewLab from './HebrewLab';
import GptPronunciation from './GptPronunciation';
import GuidedPalettePicker from './GuidedPalettePicker';
import { Group, GroupList } from './SettingsGroup';
import { HomePhotoPicker } from './HomePhoto';
import { DrawnFacePreview, FacePhotoPicker } from './TalkingFace';
import MyButtons from './MyButtons';

interface Props {
  settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void; onHelp: () => void; liveActive?: boolean;
  // The new main screen splits this in two: 'themes' (look, fonts, sizes) and 'settings' (everything else), each a full page.
  part?: 'all' | 'themes' | 'settings';
  asPage?: boolean;
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {/* Nov 16: every Off/On pair the same way round: Off on the left, On on the right */}
      {(options.length === 2 && options.some(([v]) => v === 'on') && options.some(([v]) => v === 'off') ? [options.find(([v]) => v === 'off')!, options.find(([v]) => v === 'on')!] : options).map(([v, label]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}

export default function SettingsDrawer({ settings: s, onChange, onClose, onHelp, liveActive, part = 'all', asPage = false }: Props) {
  const themes = part !== 'settings', rest = part !== 'themes';
  const [editing, setEditing] = useState<CustomStyle | null>(null);
  // Nov 16: one renderer for the on/off rows (the AI tools, your learning, calls). Same defaults as before.
  const DEFAULT_ON = ['sayIt', 'bigPictureText', 'bigPicture', 'cacheTexts', 'mapComms', 'elsewhere', 'byHeart', 'marks', 'sourceSheet', 'daySummary', 'explainLine', 'listenDaf', 'halachaTrail', 'tosSteps', 'wordTap', 'lineChat', 'lineSources'];
  const renderToggles = (rows: [keyof Settings, string, string][]) => rows.map(([k, label, about]) => {
    const on = DEFAULT_ON.includes(k as string) ? s[k] !== false : !!s[k];
    return (
      <div key={k} style={{ marginBottom: 12 }}>
        <label>{label}</label>
        <Seg value={on ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ [k]: v === 'on' } as Partial<Settings>)} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{about}</div>
      </div>
    );
  });
  const lab = useLab(); // the testing options are in the Lab only (Nov 15)
  const [voiceMore, setVoiceMore] = useState(false); // voice tests and fine-tuning: hidden until asked for (Nov 13)
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
  async function addMem(text?: string) {
    const content = (text ?? newMem).trim();
    if (!content) return;
    const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'instruction', content }) });
    const m = await res.json();
    if (m.id) setMemories((list) => [...(list ?? []), m]);
    if (text === undefined) setNewMem('');
  }

  return (
    <>
      {!asPage && <div className="scrim" onClick={onClose} />}
      <div className={asPage ? 'settings-page' : 'drawer right'} role={asPage ? undefined : 'dialog'} aria-label="Settings">
        {!asPage && <div className="drawer-head"><h2>Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>}
        <div className={asPage ? 'sg-page' : 'drawer-body'}>
          <GroupList id="settings">
          {themes && (
          <Group id="look" title={asPage ? 'The page' : 'The page and text'} hint="Background, fonts, colors, sizes, layout, the text, commentaries" flat={part === 'themes'}>
            {/* Nov 16, rethought: Background first, then Fonts, Text colors, Sizes, Commentaries, Page layout. The look
                itself (Claude) is fixed; choosing another look is in the Lab. */}
            <Group id="look-look" level={2} title="Background" hint={(s.theme === 'clay' || s.theme === 'chatgpt') ? ({ look: 'Off-white', white: 'White', cream: 'Cream', blue: 'Light blue', green: 'Light green', night: 'Night' } as Record<string, string>)[s.paper ?? 'look'] : undefined}>
            {s.theme === 'guided-learning' && <div className="field"><label>Guided Learning colors</label><GuidedPalettePicker value={s.guidedPalette} onChange={guidedPalette=>onChange({guidedPalette})}/><p className="muted" style={{fontSize:12}}>Changes the workspace, cards and buttons for Guided Learning. Your text colors and fonts stay independent.</p></div>}
            {(lab || (s.theme !== 'clay' && s.theme !== 'chatgpt')) && <div className="field">
              <label>Look{lab ? ' (Lab)' : ''}</label>
              <LookPicker value={s.theme} onPick={(v) => onChange({ theme: v })} />
            </div>}
            {(s.theme === 'clay' || s.theme === 'chatgpt') && (
              <div className="field">
                <label>Background color</label>
                <div className="paper-pick" role="radiogroup" aria-label="Background color">
                  {([['white', 'White'], ['look', 'Off-white'], ['cream', 'Light cream'], ['creamy', 'Cream'], ['blue', 'Light blue'], ['green', 'Light green'], ['night', 'Night']] as const).map(([id, name]) => (
                    <button key={id} role="radio" aria-checked={(s.paper ?? 'look') === id} className={`paper-sw paper-${id}`} onClick={() => onChange({ paper: id })}>
                      <span className="paper-dot" aria-hidden="true" /><span>{name}</span>
                    </button>
                  ))}
                </div>
                <label style={{ marginTop: 14 }}>Paper texture</label>
                <Seg value={s.paperTex === 'ink' ? 'stone' : s.paperTex ?? 'off'} options={[['off', 'Smooth'], ['light', 'Paper'], ['stone', 'Stone']]} onPick={(v) => onChange({ paperTex: v as 'off' | 'light' | 'stone' | 'ink' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Paper is fine fibers over the color you chose. Stone is the white quartz of the Ink and stone look: very light white-grey with soft grey veins (it brings its own color).</div>
                <label style={{ marginTop: 14 }}>Home screen picture</label>
                <div className="seg-grid"><Seg value={s.homeBg ?? 'none'} options={[['none', 'None'], ['kotel', 'Kosel'], ['bm', 'Beis Medrash'], ['shelves', 'Shelves'], ['candle', 'Candlelight'], ['yerushalayim', 'Yerushalayim'], ['own', 'My photo']]} onPick={(v) => onChange({ homeBg: v as NonNullable<Settings['homeBg']> })} /></div>
                {s.homeBg === 'own' && <HomePhotoPicker />}
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Behind the Home screen: the Kosel’s stones; a beis medrash (stone arches, lamps, shtenders and seforim); Shelves, a drawn beis medrash with arched windows and shelves of seforim; Candlelight, a night scene with a flickering candle and rising steam, like the Midnight Sefer look; Yerushalayim, the Old City walls and gate at sunrise; or My photo, a picture of your own (kept only on this phone). Softened so the words stay easy to read. Only on Home.</div>
              </div>
            )}
            </Group>
            <Group id="look-fonts" level={2} title="Fonts">
            <div className="field">
              <button className={`ql-sefaria ${isSefariaLook(s) ? 'on' : ''}`} style={{ marginBottom: 12 }} onClick={() => onChange(sefariaLook(s))}>{isSefariaLook(s) ? '✓ Sefaria look' : 'Make it look like Sefaria'}<small>Taamey Frank Hebrew, Garamond English at 18, the translation bold and the added explanation soft grey</small></button>
            </div>
            <div className="field">
              <label>English font</label>
              <FontPicker list={FONTS_EN} sample="Let's learn the Gemara together" value={s.fonts?.[s.theme]?.en ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), en: id } } })} />
              <label style={{ marginTop: 10 }}>Hebrew font</label>
              <FontPicker list={FONTS_HE} sample="בְּרֵאשִׁית בָּרָא אֱלֹקִים" rtl value={s.fonts?.[s.theme]?.he ?? ''} onPick={(id) => onChange({ fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), he: id } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In Chumash and Tanach, only Taamey Frank and Noto Serif Hebrew can show the trop. With any other font the trop is left off (the vowels stay), so the font you picked is the one you see.</div>
              <label style={{ marginTop: 10 }}>Hebrew font for the commentaries</label>
              <FontPicker list={FONTS_COMM} sample="וַיִּהְיוּ חַיֵּי שָׂרָה – לכך נכתב שנה" rtl value={s.fonts?.[s.theme]?.comm || (s.rashiScript ? 'rashi' : 'same')} onPick={(id) => onChange({ rashiScript: id === 'rashi', fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), comm: id } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The commentaries&apos; font is for Rashi, Tosafos and all the meforshim.</div>
            </div>
            <div className="field">
              <label>The AI’s Hebrew font</label>
              <Seg value={s.aiHeFont ?? 'text'} options={[['text', 'Same as the text'], ['times', 'Times New Roman']]} onPick={(v) => onChange({ aiHeFont: v as 'text' | 'times' })} />
            </div>
            <div className="field">
              <label>Spelling of names</label>
              <Seg value={s.spelling ?? 'yeshivish'} options={[['yeshivish', 'Shabbos, Brachos'], ['modern', 'Shabbat, Berakhot']]} onPick={(v) => onChange({ spelling: v as 'yeshivish' | 'modern' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>How the names of seforim and the learning words are spelled in English: in the title of the page, the Library, Recents, Home and the English text. Shabbos, Brachos, Tosafos, Bava Basra; or as Sefaria spells them: Shabbat, Berakhot, Tosafot, Bava Batra.</div>
            </div>
            </Group>
            <Group id="look-colors" level={2} title="Text colors and bold">
            <div className="field">
              <label>The color and weight of each part of the text</label>
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
              <div className="range"><input type="range" min={16} max={52} value={s.heSize} onChange={(e) => onChange({ heSize: Number(e.target.value) })} /><span className="he" style={{ fontSize: s.heSize }}>אבג</span></div>
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
            <div className="field">
              <label>The AI’s writing size (Explain, Chat, Ideas, outlines)</label>
              <div className="range"><input type="range" min={14} max={32} value={s.aiSize ?? Math.max(17, s.enSize)} onChange={(e) => onChange({ aiSize: Number(e.target.value) })} /><span style={{ fontSize: s.aiSize ?? Math.max(17, s.enSize) }}>Abc אבג</span></div>
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
              <label>My seforim in the Library</label>
              <Seg value={s.mySeforim ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ mySeforim: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Shows a "My seforim" card at the top of the Library, where you can add and open your own texts.</div>
            </div>
            <div className="field">
              <label>Steinsaltz among the commentaries (Gemara)</label>
              <Seg value={s.showSteinsaltz ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ showSteinsaltz: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The English under each line of the Gemara is already the Steinsaltz; turn this on to also list it with the commentaries.</div>
            </div>
            <div className="field">
              <label>Rashi, Tosafos and other commentaries</label>
              <Seg value={s.rashiScript ? 'rashi' : 'regular'} options={[['regular', 'Regular letters'], ['rashi', 'Rashi script']]} onPick={(v) => onChange({ rashiScript: v === 'rashi', fonts: { ...(s.fonts ?? {}), [s.theme]: { ...(s.fonts?.[s.theme] ?? {}), comm: v === 'rashi' ? 'rashi' : 'same' } } })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Any other font: Look → Fonts → Hebrew font for the commentaries.</div>
            </div>
            </Group>
            <Group id="look-lines" level={2} title="Page layout">
            <div className="field">
              <label>Alignment</label>
              <Seg value={s.justify ? 'on' : 'off'} options={[['off', 'As usual'], ['on', 'Justified']]} onPick={(v) => onChange({ justify: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Justified: the Hebrew and the English fill the whole width of each line, with even edges on both sides, like a printed sefer. The last line of each stays as usual.</div>
            </div>
            <div className="field">
              <label>Space between parts</label>
              <Seg value={s.partGap ?? 'normal'} options={[['normal', 'Normal'], ['more', 'More'], ['most', 'Most']]} onPick={(v) => onChange({ partGap: v as 'normal' | 'more' | 'most' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>More room after the English before the next Hebrew, so each part stands on its own.</div>
            </div>
            <div className="field">
              <label>Side margins</label>
              <Seg value={s.sideMargin ?? 'normal'} options={[['narrow', 'Narrow'], ['normal', 'Normal'], ['wider', 'Wider'], ['widest', 'Widest']]} onPick={(v) => onChange({ sideMargin: v as 'narrow' | 'normal' | 'wider' | 'widest' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The text a little further in from the edges of the screen.</div>
            </div>
            <div className="field">
              <label>Lines between lines</label>
              <Seg value={s.lineRules ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ lineRules: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A thin line between each line of the text, with its Hebrew and English kept together above it. Also in the ⋯ menu.</div>
            </div>
            <div className="field">
              <label>English layout</label>
              <Seg value={s.interlinear ? (s.ilBy === 'sentence' ? 'sentence' : 'phrase') : 'line'} options={[['line', 'Under the line'], ['sentence', 'Sentence by sentence'], ['phrase', 'Phrase by phrase']]} onPick={(v) => onChange(v === 'line' ? { interlinear: false } : { interlinear: true, ilBy: v as 'phrase' | 'sentence' })} />
              {s.interlinear && <>
                <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Under each {s.ilBy === 'sentence' ? 'sentence' : 'phrase'}:</div>
                <Seg value={s.ilEn ?? (s.enMark === 'only' ? 'only' : 'full')} options={[['full', 'Sefaria’s full English'], ['only', 'Only the translation']]} onPick={(v) => onChange({ ilEn: v as 'full' | 'only' })} />
              </>}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sentence by sentence: each line is cut into whole sentences (where the Hebrew has a period), each with its English right under it. Phrase by phrase: each line is cut into short Hebrew phrases, each with its English right under it. On the Gemara it&apos;s lined up by Sefaria&apos;s word-for-word translation, so it&apos;s exact. In Chumash and Tanach each pasuk is cut at its trop (etnachta, zakef…), and in the Mishnah and other seforim at the punctuation; there the English is matched by length, so now and then a word lands one phrase off. A line that can&apos;t be lined up is shown the usual way. Also on the Mikraos Gedolos page, when its English is on.</div>
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
              <label>Continuous scroll button</label>
              <Seg value={s.autoScrollBtn !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ autoScrollBtn: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The ⇊ button by the mic: tap and the text glides up by itself; tap again to stop. Press and hold it to pick the speed.</div>
            </div>
            <div className="field">
              <label>Onkelos (Chumash)</label>
              <Seg value={s.onkelos ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ onkelos: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Onkelos under each pasuk, with its English when Sefaria has one. Straight from Sefaria, no AI, free. Also in Quiet chat&apos;s ⋯ menu.</div>
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
          </Group>
          )}
          {rest && <>
          {loadError && <div className="error">Could not reach the database: {loadError}</div>}
          <Group id="style" title="Learning style" hint={`${styleById(s.style, s.customStyles).name} · ${s.leads === 'learner' ? 'you explain first' : 'chavrusa explains first'} · ${s.nusach === 'sephardi' ? 'Sephardi' : 'Ashkenaz'}`}>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Or just tell your chavrusa: “be gentler,” “quiz me,” “go deeper.” <a href="/guide">How we learn</a> · <a href="#" onClick={(e) => { e.preventDefault(); onHelp(); }}>What can I ask for?</a> · <a href="/lab">Compare styles</a></p>
            <div className="style-list">
              {STYLES.filter((st) => lab || st.main || st.id === s.style).map((st) => (
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
            {/* Nov 16: two switches that go with any style (they were the Mussar, Chassidic and Follow My Lead styles). */}
            <div className="field">
              <label>Add a mussar / Chassidus angle</label>
              <Seg value={s.mussarAngle ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ mussarAngle: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Now and then, once the meaning is clear, a short lesson for your avodah from the words.</div>
            </div>
            <div className="field">
              <label>Follow my lead</label>
              <Seg value={s.followLead ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ followLead: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>You decide each time: it reads and explains, you read and it listens, or it asks you questions.</div>
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


          </>}

          {rest && (
          <>
          {/* Nov 16: everything the AI does, in one place. */}
          <Group id="ai" title="The AI" hint={`${MODELS[s.provider][s.tier].label}${s.saver !== false ? ' · Saver' : ''} · ${s.aiHub === false ? 'tools under each line' : 'tools in the ✦'}`}>
            <Group id="ai-tools" level={2} title="The ✦ and its tools" hint="Learn with me, Ask about this line, Where it goes, maps, review…">
            <div className="field">
              <label>Where the AI tools are</label>
              <Seg value={s.aiHub === false ? 'lines' : 'hub'} options={[['hub', 'In one ✦ button'], ['lines', 'Under each line']]} onPick={(v) => onChange({ aiHub: v === 'hub' })} />
              <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>In one ✦ (recommended): the floating button at the bottom right holds Learn with me, Ask about this line, Where it goes, and the page’s map, review, Listen and source sheet. Under each line: the old way, a row of buttons under every line you tap.</div>
            </div>
            <div className="field">
              <label>✦ AI buttons on the lines (Step, Pshat, In my words?)</label>
              <Seg value={s.lineAi ?? 'all'} options={[['all', 'Every line'], ['tap', 'Line I tap'], ['off', 'Off']]} onPick={(v) => onChange({ lineAi: v as 'all' | 'tap' | 'off' })} />
              <div className="muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>One switch for all the small ✦ buttons between the lines. Line I tap: they show only on the line you tapped (the same tap that opens the meforshim), so the page stays clean. Off hides them all; your Steps, Pshat and In my words choices are kept for when you turn them back on. Also in the Aa button.</div>
            </div>
            <div className="field">
              <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>Each one is optional: turn on what you want.</div>
              {renderToggles([
                ['bigPictureText', '✦ Big picture (written)', 'Under a line: a short note to read, where this line stands in the sugya (what it is doing and where the discussion is going). In the language the AI writes in. Made once per line (about a cent), then free.'],
                ['bigPicture', '🔊 Big picture (by voice)', 'Under a line: one tap and the voice tells you, in about half a minute, where this line stands in the sugya (what it is doing and where the discussion is going), then stops. Tap again to stop it. In the same voice as Listen. Made once per line (about 1–2¢), then free.'],
                ['explainLine', 'Full depth explanation', 'In ✦ → Ask about this line, and ✦ Full depth in Learn with me: what the line says and where it stands in the sugya, with the meforshim, each source tappable. Made once per line and kept.'],
                ['lineChat', 'Back and forth', 'Under the explanation in Ask about this line (and in Learn with me): ask about the line in your own words or tap a ready question (a kashya, a chakira…). Short answers, in your learning style.'],
                ['lineSources', 'Sources (in Where it goes)', 'In ✦ → Where it goes: what Sefaria links to the line (pesukim, Midrash, other seforim), with ✦ Summarize to pull them together.'],
                ['elsewhere', 'Elsewhere in Shas (in Where it goes)', 'In ✦ → Where it goes, on Gemara and Mishnah: the same sugya or statement in other places. From Sefaria’s links, no AI.'],
                ['halachaTrail', 'Halacha (in Where it goes)', 'In ✦ → Where it goes, on Gemara and Mishnah: the road from the line to the Rambam, the Tur, the Shulchan Aruch and the Mishnah Berurah.'],
                ['sayIt', '✦ In my words?', 'At the end of each line (in Sentence by sentence, each sentence): one tap and the chavrusa says what it means and what it is doing, in its own plain words (made once and kept), with a box under it to ask a follow-up. Also in the Aa button.'],
                ['flowColors', 'Color the give and take', 'In the sefer: each line colored by what it is doing, from the sugya map (made once per amud and kept): a question or rejection red, an answer green, a proof blue, a statement amber, with a small label where each begins and who says it. Also in the Aa button.'],
                ['sugyaMap', 'Sugya map', 'In ✦ → This page and more, and in Where it goes: the big picture of the amud or perek, its topics and their steps, in English. Made once and kept.'],
                ['mapComms', 'Meforshim in the sugya map', 'Under each step of the map, the meforshim on it; tap one and it opens right there.'],
                ['review', 'Review this passage', 'In ✦ → This page and more: questions on the amud or perek to test yourself, each answer hidden until you tap. Made once and kept.'],
                ['listenDaf', 'Listen to this page', 'In ✦ → This page and more: a spoken overview of the amud or perek, eight to ten minutes, for the car. Written and recorded once, then free.'],
                ['sourceSheet', 'Source sheet', 'In ✦ → This page and more: one printable page of the amud or perek (the big picture, who holds what, the text with its English, the halacha, your notes).'],
                ['tosSteps', 'Outline and Steps on the commentaries', 'On Rashi, Tosafos and every meforesh: Outline gives the piece in a few points; Steps cuts the same words into its steps. Made once and kept.'],
                ['chazara', 'Chazara on Home', 'On Home: a short recap of what you learned last time, and a few questions on an older sugya.'],
                ['daySummary', 'What we learned (after a call)', 'After a call of three minutes or more, a short summary of it is saved to your Notebook. About a cent a call.'],
              ])}
            </div>
            <MyQuestions list={s.myQuestions ?? []} onChange={(l) => onChange({ myQuestions: l })} />
            <HideQuestions hidden={s.hideQuestions ?? []} onChange={(l) => onChange({ hideQuestions: l })} />
            <MyButtons list={s.myButtons ?? []} onChange={(l) => onChange({ myButtons: l })} />
            </Group>
            <Group id="ai-page" level={2} title="What it adds to the page" hint="Amud intro, steps, commentary summaries">
            <div className="field">
              <label>Amud intro (a paragraph on what&apos;s coming, at the top of each amud)</label>
              <Seg value={s.amudIntro !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ amudIntro: v === 'on' })} />
              <label style={{ marginTop: 10 }}>Voice says the intro (Read &amp; Big Picture)</label>
              <Seg value={s.introVoice !== false ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onChange({ introVoice: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The AI writes each amud&apos;s intro once (about 1–2 cents the first time), then it&apos;s kept, free. In Read &amp; Big Picture the voice says it when a new amud begins, once per session.</div>
            </div>
            <div className="field">
              <label>Steps (a one-line summary above each move)</label>
              <Seg value={!s.outline ? 'off' : s.stepsMode === 'tap' ? 'tap' : 'auto'} options={[['off', 'Off'], ['tap', 'Tap to show'], ['auto', 'Always']]} onPick={(v) => onChange(v === 'off' ? { outline: false } : { outline: true, stepsMode: v as 'auto' | 'tap' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The AI summarizes each step of an amud or perek once (about 1–2 cents the first time), then it's kept, free. With Steps on, every long meforesh opened under a line (Ramban, Rashba, Maharsha…) also gets a “Steps” button that cuts it into its steps, the way Tosafos has (Extras → Tosafos steps). Tap to show: a small ✦ Step marker where each move begins; tap it to read, tap the note to fold it.</div>
            </div>
            <div className="field">
              <label>Pshat (the AI says it over, after each move)</label>
              <Seg value={!s.pshat ? 'off' : s.pshatMode === 'tap' ? 'tap' : 'auto'} options={[['off', 'Off'], ['tap', 'Tap to show'], ['auto', 'Always']]} onPick={(v) => onChange(v === 'off' ? { pshat: false } : { pshat: true, pshatMode: v as 'auto' | 'tap' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Like Steps, but after the words instead of before them: when a move of the Gemara ends, a short note says it over in plain words, the pshat, the way a chavrusa would. Made once per amud or perek (about 2–4 cents the first time), then kept, free. Tap to show: a small ✦ Pshat marker after the move; tap it to read, tap the note to fold it.</div>
            </div>
            <div className="field">
              <label>Commentary summaries (Rashi, Tosafos, Bartenura… in short English)</label>
              <Seg value={s.commSummary ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ commSummary: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>When you open a commentary, a sentence or two under each comment saying what it explains or asks (not a literal translation). Made once per commentator per amud (about 1–2 cents), then kept, free. Only for commentaries you open.</div>
            </div>
            </Group>
            <Group id="ai-write" level={2} title="How it writes" hint={`${(s.aiLang ?? 'en') === 'en' ? 'English' : s.aiLang === 'he' ? 'Hebrew' : 'English and Hebrew'}`}>
            <div className="field">
              <label>The AI writes in</label>
              <Seg value={s.aiLang ?? 'en'} options={[['en', 'English'], ['he', 'Hebrew'], ['both', 'Both']]} onPick={(v) => onChange({ aiLang: v as 'en' | 'he' | 'both' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Everything the AI writes on the screen: the chat, ✦ Chat, Explain, Ideas, the sugya map, outlines, steps, review questions, Chazara and notes. Both: the English, then the same in Hebrew. Quotes stay as written. The voice in a call stays in English. Things already made are made again in the new language the first time you open them (a few cents each), then kept.</div>
            </div>
            <div className="field">
              <label>Learn with me looks like</label>
              <Seg value={s.lwLook ?? 'inline'} options={[['inline', 'In the text'], ['bubble', 'Bubble'], ['panel', 'Panel'], ['cards', 'Cards']]} onPick={(v) => onChange({ lwLook: v as 'inline' | 'bubble' | 'panel' | 'cards' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In the text: opens right in the sefer, under the line you're on, and folds up with a ✓ when you go on to the next line. Panel: rises over the lower part of the page, the phrases one under the other. Cards: one card at a time over the page; swipe it off the screen and the next one comes up (its ✕ closes them).</div>
            </div>
            <div className="field">
              <label>Go deeper is made</label>
              <Seg value={s.lwDeepTogether ? 'together' : 'tap'} options={[['tap', 'When I tap it'], ['together', 'With the cards']]} onPick={(v) => onChange({ lwDeepTogether: v === 'together' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>When I tap it: each phrase’s Go deeper is written the first time you open it. With the cards: all of a line’s Go deepers are written together with its cards, so they open at once. With the cards is cheaper if you open Go deeper on most phrases (about two or more a line), and costs more if you rarely do. Either way each one is made once and kept. Lines already made are made again once.</div>
            </div>
            <div className="field">
              <label>Tone</label>
              <Seg value={s.lwTone ?? 'awake'} options={[['awake', 'Wake me up'], ['calm', 'Calm'], ['custom', 'My own']]} onPick={(v) => onChange({ lwTone: v as 'awake' | 'calm' | 'custom' })} />
              {s.lwTone === 'custom' && (() => {
                // Nov 18: up to four tones of his own, each with a name; one is in use at a time.
                const list = (s.customTones?.length ? s.customTones : (s.customTone ? [{ id: 't1', name: 'My tone', text: s.customTone }] : [])).slice(0, 4);
                // Nov 19: empty slots get steady names (not new ones every redraw, which wiped what he was typing).
                const used = new Set(list.map((t) => t.id));
                const fresh = (): string => { let k = 1; while (used.has(`s${k}`)) k++; used.add(`s${k}`); return `s${k}`; };
                const slots = [...list, ...Array.from({ length: 4 - list.length }, () => ({ id: fresh(), name: '', text: '' }))];
                const active = (list.some((t) => t.id === s.customToneId) ? s.customToneId : undefined) ?? list.find((t) => t.text === s.customTone)?.id;
                const save = (id: string, patch: { name?: string; text?: string }) => {
                  const next = slots.map((t) => (t.id === id ? { ...t, ...patch } : t)).filter((t) => t.text.trim() || t.name.trim());
                  // Nov 22: a tone he has just written (in an empty slot) is the one put in use: he had written a new one,
                  // the older one stayed "In use", and the new one seemed ignored.
                  const wroteNew = !!patch.text?.trim() && !slots.find((t) => t.id === id)?.text.trim();
                  const on = (wroteNew ? next.find((t) => t.id === id) : undefined) ?? next.find((t) => t.id === (active ?? id)) ?? next.find((t) => t.text.trim());
                  onChange({ customTones: next, ...(on ? { customTone: on.text.trim(), customToneId: on.id } : { customTone: '', customToneId: undefined }) });
                };
                return (
                  <div className="tone-slots">
                    {slots.map((t, i) => (
                      <div key={t.id} className={`tone-slot ${t.id === active && t.text.trim() ? 'on' : ''}`}>
                        <div className="tone-slot-head">
                          <input key={`n${t.id}${t.name}`} className="tone-name" defaultValue={t.name} placeholder={`Tone ${i + 1}: a name`} maxLength={40}
                            onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== t.name) save(t.id, { name: v }); }} />
                          {t.text.trim() && <button className={`tone-use ${t.id === active ? 'on' : ''}`} onClick={() => onChange({ customTone: t.text.trim(), customToneId: t.id })}>{t.id === active ? '✓ In use' : 'Use this'}</button>}
                        </div>
                        <textarea key={`x${t.id}${t.text}`} className="tone-box" rows={2} maxLength={500} defaultValue={t.text}
                          placeholder={i === 0 ? 'e.g. “like a Brisker rosh yeshiva, short and sharp”' : i === 1 ? 'e.g. “like a coach at halftime”' : i === 2 ? 'e.g. “explain it like I’m 12, with a joke now and then”' : 'e.g. “a warm grandfather telling a story”'}
                          onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== t.text) save(t.id, { text: v }); }} />
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>For Learn with me, the Steps and the amud intro. Wake me up: they pull you into the text, in a mix of voices: the rebbi who won’t let you coast (loud, in words), the detective, the sports commentator, the storyteller, dry humor; each ends with a hook into what comes next. Calm: plain and quiet. My own: describe any tone you like, in your words; anything goes within derech eretz (no cursing, no crude jokes, nothing improper), and a part that asks for that is left out. Each tone is made once and kept, so switching back finds it again.</div>
            </div>
            </Group>
            <Group id="ai-model" level={2} title="Depth and cost" hint={`${MODELS[s.provider][s.tier].label}${s.saver !== false ? ' · Saver' : ''}`}>
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
              <label>Made once and kept</label>
              <Seg value={s.keptModel ?? 'opus'} options={[['opus', 'Opus'], ['sonnet', 'Sonnet'], ['astra', 'Astra'], ['sol', 'Sol']]} onPick={(v) => onChange({ keptModel: v as 'opus' | 'sonnet' | 'astra' | 'sol' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Learn with me, Explain, Steps, Pshat, Big picture, sugya maps, ideas, review questions, summaries, intros, chazara and your own buttons. Each is made once, the first time it’s opened, then kept and free. Claude: Opus (the deepest; $4 / $20 a million words read / written) or Sonnet (half that). OpenAI: Astra (its top; $10 / $50) or Sol (Sonnet’s level and price). What each one made is kept apart, so switching back finds it again; switching to another makes things anew the first time.</div>
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
          </Group>
          </>
          )}

          {rest && <>
          <Group id="voice" title="Voice" hint={`${s.liveEngine === 'gemini' ? 'Gemini Live' : (LIVE_VOICES.find((v) => v.id === s.liveVoice)?.name ?? (s.customVoices ?? []).find((v) => v.id === s.liveVoice)?.name ?? s.liveVoice).replace(/ \(.*\)$/, '')} · ${({ slow: 'Slow', relaxed: 'Relaxed', natural: 'Normal', brisk: 'Brisk' } as Record<string, string>)[s.livePace ?? 'natural']} · pauses ${s.livePauses ?? 'normal'}`}>
            <div className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Live voice: natural, answers almost instantly, and can be interrupted. Choose GPT-Live or Gemini Live and the voice under Which voice.</div>
            <Group id="voice-face" level={2} title="His face in a call" hint={({ off: 'Off', drawn: 'Drawn', partner: 'Learning partner', mentor: 'Warm mentor', teacher: 'Contemporary teacher', young: 'Young chavrusa', companion: 'Warm companion', seasoned: 'Seasoned mentor', chassidish: 'Chassidish chavrusa', photo: 'My photo' } as Record<string, string>)[s.callFace ?? 'drawn']}>
              <div className="field">
                <div className="seg-grid"><Seg value={s.callFace ?? 'drawn'} options={[['off', 'Off'], ['drawn', 'Drawn'], ['partner', 'Partner'], ['mentor', 'Mentor'], ['teacher', 'Teacher'], ['young', 'Young'], ['companion', 'Companion'], ['seasoned', 'Seasoned'], ['chassidish', 'Chassidish'], ['photo', 'My photo']]} onPick={(v) => onChange({ callFace: v as NonNullable<Settings['callFace']> })} /></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In a voice call, your chavrusa’s face in the corner: its mouth moves with his voice, and it blinks and moves a little. Tap it to make it bigger; × hides it for that call. My photo: choose a portrait (a made-up person or one you have the right to use), then tap on his mouth once. The photo stays on this device. Nothing extra to pay.</div>
                {(s.callFace ?? 'drawn') !== 'off' && s.callFace !== 'photo' && <DrawnFacePreview kind={(s.callFace ?? 'drawn') as Exclude<NonNullable<Settings['callFace']>, 'off' | 'photo'>} />}
                {s.callFace === 'photo' && <FacePhotoPicker />}
              </div>
            </Group>
            <Group id="voice-which" level={2} title="Which voice" hint={s.liveEngine === 'gemini' ? `Gemini · ${GEMINI_VOICES.find((v) => v.id === s.geminiVoice)?.name ?? GEMINI_VOICES[0].name}` : (LIVE_VOICES.find((v) => v.id === s.liveVoice)?.name ?? (s.customVoices ?? []).find((v) => v.id === s.liveVoice)?.name ?? s.liveVoice).replace(/ \(.*\)$/, '')}>
              <div className="field">
                <label>Voice service for calls</label>
                <Seg value={s.liveEngine === 'gemini' ? 'gemini' : 'gpt'} options={[['gpt', 'GPT-Live'], ['gemini', 'Gemini Live']]} onPick={(v) => onChange({ liveEngine: v as 'gpt' | 'gemini' })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.liveEngine === 'gemini'
                  ? 'Gemini Live (Google): about 1–2¢ a minute for the voice, plus the AI model for learning turns.'
                  : 'GPT-Live (OpenAI): about 5¢ a minute for the voice, plus the AI model for learning turns.'}</div>
              </div>
              {s.liveEngine === 'gemini' ? (
                <GeminiSample value={s.geminiVoice} onPick={(v) => onChange({ geminiVoice: v })} />
              ) : (
                <div className="field">
                  <label>GPT-Live voice (tap ▶ to hear it; a sample costs about 1 cent)</label>
                  <VoicePicker kind="live" voices={[...(s.customVoices ?? []).map((v) => ({ id: v.id, name: `${v.name} (your design)` })), ...LIVE_VOICES]} value={s.liveVoice} onPick={(v) => onChange({ liveVoice: v })} disabled={liveActive} />
                </div>
              )}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A new voice applies the next time you tap Talk.</div>
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
            {lab && <button className="show-all" onClick={() => setVoiceMore(!voiceMore)}>{voiceMore ? 'Hide voice tests and fine-tuning ▴' : 'Voice tests and fine-tuning ▾'}</button>}
            {lab && voiceMore && (
              <>
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
            <Group id="voice-rec" level={2} title="Call recorder" hint="Send me a call's log">
              <CallLogs />
            </Group>
            {s.liveEngine === 'gemini' && <Group id="voice-gemini" level={2} title="Gemini pronunciation" hint="How Gemini says the words">
              <GeminiPronunciation s={s} onChange={onChange} />
            </Group>}
            <Group id="voice-call" level={2} title="During a call" hint={s.blankCall ? 'blank screen' : 'shows the conversation'}>
            <div className="field">
              <label>Screen during voice conversations</label>
              <Seg value={s.blankCall ? 'blank' : 'show'} options={[['show', 'Show the conversation'], ['blank', 'Blank (voice only)']]} onPick={(v) => onChange({ blankCall: v === 'blank' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Blank keeps the screen empty while you talk, for focus. It doesn't change the cost. Everything is still saved, so you can read it after the call.</div>
            </div>
            <div className="field">
              {renderToggles([
                ['darkCall', 'Dark call screen', 'When a call starts, the screen goes dark and quiet: the words being read, large, with Again, Pause and Go on. Tap “Text” to go back to the page. Works with every look.'],
                ['driveMode', 'Driving mode', 'A 🚗 button on the learning screen: big buttons, the screen kept on, and your headphone or car buttons work (play/pause, next = go on, back = say it again).'],
              ])}
            </div>
            <div style={{ margin: '4px 0 16px' }}>
              <label>Start a call from Siri</label>
              <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                For the car: one icon that opens the app at your place, ready to talk. On the iPhone: (1) open <b>{typeof window !== 'undefined' ? window.location.origin : ''}/?talk=1</b> in Safari and sign in; (2) tap Share, then <b>Add to Home Screen</b>, and name it <b>Learn</b>; (3) then say “Hey Siri, open Learn”. It opens with one big button: the phone needs that one tap before the microphone can start.
              </div>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { try { void navigator.clipboard.writeText(`${window.location.origin}/?talk=1`); } catch { /* optional */ } }}>Copy the address</button>
            </div>
            </Group>
              </>
            )}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Tap <b>Talk</b> at the top for a hands-free conversation: speak, pause, and your chavrusa answers out loud.</p>
          </Group>

          <Group id="extras" title="Your learning" hint="Notes, marks, progress, by heart, word meanings, offline">
            <div className="field">
              {renderToggles([
                ['byHeart', 'Learn by heart', 'A “🧠 By heart” button on each Mishnah and in Pirkei Avos: the words hide a little more each round until you say it all from memory. “Check me” listens (the phone’s own speech recognition, free) and marks the words you missed.'],
                ['marks', 'Color marks', 'Press and drag over words in a line, and pick Question (blue), Answer (green) or Key (yellow), like a pencil in a Gemara. The marks stay on the page and show in your Notebook. “Unmark” takes one off.'],
                ['wordTap', 'Word meanings', 'In a line that is open, or in a meforesh open under it, tap any Hebrew or Aramaic word to see what it means, from Jastrow’s dictionary. Tap an abbreviation (כה"ג, וי"ל, א"נ) and it is opened into its words. Free (no AI).'],
                ['notes', 'Notes on the line', 'Add a note to any line (tap the line, then ✎), or say “make a note: …” in a call. Lines with notes show ✎; all your notes are in the Library under My Notes.'],
                ['progress', 'Progress and plans', 'On Home: the amudim and perakim you have learned, your goals (“finish Yoma by …”), daf yomi, and a siyum when you finish.'],
                ['offline', 'Offline reading', 'A “Download” button on a masechta or sefer in the Library: read it with no internet (the chavrusa itself still needs internet).'],
                ['cacheTexts', 'Saved texts', 'Keep a copy of each text you open, so it still opens when Sefaria is slow or down. Free storage; refreshed monthly.'],
              ])}
            </div>
            <div style={{ margin: '4px 0 16px' }}>
              <label>Learning time goal</label>
              <Seg value={String(s.timeGoal ?? 0)} options={[['0', 'No goal'], ['20', '20 min'], ['30', '30 min'], ['60', '1 hour'], ['120', '2 hours']]} onPick={(v) => onChange({ timeGoal: Number(v) })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The app counts the time you learn (a page open and in use, or a call), and shows today and this week on Home. A goal adds a line that fills up through the day.</div>
            </div>
          </Group>
          <Group id="focus" title="Focus help" hint={[s.focusMode === 'window' && 'window', s.oneLine && 'one line', s.glowLine && 'glow', s.wins !== false && 'wins', s.fiveMin !== false && '5 minutes', s.sitWithMe !== false && 'sit with me'].filter(Boolean).join(' · ') || 'all off'}>
            <div className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>For getting into the learning and staying with it: helpful for ADHD, and for anyone on a distracted day.</div>
            <div className="field">
              <label>“Just {s.fiveLen ?? 5} minutes” on Home</label>
              <Seg value={s.fiveMin !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ fiveMin: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A button under Continue: it opens your place with a gentle timer at the top. When it’s up: keep going, more minutes, or done for now. Starting small makes starting easier.</div>
              {s.fiveMin !== false && <>
                <label style={{ marginTop: 10 }}>How long (minutes)</label>
                <Seg value={String(s.fiveLen ?? 5)} options={[['2', '2'], ['5', '5'], ['10', '10'], ['15', '15'], ['20', '20'], ['30', '30']]} onPick={(v) => onChange({ fiveLen: Number(v) })} />
              </>}
            </div>
            <div className="field">
              <label>Reading window</label>
              <Seg value={s.focusMode === 'window' ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ focusMode: v === 'on' ? 'window' : 'off', spotlight: false })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A clear oval across the middle of the screen; above and below it is shaded. Scroll the words you're on into it.</div>
              {s.focusMode === 'window' && (
                <>
                  <label style={{ marginTop: 10 }}>Window size</label>
                  <div className="range"><input type="range" min={1} max={9} value={s.windowSize ?? 5} onChange={(e) => onChange({ windowSize: Number(e.target.value) })} /><span>{s.windowSize ?? 5}</span></div>
                  <label style={{ marginTop: 6 }}>Shade</label>
                  <div className="range"><input type="range" min={1} max={9} value={s.windowDark ?? 5} onChange={(e) => onChange({ windowDark: Number(e.target.value) })} /><span>{s.windowDark ?? 5}</span></div>
                </>
              )}
            </div>
            <div className="field">
              <label>One line at a time</label>
              <Seg value={s.oneLine ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ oneLine: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Only the line you’re on is clear; the rest are faint. Next and Back at the bottom, or swipe sideways. Tap a faint line to go to it.</div>
            </div>
            <div className="field">
              <label>Soft glow on the line you’re on</label>
              <Seg value={s.glowLine ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ glowLine: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A gentle, slow glow on the line you tapped, the line the voice is on, or the line near the top as you scroll. It never blinks.</div>
            </div>
            <div className="field">
              <label>Small wins</label>
              <Seg value={s.wins !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ wins: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A quiet ✓ after each Step, every 5 lines and at the end of the amud, with how many days in a row you’ve learned (also on Home).</div>
            </div>
            <div className="field">
              <label>Where was I?</label>
              <Seg value={s.whereWasI !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ whereWasI: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In the ✦: a sentence or two on where you are in the sugya, to step back in without rereading. Offered by itself when you come back after 3 minutes away. Made once per line and kept (a fraction of a cent the first time).</div>
            </div>
            <div className="field">
              <label>Sit with me (voice)</label>
              <Seg value={s.sitWithMe !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ sitWithMe: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In the ✦: a quiet voice call. Your chavrusa keeps you company while you read on your own, answers if you ask, and checks in gently after a long quiet. The call isn’t paused for quiet, so it costs the voice’s usual rate the whole time (about 5¢ a minute with GPT-Live, 1–2¢ with Gemini Live).</div>
            </div>
            <div className="field">
              <label>Teasers while learning</label>
              <Seg value={s.teasers !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ teasers: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Now and then, a small card about the exact words you’re on, the way a chavrusa draws you in: a question to start a page, “What would you say?” before the Gemara answers, “Did you notice?”, a Rishon’s question, how it plays out today, and in Mishnah and Chumash, what changed in the case or what caught Rashi’s eye. About one for every two or three lines, shown as you reach them (not more often than every 40 seconds), never twice the same day. Made once per page and kept (a few cents the first time).</div>
            </div>
            <div className="field">
              <label>One line button on Home</label>
              <Seg value={s.homeOneLine !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ homeOneLine: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>☝ One line under Continue: opens your place showing just the line you’re on.</div>
            </div>
            <div className="field">
              <label>Days in a row on Home</label>
              <Seg value={s.homeStreak !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ homeStreak: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>🔥 How many days in a row you’ve learned, at the bottom of the Home card.</div>
            </div>
            <div className="field">
              <label>Reminder box on the Home card</label>
              <Seg value={s.homeTeaser !== false ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ homeTeaser: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A small box inside the Continue card on Home, to draw you back in: the question you left yourself, else your note on that page, else a short AI question about where you stopped. Off hides the box completely.</div>
            </div>
            {s.sitWithMe !== false && <div className="field">
              <label>Sit with me: check in after</label>
              <Seg value={String(s.sitCheck ?? 5)} options={[['3', '3 min'], ['5', '5 min'], ['10', '10 min']]} onPick={(v) => onChange({ sitCheck: Number(v) })} />
            </div>}
            <div className="field">
              <label>Progress line</label>
              <Seg value={s.amudBar ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ amudBar: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A thin line across the top of the reading screen that fills as you go through the amud or perek, so the end always feels reachable.</div>
            </div>
            <div className="field">
              <label>Today’s goal (lines)</label>
              <Seg value={s.goal ?? 'off'} options={[['off', 'Off'], ['3', '3'], ['5', '5'], ['10', '10'], ['step', '1 Step']]} onPick={(v) => onChange({ goal: v as 'off' | '3' | '5' | '10' | 'step' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A small, clear finish line for the day. A 🎯 at the top counts the new lines from where you start; when you get there it offers Stop here (your place is kept) or Keep learning. 1 Step means finish the Step you’re on; it needs Steps on (The AI → What it adds to the page); without them, 5 lines count as a Step.</div>
            </div>
            <div className="field">
              <label>Read along with the voice</label>
              <Seg value={s.readAlong ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ readAlong: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>In a voice call, the line the voice is on is gently lit and kept in the middle of the screen, so your eyes and ears stay together.</div>
            </div>
            <div className="field">
              <label>Quiet mode</label>
              <Seg value={s.quietMode ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => onChange({ quietMode: v === 'on' })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Only the text, with Next and Back. The ✦, the mic, the scroll button, the daf counter, the tabs at the bottom and the buttons under each line are hidden. The back arrow and ⋯ at the top stay, to get out.</div>
            </div>
          </Group>

          <Group id="inbox" title="Messages" hint="What people sent through Contact us">
            <Inbox />
          </Group>

          <Group id="credits" title="Credits (selling the app)" hint={s.billing ? 'on' : 'off'}>
            <Credits on={!!s.billing} onToggle={(on) => onChange(on ? { billing: true, billingSince: s.billingSince ?? new Date().toISOString() } : { billing: false })} />
          </Group>

          <Group id="memory" title="How I learn (your rules)" hint={memories ? `${memories.length} saved` : undefined}>
            <div className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Your learning rules. The chavrusa follows them in the chat, on a call, and in its answers on the cards (your questions, Say it over, What would you answer?). Add your own, or tap one to add it. It never marks anything as learned without asking you.</div>
            <div className="hil-chips">
              {["Let me translate before you help", "Explain unfamiliar Aramaic words", "Ask me to say it over after each step", "Keep answers short", "Don't translate Rashi", "Give me a hint before the answer"]
                .filter((r) => !memories?.some((m) => m.content.trim().toLowerCase() === r.toLowerCase()))
                .map((r) => <button key={r} className="hil-chip" onClick={() => void addMem(r)}>+ {r}</button>)}
            </div>
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
              <button className="btn" onClick={() => void addMem()}>Add</button>
            </div>
          </Group>

          <Group id="about" title="About and log out">
            <p className="muted" style={{ fontSize: 13 }}>This is an AI learning tool. It can make mistakes. Do not rely on it for accuracy in Torah learning, halacha, or hashkafa. For practical questions, ask your rav.</p>
            <p className="muted" style={{ fontSize: 13 }}><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a> · <a href="/terms" target="_blank" rel="noreferrer">Terms of use</a> · <a href="/credits">Credits and licenses</a> · <a href="/contact">Contact us</a> · <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('chavrusa-guide-go')); }}>How to use the app</a></p>
            <button className="btn" onClick={() => { window.location.href = '/api/logout'; }}>Log out</button>
          </Group>
          <div style={{ margin: '18px 4px 8px' }}>
            <button className="linklike" onClick={() => setLab(!lab)}>{lab ? 'Leave the Lab' : 'Lab: other looks and voice tests'}</button>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{lab ? 'The Lab is on for this phone: every look and all the voice tests and fine-tuning show.' : 'Every other look and the voice tests are kept in the Lab, on this phone only.'}</div>
          </div>
          </>}
          </GroupList>
        </div>
      </div>
    </>
  );
}

// Design a Live voice from a description (OpenAI creates it in your account).
// Fonts, each shown in its own letters: the current one, and a list to choose from when tapped.
function FontPicker({ list, sample, value, onPick, rtl }: { list: { id: string; name: string; stack: string; italic?: boolean; heavy?: boolean }[]; sample: string; value: string; onPick: (id: string) => void; rtl?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = list.find((f) => f.id === value) ?? list[0];
  const row = (f: { id: string; name: string; stack: string; italic?: boolean; heavy?: boolean }) => (
    <>
      <span className="fp-sample" dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: f.stack || (rtl ? 'var(--f-he)' : 'var(--f-body)'), fontStyle: f.italic ? 'italic' : 'normal', fontWeight: f.heavy ? 900 : undefined }}>{sample}</span>
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


// Back and forth: your own questions (Nov 15). Each shows with the suggested questions when Back and forth opens.
function MyQuestions({ list, onChange }: { list: string[]; onChange: (l: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => { const q = draft.trim().slice(0, 120); if (!q || list.includes(q)) return; onChange([...list, q].slice(0, 12)); setDraft(''); };
  return (
    <div style={{ margin: '4px 0 16px' }}>
      <label>Your own questions in Back and forth</label>
      <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>They show with the suggested questions every time Back and forth opens, on any sefer. For example: “How does the Chazon Ish learn this?” or “What would my rebbi ask here?”</div>
      {list.map((q, i) => (
        <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 14 }} dir="auto">{q}</span>
          <button className="btn ghost" onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label={`Remove ${q}`}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Write a question" style={{ flex: 1 }} />
        <button className="btn" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </div>
  );
}

// Back and forth: take out suggested questions you don't want (Nov 15). Tap one to hide it; tap again to bring it back.
function HideQuestions({ hidden, onChange }: { hidden: string[]; onChange: (l: string[]) => void }) {
  return (
    <div style={{ margin: '4px 0 16px' }}>
      <label>Suggested questions in Back and forth</label>
      <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>Tap a question to take it out; tap it again to bring it back. Crossed out ones don’t show.</div>
      {ALL_STARTERS.map(([kind, qs]) => (
        <div key={kind} style={{ marginBottom: 8 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{kind}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {qs.map((q) => {
              const off = hidden.includes(q);
              return <button key={kind + q} className="btn ghost" style={{ fontSize: 13, textDecoration: off ? 'line-through' : 'none', opacity: off ? 0.55 : 1 }} aria-pressed={!off}
                onClick={() => onChange(off ? hidden.filter((x) => x !== q) : [...hidden, q])}>{q}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
