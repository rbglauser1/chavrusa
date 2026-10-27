'use client';
import { useEffect, useRef, useState } from 'react';
import type { SourceData } from '@/lib/db';
import Library, { jumpLibrary, libraryTrail } from './Library';
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
  onOpenExact?: (ref: string) => Promise<string | { message: string; approvable?: string } | null>; // an exact Sefaria reference (Library)
  libraryRequest?: number; // changes when the page asks to open the Library
  talk?: { on: boolean; toggle: () => void; status: string }; // start or end a voice call from here
  onPoint?: (src: SourceData, n: number) => void; // the learner tapped a line: learn from here
}

export default function SeferPanel({ sources, selected, onSelect, onClose, settings, onSettings, sessionId, onOpenRef, onOpenExact, libraryRequest, talk, onPoint }: Props) {
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
  // Full screen: just the text, with a small bar for Talk and Exit. (Also asks the browser for full screen where it can.)
  const [full, setFullState] = useState(false);
  function setFull(on: boolean) {
    setFullState(on);
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch { /* not supported (e.g. iPhone): the app's own full screen still works */ }
  }
  const [libUsed, setLibUsed] = useState(false); // load the library only once it's first opened
  useEffect(() => { if (showLib) setLibUsed(true); }, [showLib]);
  useEffect(() => { if (libraryRequest) setShowLib(true); }, [libraryRequest]);
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

  // Commentaries on each part, like Sefaria's side panel: which ones exist comes from Sefaria's links for this
  // perek / amud / siman; tapping one opens its words right under the line (free, straight from Sefaria, no AI).
  type Comm = { loading?: boolean; he?: string[]; en?: string[]; empty?: boolean; error?: string; refs?: string[] };
  const [comm, setComm] = useState<Record<string, Comm>>({});
  const [conns, setConns] = useState<Record<string, { title: string; refs: string[] }[]> | null>(null);
  const [listOpen, setListOpen] = useState<number | null>(null);
  const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
  const isComm = !!src && / on /i.test(src.ref);
  const kind = !src || isComm ? 'none' : /^Mishnah /.test(src.ref) ? 'mishnah' : /\d+[ab](:|$)/.test(src.ref) ? 'gemara' : TANAKH.test(src.ref) ? 'tanakh' : 'other';
  // Until Sefaria's list arrives (or if it can't be reached), the usual ones.
  const fallback: [string, string][] = kind === 'mishnah' ? [['bartenura', 'Bartenura'], ['tyt', 'Tosfos Yom Tov']]
    : kind === 'gemara' ? [['rashi', 'Rashi'], ['tosafot', 'Tosafos']]
    : kind === 'tanakh' ? [['rashi', 'Rashi'], ['ramban', 'Ramban']] : [];
  useEffect(() => {
    setConns(null); setListOpen(null);
    if (!src || isComm) return;
    let gone = false;
    fetch(`/api/connections?ref=${encodeURIComponent(src.ref)}`).then((r) => r.json())
      .then((d) => { if (!gone) setConns(d.lines && Object.keys(d.lines).length ? d.lines : d.error ? null : {}); })
      .catch(() => {});
    return () => { gone = true; };
  }, [src?.ref, isComm]);
  // The reference of part i: "Mishnah Peah 1" + 4 -> "Mishnah Peah 1:4"; "Genesis 1:3-7" + 0 -> "Genesis 1:3".
  function partRef(i: number): string {
    if (!src) return '';
    const m = src.ref.match(/^(.*?):(\d+)(?:-\d+)?$/);
    return m ? `${m[1]}:${Number(m[2]) + i}` : `${src.ref}:${i + 1}`;
  }
  const partNum = (i: number) => partRef(i).match(/:(\d+)$/)?.[1] ?? String(i + 1);
  // Printed-sefer names for Sefaria's titles.
  const NICE: Record<string, string> = { Tosafot: 'Tosafos', 'Tosafot Yom Tov': 'Tosfos Yom Tov', 'Turei Zahav': 'Taz', 'Siftei Kohen': 'Shach', 'Magen Avraham': 'Magen Avraham', 'Be\'er HaGolah': 'Be\'er HaGolah', 'Mishnah Berurah': 'Mishnah Berurah', 'Sha\'ar HaTziyun': 'Sha\'ar HaTziyun', 'Biur Halacha': 'Biur Halacha', 'Onkelos': 'Onkelos', 'Rabbeinu Bahya': 'Rabbeinu Bachya', 'Sforno': 'Sforno', 'Rashbam': 'Rashbam' };
  const nice = (t: string) => NICE[t] ?? t;
  const FIRST = ['Rashi', 'Tosafot', 'Bartenura', 'Onkelos', 'Ramban', 'Mishnah Berurah', 'Magen Avraham', 'Turei Zahav', 'Siftei Kohen', 'Tosafot Yom Tov', 'Rashbam', 'Ibn Ezra', 'Sforno', 'Biur Halacha', 'Sha\'ar HaTziyun', 'Ba\'er Hetev', 'Be\'er Hetev'];
  const rank = (t: string) => { const k = FIRST.indexOf(t); return k < 0 ? 99 : k; };
  function lineComms(i: number) {
    const list = [...(conns?.[partNum(i)] ?? [])];
    return list.sort((x, y) => rank(x.title) - rank(y.title) || x.title.localeCompare(y.title));
  }
  async function openComm(i: number, label: string, url: string, refs?: string[]) {
    const key = `${i}:${label}`;
    if (comm[key]) { setComm((c) => { const n = { ...c }; delete n[key]; return n; }); return; }
    setComm((c) => ({ ...c, [key]: { loading: true, refs } }));
    try {
      const r = await fetch(url).then((x) => x.json());
      setComm((c) => ({ ...c, [key]: r.error ? { error: r.error } : r.empty ? { empty: true } : { he: r.he, en: r.en, refs } }));
    } catch { setComm((c) => ({ ...c, [key]: { error: 'Could not load it.' } })); }
  }
  const openLinked = (i: number, x: { title: string; refs: string[] }) =>
    openComm(i, nice(x.title), `/api/commentary?refs=${encodeURIComponent(x.refs.join('|'))}`, x.refs);
  const openUsual = (i: number, who: string, label: string) =>
    openComm(i, label, `/api/commentary?ref=${encodeURIComponent(partRef(i))}&who=${who}`);
  const rashi = !!src && /^(Rashi|Tosafot|Tosafos|Rashbam|Ran|Rosh) on /i.test(src.ref);

  async function aiTranslate(key: string, text: string) {
    setLoading(key);
    try {
      const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sessionId }) });
      const data = await res.json();
      setAiText((m) => ({ ...m, [key]: data.translation ?? data.error ?? 'Translation failed.' }));
    } finally { setLoading(null); }
  }

  // Tap a line: that's where we learn from (highlighted; the Chavrusa and the voice start there).
  // With translations hidden, the tap also shows that line's translation.
  function toggleLine(i: number) {
    if (src && onPoint && !/ on /i.test(src.ref)) onPoint(src, i + 1);
    if (!canTranslate || showAll) return;
    setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <aside className={`sefer ${full ? 'full' : ''}`} aria-label="Sefer">
      {full && (
        <div className="full-bar">
          {talk && (
            <button className={`chip talk ${talk.on ? 'live' : ''}`} onClick={talk.toggle} aria-pressed={talk.on}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              {talk.on ? (talk.status ? `${talk.status} · End` : 'End talk') : 'Talk'}
            </button>
          )}
          <button className="chip" onClick={() => setFull(false)} aria-label="Exit full screen">⤡ Exit</button>
        </div>
      )}
      <div className="sefer-head">
        <h2>Sefer</h2>
        <button className="btn lib-open" onClick={() => setShowLib((v) => !v)} aria-pressed={showLib}>📚 Library</button>
        <button className="btn" onClick={() => setFull(true)} aria-label="Full screen" title="Full screen">⤢</button>
        {talk && (
          <button className={`chip talk ${talk.on ? 'live' : ''}`} onClick={talk.toggle} aria-pressed={talk.on} title={talk.status || undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {talk.on ? (talk.status ? `${talk.status} · End` : 'End talk') : 'Talk'}
          </button>
        )}
        {src && <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open on Sefaria ↗</a>}
        <button className="icon-btn" onClick={onClose} aria-label="Close sefer">✕</button>
      </div>

      <form className="goto" onSubmit={submitGoto}>
        <input id="goto-ref" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to… e.g. Berachos 36a" dir="auto" aria-label="Open a source" />
        <button className="btn" disabled={!goto.trim() || gotoBusy}>{gotoBusy ? 'Opening…' : 'Open'}</button>
      </form>
      {gotoMsg && <div className="goto-msg">{gotoMsg}</div>}

      {/* The library stays where you left it (hidden, not closed), so you can go back up a level later. */}
      {libUsed && <div style={showLib ? { display: 'contents' } : { display: 'none' }}><Library onOpen={onOpenExact ?? onOpenRef} onClose={() => setShowLib(false)} /></div>}

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
            {onPoint ? 'Tap a line to learn from there' : canTranslate ? (showAll ? 'Translation under each part' : 'Tap a line to translate it') : 'Original only'}
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
            {libUsed && libraryTrail().length > 0 && (
              <div className="lib-trail">
                <button onClick={() => setShowLib(true)}>📚</button>
                {libraryTrail().map((c, i) => (
                  <span key={i}><span className="sep">›</span><button onClick={() => { jumpLibrary(i); setShowLib(true); }}>{c}</button></span>
                ))}
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
                  {(() => {
                    if (kind === 'none') return null;
                    const all = conns ? lineComms(i) : [];
                    const quick = conns ? all.slice(0, 3) : [];
                    return (
                      <div className="comm-btns" onClick={(e) => e.stopPropagation()}>
                        {conns === null && fallback.map(([who, label]) => (
                          <button key={who} className={`comm-btn ${comm[`${i}:${label}`] ? 'on' : ''}`} onClick={() => openUsual(i, who, label)}>{label}</button>
                        ))}
                        {quick.map((x) => (
                          <button key={x.title} className={`comm-btn ${comm[`${i}:${nice(x.title)}`] ? 'on' : ''}`} onClick={() => openLinked(i, x)}>{nice(x.title)}</button>
                        ))}
                        {all.length > quick.length && (
                          <button className={`comm-btn more ${listOpen === i ? 'on' : ''}`} onClick={() => setListOpen((v) => (v === i ? null : i))}>
                            Commentaries ({all.length}) {listOpen === i ? '▴' : '▾'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {listOpen === i && (
                    <div className="comm-list" onClick={(e) => e.stopPropagation()}>
                      {lineComms(i).map((x) => (
                        <button key={x.title} className={`comm-btn ${comm[`${i}:${nice(x.title)}`] ? 'on' : ''}`} onClick={() => openLinked(i, x)}>{nice(x.title)}</button>
                      ))}
                    </div>
                  )}
                  {(Object.entries(comm) as [string, Comm][]).filter(([k]) => k.startsWith(`${i}:`)).map(([k, c]) => {
                    const label = k.slice(k.indexOf(':') + 1);
                    return (
                      <div key={k} className="comm" onClick={(e) => e.stopPropagation()}>
                        <div className="comm-title">
                          {label}
                          {c.refs?.length && onOpenExact ? (
                            <button className="comm-learn" onClick={() => void onOpenExact(c.refs![0].replace(/:\d+(-\d+)?$/, '') || c.refs![0])}>Learn it in the Sefer ↗</button>
                          ) : null}
                          <button className="comm-x" aria-label={`Close ${label}`} onClick={() => setComm((m) => { const n = { ...m }; delete n[k]; return n; })}>✕</button>
                        </div>
                        {c.loading ? <div className="muted">Opening…</div>
                          : c.error ? <div className="muted">{c.error}</div>
                          : c.empty ? <div className="muted">No {label} on this part on Sefaria.</div>
                          : (c.he ?? []).map((h, k2) => (
                            <div key={k2} className="comm-line">
                              <div className="he rashi">{settings.nikud ? h : stripNikud(h)}</div>
                              {showAll && c.en?.[k2] && <div className="en">{c.en[k2]}</div>}
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
