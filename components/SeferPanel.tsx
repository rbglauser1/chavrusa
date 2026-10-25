'use client';
import { useEffect, useRef, useState } from 'react';
import type { SourceData } from '@/lib/db';
import type { Settings } from '@/lib/config';
import { stripNikud } from '@/lib/hebrew';

interface Props {
  sources: SourceData[];
  selected: number;
  onSelect: (i: number) => void;
  onClose: () => void;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  sessionId: string | null;
  onOpenRef: (q: string) => Promise<string | null>; // returns an error message, or null when opened
}

export default function SeferPanel({ sources, selected, onSelect, onClose, settings, onSettings, sessionId, onOpenRef }: Props) {
  const [goto, setGoto] = useState('');
  const [gotoBusy, setGotoBusy] = useState(false);
  const [gotoMsg, setGotoMsg] = useState('');
  async function submitGoto(e: React.FormEvent) {
    e.preventDefault();
    if (!goto.trim() || gotoBusy) return;
    setGotoBusy(true); setGotoMsg('');
    const err = await onOpenRef(goto.trim());
    setGotoBusy(false);
    if (err) setGotoMsg(err); else setGoto('');
  }
  const src = sources[selected];
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [aiText, setAiText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => { setOpen(new Set()); setShowAll(false); }, [selected, src?.ref]);
  // Scroll to the line the learner is on (and highlight it).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!src?.focus) return;
    const t = window.setTimeout(() => bodyRef.current?.querySelector(`[data-line="${src.focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(t);
  }, [src?.ref, src?.focus, selected]);

  const canTranslate = settings.display === 'toggle';
  const rashi = !!src && /^(Rashi|Tosafot|Tosafos|Rashbam|Ran|Rosh) on /i.test(src.ref);

  async function aiTranslate(key: string, text: string) {
    setLoading(key);
    try {
      const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sessionId }) });
      const data = await res.json();
      setAiText((m) => ({ ...m, [key]: data.translation ?? data.error ?? 'Translation failed.' }));
    } finally { setLoading(null); }
  }

  function toggleLine(i: number) {
    if (!canTranslate) return;
    setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <aside className="sefer" aria-label="Sefer">
      <div className="sefer-head">
        <h2>Sefer</h2>
        {src && <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open on Sefaria ↗</a>}
        <button className="icon-btn" onClick={onClose} aria-label="Close sefer">✕</button>
      </div>

      <form className="goto" onSubmit={submitGoto}>
        <input id="goto-ref" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to… e.g. Berachos 36a" dir="auto" aria-label="Open a source" />
        <button className="btn" disabled={!goto.trim() || gotoBusy}>{gotoBusy ? 'Opening…' : 'Open'}</button>
      </form>
      {gotoMsg && <div className="goto-msg">{gotoMsg}</div>}

      {sources.length > 0 && (
        <div className="sefer-tabs">
          {sources.map((s, i) => (
            <button key={`${s.ref}-${i}`} className={`sefer-tab ${i === selected ? 'on' : ''}`} onClick={() => onSelect(i)}>{s.ref}</button>
          ))}
        </div>
      )}

      {src && (
        <div className="sefer-tools">
          <button className={`toggle ${settings.nikud ? 'on' : ''}`} onClick={() => onSettings({ nikud: !settings.nikud })}>Nikud {settings.nikud ? 'on' : 'off'}</button>
          {canTranslate && (
            <button className={`toggle ${showAll ? 'on' : ''}`} onClick={() => setShowAll((v) => !v)}>Translation {showAll ? 'on' : 'off'}</button>
          )}
          <span className="muted" style={{ alignSelf: 'center' }}>
            {canTranslate ? 'Tap a line to translate it' : 'Original only'}
          </span>
        </div>
      )}

      <div className="sefer-body" ref={bodyRef}>
        {!src && <div className="empty">Sources your chavrusa brings will appear here.</div>}
        {src && (
          <>
            <div className="sefer-title">
              <div className="he">{src.heRef}</div>
              <small>{src.ref}{src.translation ? ` · Translation: ${src.translation}` : ''}</small>
            </div>
            {src.he.map((line, i) => {
              const isOpen = canTranslate && (showAll || open.has(i));
              const en = src.en[i];
              const key = `${src.ref}#${i}`;
              return (
                <div key={i} data-line={i + 1} className={`line ${open.has(i) ? 'open' : ''} ${src.focus === i + 1 ? 'focus' : ''}`} onClick={() => toggleLine(i)}>
                  <div className={`he ${rashi ? 'rashi' : ''}`}>{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                  {isOpen && (
                    <div className="en" onClick={(e) => e.stopPropagation()}>
                      {en ? en : aiText[key] ? (
                        <><span className="label-ai">AI translation</span><div>{aiText[key]}</div></>
                      ) : (
                        <button className="btn" disabled={loading === key} onClick={() => aiTranslate(key, line)}>
                          {loading === key ? 'Translating…' : 'No approved translation · AI translate this line'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {src.he.length === 0 && src.en.map((l, i) => <div key={i} className="line"><div>{l}</div></div>)}
          </>
        )}
      </div>
    </aside>
  );
}
