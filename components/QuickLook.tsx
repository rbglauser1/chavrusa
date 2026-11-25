'use client';
// Nov 23: the "Aa" button beside ⋯ in the sefer's header: the reading options he reaches for most, one tap away, without
// going into Settings: Hebrew and English or Hebrew only, how the English is laid out (under the line, sentence by
// sentence, phrase by phrase), under each piece the full English or only the translation, the translation in bold,
// nikud, and the size of the Hebrew and the English. Nov 24: the meforshim (tap a line / under every line) and the
// ✦ AI buttons on the lines (every line / the line I tap / off). "All settings" for the rest.
import { useEffect, useRef } from 'react';
import { isSefariaLook, sefariaLook, type Settings } from '@/lib/config';

type Opt<T extends string> = [T, string][];
function Row<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: Opt<T>; onPick: (v: T) => void }) {
  return (
    <div className="ql-row">
      <span className="ql-label">{label}</span>
      <div className="ql-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, name]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{name}</button>
        ))}
      </div>
    </div>
  );
}
function Size({ label, value, min, max, onSet, sample, he }: { label: string; value: number; min: number; max: number; onSet: (v: number) => void; sample: string; he?: boolean }) {
  return (
    <div className="ql-row ql-size">
      <span className="ql-label">{label}</span>
      <div className="ql-steps">
        <button onClick={() => onSet(Math.max(min, value - 2))} disabled={value <= min} aria-label={`${label} smaller`}>A−</button>
        <span className={he ? 'he' : ''} style={{ fontSize: Math.min(value, 30) }} dir={he ? 'rtl' : 'ltr'}>{sample}</span>
        <button onClick={() => onSet(Math.min(max, value + 2))} disabled={value >= max} aria-label={`${label} bigger`}>A+</button>
      </div>
    </div>
  );
}

export default function QuickLook({ settings: s, onSet, onAll, onClose }: { settings: Settings; onSet: (p: Partial<Settings>) => void; onAll: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.ql-btn')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const en = s.seferEnglish !== false;
  const layout = s.interlinear ? (s.ilBy === 'sentence' ? 'sentence' : 'phrase') : 'line';
  return (
    <div ref={box} className="ql" role="dialog" aria-label="Reading options">
      <button className={`ql-sefaria ${isSefariaLook(s) ? 'on' : ''}`} onClick={() => onSet(sefariaLook(s))}>{isSefariaLook(s) ? '✓ Sefaria look' : 'Make it look like Sefaria'}<small>Taamey Frank · Garamond 18 · bold translation</small></button>
      <Row label="Show" value={en ? 'both' : 'he'} options={[['both', 'Hebrew + English'], ['he', 'Hebrew only']]} onPick={(v) => onSet({ seferEnglish: v === 'both' })} />
      {en && (
        <>
          <Row label="English" value={layout} options={[['line', 'Under the line'], ['sentence', 'By sentence'], ['phrase', 'By phrase']]}
            onPick={(v) => onSet(v === 'line' ? { interlinear: false } : { interlinear: true, ilBy: v as 'phrase' | 'sentence' })} />
          {s.interlinear && (
            <Row label={`Under each ${layout === 'sentence' ? 'sentence' : 'phrase'}`} value={s.ilEn ?? (s.enMark === 'only' ? 'only' : 'full')}
              options={[['full', 'Full English'], ['only', 'Translation only']]} onPick={(v) => onSet({ ilEn: v as 'full' | 'only' })} />
          )}
          <Row label="Translation" value={s.enBold === false ? 'off' : 'on'} options={[['on', 'Bold'], ['off', 'Not bold']]} onPick={(v) => onSet({ enBold: v === 'on' })} />
        </>
      )}
      <Row label="Meforshim (Rashi, Tosafos…)" value={s.autoComms ? 'all' : 'tap'} options={[['tap', 'When I tap a line'], ['all', 'Under every line']]} onPick={(v) => onSet({ autoComms: v === 'all' })} />
      <Row label="✦ AI buttons on the lines (Step, Pshat, In my words)" value={s.lineAi ?? 'all'} options={[['all', 'Every line'], ['tap', 'Line I tap'], ['off', 'Off']]} onPick={(v) => onSet({ lineAi: v as 'all' | 'tap' | 'off' })} />
      {(s.lineAi ?? 'all') !== 'off' && <Row label="✦ In my words? (end of each line)" value={s.sayIt === false ? 'off' : 'on'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onSet({ sayIt: v === 'on' })} />}
      <Row label="Color the give and take ✦ AI" value={s.flowColors ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onSet({ flowColors: v === 'on' })} />
      <Row label="Nikud" value={s.nikud ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onPick={(v) => onSet({ nikud: v === 'on' })} />
      <Size label="Hebrew size" value={s.heSize} min={16} max={52} onSet={(v) => onSet({ heSize: v })} sample="אבג" he />
      {en && <Size label="English size" value={s.enSize} min={13} max={24} onSet={(v) => onSet({ enSize: v })} sample="Abc" />}
      <Size label="AI text size (✦ In my words, notes, answers)" value={s.aiSize ?? Math.max(17, s.enSize)} min={14} max={32} onSet={(v) => onSet({ aiSize: v })} sample="✦ Abc" />
      <button className="ql-all" onClick={() => { onClose(); onAll(); }}>All settings ›</button>
    </div>
  );
}
