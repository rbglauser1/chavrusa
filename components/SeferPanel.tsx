'use client';
import { useEffect, useRef, useState } from 'react';
import type { SourceData } from '@/lib/db';
import Library from './Library';
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
  const [showLib, setShowLib] = useState(false);
  const [libUsed, setLibUsed] = useState(false); // load the library only once it's first opened
  useEffect(() => { if (showLib) setLibUsed(true); }, [showLib]);
  // Approve a translation Sefaria has (e.g. Rabbi Aryeh Kaplan's), then reload this text with it.
  const [approving, setApproving] = useState(false);
  async function approve(title: string, ref: string) {
    setApproving(true);
    try {
      await fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ translation: title }) });
      await onOpenRef(ref);
    } finally { setApproving(false); }
  }
  const [open, setOpen] = useState<Set<number>>(new Set());
  const showAll = settings.seferEnglish !== false; // translation under each part (Settings, or the toggle here)
  const setShowAll = (f: (v: boolean) => boolean) => onSettings({ seferEnglish: f(showAll) });
  const [aiText, setAiText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => { setOpen(new Set()); setComm({}); }, [selected, src?.ref]);
  // Scroll to the line the learner is on (and highlight it).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!src?.focus) return;
    const t = window.setTimeout(() => bodyRef.current?.querySelector(`[data-line="${src.focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(t);
  }, [src?.ref, src?.focus, selected]);

  const canTranslate = settings.display !== 'off';

  // Commentary on one part, opened right under it (free, straight from Sefaria).
  const [comm, setComm] = useState<Record<string, { loading?: boolean; he?: string[]; en?: string[]; empty?: boolean; error?: string }>>({});
  const kind = !src ? 'none' : /^Mishnah /.test(src.ref) ? 'mishnah' : / on /i.test(src.ref) ? 'none' : /\d+[ab](:|$)/.test(src.ref) ? 'gemara' : 'tanakh';
  const buttons: [string, string][] = kind === 'mishnah' ? [['bartenura', 'Bartenura'], ['tyt', 'Tosfos Yom Tov']]
    : kind === 'gemara' ? [['rashi', 'Rashi'], ['tosafot', 'Tosafos']]
    : kind === 'tanakh' ? [['rashi', 'Rashi'], ['ramban', 'Ramban']] : [];
  // The reference of part i: "Mishnah Peah 1" + 4 -> "Mishnah Peah 1:4"; "Genesis 1:3-7" + 0 -> "Genesis 1:3".
  function partRef(i: number): string {
    if (!src) return '';
    const m = src.ref.match(/^(.*?):(\d+)(?:-\d+)?$/);
    return m ? `${m[1]}:${Number(m[2]) + i}` : `${src.ref}:${i + 1}`;
  }
  async function toggleComm(i: number, who: string) {
    const key = `${i}:${who}`;
    if (comm[key]) { setComm((c) => { const n = { ...c }; delete n[key]; return n; }); return; }
    setComm((c) => ({ ...c, [key]: { loading: true } }));
    try {
      const r = await fetch(`/api/commentary?ref=${encodeURIComponent(partRef(i))}&who=${who}`).then((x) => x.json());
      setComm((c) => ({ ...c, [key]: r.error ? { error: r.error } : r.empty ? { empty: true } : { he: r.he, en: r.en } }));
    } catch { setComm((c) => ({ ...c, [key]: { error: 'Could not load it.' } })); }
  }
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
        <button className="btn lib-open" onClick={() => setShowLib((v) => !v)} aria-pressed={showLib}>📚 Library</button>
        {src && <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open on Sefaria ↗</a>}
        <button className="icon-btn" onClick={onClose} aria-label="Close sefer">✕</button>
      </div>

      <form className="goto" onSubmit={submitGoto}>
        <input id="goto-ref" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to… e.g. Berachos 36a" dir="auto" aria-label="Open a source" />
        <button className="btn" disabled={!goto.trim() || gotoBusy}>{gotoBusy ? 'Opening…' : 'Open'}</button>
      </form>
      {gotoMsg && <div className="goto-msg">{gotoMsg}</div>}

      {/* The library stays where you left it (hidden, not closed), so you can go back up a level later. */}
      {libUsed && <div style={showLib ? { display: 'contents' } : { display: 'none' }}><Library onOpen={onOpenRef} onClose={() => setShowLib(false)} /></div>}

      {!showLib && sources.length > 0 && (
        <div className="sefer-tabs">
          {sources.map((s, i) => (
            <button key={`${s.ref}-${i}`} className={`sefer-tab ${i === selected ? 'on' : ''}`} onClick={() => onSelect(i)}>{s.ref}</button>
          ))}
        </div>
      )}

      {!showLib && src && (
        <div className="sefer-tools">
          <button className={`toggle ${settings.nikud ? 'on' : ''}`} onClick={() => onSettings({ nikud: !settings.nikud })}>Nikud {settings.nikud ? 'on' : 'off'}</button>
          {canTranslate && (
            <button className={`toggle ${showAll ? 'on' : ''}`} onClick={() => setShowAll((v) => !v)}>Translation {showAll ? 'on' : 'off'}</button>
          )}
          <span className="muted" style={{ alignSelf: 'center' }}>
            {canTranslate ? (showAll ? 'Translation under each part' : 'Tap a line to translate it') : 'Original only'}
          </span>
        </div>
      )}

      <div className="sefer-body" ref={bodyRef} style={showLib ? { display: 'none' } : undefined}>
        {!src && <div className="empty">Sources your chavrusa brings will appear here.</div>}
        {src && (
          <>
            {!src.en.length && src.altEn?.length && src.altTitle && canTranslate && (
              <div className="alt-note">
                English shown: <b>{src.altTitle}</b>. It isn't on your approved list yet, so the Chavrusa won't quote it.
                <button className="btn" disabled={approving} onClick={() => approve(src.altTitle as string, src.ref)}>{approving ? 'Approving…' : 'Approve this translation'}</button>
              </div>
            )}
            <div className="sefer-title">
              <div className="he">{src.heRef}</div>
              <small>{src.ref}{src.translation ? ` · Translation: ${src.translation}` : ''}</small>
            </div>
            {src.he.map((line, i) => {
              const isOpen = canTranslate && (showAll || open.has(i));
              const en = src.en[i] || (src.en.length ? undefined : src.altEn?.[i]);
              const key = `${src.ref}#${i}`;
              return (
                <div key={i} data-line={i + 1} className={`line ${open.has(i) ? 'open' : ''} ${src.focus === i + 1 ? 'focus' : ''}`} onClick={() => toggleLine(i)}>
                  <div className={`he ${rashi ? 'rashi' : ''}`}>{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                  {buttons.length > 0 && (
                    <div className="comm-btns" onClick={(e) => e.stopPropagation()}>
                      {buttons.map(([who, label]) => (
                        <button key={who} className={`comm-btn ${comm[`${i}:${who}`] ? 'on' : ''}`} onClick={() => toggleComm(i, who)}>{label}</button>
                      ))}
                    </div>
                  )}
                  {buttons.map(([who, label]) => {
                    const c = comm[`${i}:${who}`];
                    if (!c) return null;
                    return (
                      <div key={who} className="comm" onClick={(e) => e.stopPropagation()}>
                        <div className="comm-title">{label}</div>
                        {c.loading ? <div className="muted">Opening…</div>
                          : c.error ? <div className="muted">{c.error}</div>
                          : c.empty ? <div className="muted">No {label} on this part on Sefaria.</div>
                          : (c.he ?? []).map((h, k) => (
                            <div key={k} className="comm-line">
                              <div className="he rashi">{settings.nikud ? h : stripNikud(h)}</div>
                              {showAll && c.en?.[k] && <div className="en">{c.en[k]}</div>}
                            </div>
                          ))}
                      </div>
                    );
                  })}
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
