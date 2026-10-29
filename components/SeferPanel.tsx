'use client';
import { useEffect, useRef, useState } from 'react';
import type { SourceData } from '@/lib/db';
import Library, { jumpLibrary, libraryTrail } from './Library';
import type { Settings } from '@/lib/config';
import { stripNikud, yeshivishEnglish } from '@/lib/hebrew';
import { nextSection, prevSection, sectionWord } from '@/lib/refs';
import { useOutline } from './useOutline';

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
  inlineComm?: { main: string; line: number; title: string; ref: string; he: string[]; en: string[]; key: number } | null; // a commentary the Chavrusa opened: show it under its line
  home?: { onMenu: () => void; onSettings: () => void } | null; // Sefer only: the Sefer is the whole app (sessions and settings in its header, no close)
  onDoubleTap?: () => void; // Quiet chat: a double tap on the text goes full screen (or back)
  embedded?: boolean; // inside Quiet chat: just the text and its tools (the layout has its own header)
}

export default function SeferPanel({ sources, selected, onSelect, onClose, settings, onSettings, sessionId, onOpenRef, onOpenExact, libraryRequest, talk, onPoint, inlineComm, home, embedded, onDoubleTap }: Props) {
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

  // Quiet chat: a line's commentary buttons show only after you tap that line.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setOpen(new Set()); setComm({}); setPicked(null); }, [selected, src?.ref]);
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
  type Comm = { loading?: boolean; he?: string[]; en?: string[]; empty?: boolean; error?: string; refs?: string[]; title?: string; parts?: { ref: string; he: string[]; en: string[] }[] };
  const [comm, setComm] = useState<Record<string, Comm>>({});
  const [conns, setConns] = useState<Record<string, { title: string; refs: string[] }[]> | null>(null);
  const [connState, setConnState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [connTry, setConnTry] = useState(0);
  const [listOpen, setListOpen] = useState<number | null>(null);
  const TANAKH = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles)\b/;
  const isComm = !!src && / on /i.test(src.ref);
  const kind = !src || isComm ? 'none' : /^Mishnah /.test(src.ref) ? 'mishnah' : /\d+[ab](:|$)/.test(src.ref) ? 'gemara' : TANAKH.test(src.ref) ? 'tanakh' : 'other';
  // Until Sefaria's list arrives (or if it can't be reached), the usual ones.
  const fallback: [string, string][] = kind === 'mishnah' ? [['bartenura', 'Bartenura'], ['tyt', 'Tosfos Yom Tov']]
    : kind === 'gemara' ? [['rashi', 'Rashi'], ['tosafot', 'Tosafos']]
    : kind === 'tanakh' ? [['rashi', 'Rashi'], ['ramban', 'Ramban']] : [];
  useEffect(() => {
    setConns(null); setListOpen(null); setConnState('loading');
    if (!src || isComm) return;
    let gone = false;
    fetch(`/api/connections?ref=${encodeURIComponent(src.ref)}`).then((r) => r.json())
      .then((d) => {
        if (gone) return;
        if (d.error) { setConnState('failed'); return; }
        setConns(d.lines ?? {}); setConnState('ok');
      })
      .catch(() => { if (!gone) setConnState('failed'); });
    return () => { gone = true; };
  }, [src?.ref, isComm, connTry]);
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
  async function openComm(i: number, label: string, url: string, refs?: string[], title?: string) {
    const key = `${i}:${label}`;
    if (comm[key]) { setComm((c) => { const n = { ...c }; delete n[key]; return n; }); return; }
    setComm((c) => ({ ...c, [key]: { loading: true, refs, title } }));
    try {
      const r = await fetch(url).then((x) => x.json());
      setComm((c) => ({ ...c, [key]: r.error ? { error: r.error } : r.empty ? { empty: true } : { he: r.he, en: r.en, refs, title, parts: r.parts } }));
    } catch { setComm((c) => ({ ...c, [key]: { error: 'Could not load it.' } })); }
  }

  // Commentary summaries (optional): for a commentator opened on this amud, the AI summarizes all its comments here
  // once (then kept), and each comment shows its gist in plain English.
  const [gists, setGists] = useState<Record<string, string>>({});
  const [trOpen, setTrOpen] = useState<Set<string>>(new Set()); // comments whose translation was opened (with summaries on)
  const [gistState, setGistState] = useState<Record<string, 'loading' | 'failed' | 'done'>>({});
  useEffect(() => { setGists({}); setGistState({}); }, [src?.ref]);
  function wantGists(title: string) {
    if (!src || !conns) return;
    const k = `${src.ref}|${title}`;
    if (gistState[k] === 'loading' || gistState[k] === 'done') return;
    const refs = Object.values(conns).flatMap((list) => list.filter((x) => x.title === title).flatMap((x) => x.refs));
    if (!refs.length) return;
    setGistState((g) => ({ ...g, [k]: 'loading' }));
    fetch('/api/gist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, section: src.ref, refs }) })
      .then((r) => r.json())
      .then((d) => { const n = Object.keys(d.gists ?? {}).length; setGists((g) => ({ ...g, ...(d.gists ?? {}) })); setGistState((g) => ({ ...g, [k]: n ? 'done' : 'failed' })); })
      .catch(() => setGistState((g) => ({ ...g, [k]: 'failed' })));
  }
  // Switched on (or a box opened) while summaries are on: summarize what's open.
  useEffect(() => {
    if (!settings.commSummary) return;
    for (const c of Object.values(comm)) if (c.title && !c.loading) wantGists(c.title);
  }, [settings.commSummary, comm, conns]);
  // The Chavrusa opened a commentary on a line: open it right there under the line, and scroll to it.
  useEffect(() => {
    if (!inlineComm || !src || src.ref !== inlineComm.main) return;
    const i = inlineComm.line - 1;
    const label = nice(inlineComm.title === 'Tosafot' ? 'Tosafot' : inlineComm.title);
    setShowLib(false);
    setComm((c) => ({ ...c, [`${i}:${label}`]: { he: inlineComm.he, en: inlineComm.en, refs: [inlineComm.ref] } }));
    const t = window.setTimeout(() => bodyRef.current?.querySelector(`[data-line="${inlineComm.line}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
    return () => window.clearTimeout(t);
  }, [inlineComm?.key, src?.ref]);
  const openLinked = (i: number, x: { title: string; refs: string[] }) =>
    openComm(i, nice(x.title), `/api/commentary?refs=${encodeURIComponent(x.refs.join('|'))}`, x.refs, x.title);
  const openUsual = (i: number, who: string, label: string) =>
    openComm(i, label, `/api/commentary?ref=${encodeURIComponent(partRef(i))}&who=${who}`);
  const rashi = !!src && /^(Rashi|Tosafot|Tosafos|Rashbam|Ran|Rosh) on /i.test(src.ref);
  const outline = useOutline(src?.ref, !!settings.outline);

  // Scrolling up past the top: the end of the previous amud / perek appears above (kept in place while it loads).
  const prevRef = src && !isComm && !/:\d+(-\d+)?$/.test(src.ref) ? prevSection(src.ref) : null;
  const [prevSrc, setPrevSrc] = useState<SourceData | null>(null);
  const [prevState, setPrevState] = useState<'idle' | 'loading' | 'none'>('idle');
  const prevHeight = useRef<number | null>(null);
  // The amud before and after are fetched quietly as soon as this one opens, so the pull shows them at once.
  const ahead = useRef<Record<string, Promise<SourceData | null>>>({});
  const fetchAhead = (ref: string) => (ahead.current[ref] ??= fetch(`/api/peek?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => (d.source ?? null) as SourceData | null).catch(() => { delete ahead.current[ref]; return null; }));
  useEffect(() => { setPrevSrc(null); setPrevState('idle'); setInView('main'); }, [src?.ref]);
  function loadPrev() {
    if (!prevRef || prevSrc || prevState !== 'idle') return;
    setPrevState('loading');
    void fetchAhead(prevRef).then((s) => { if (s) { prevHeight.current = bodyRef.current?.scrollHeight ?? null; setPrevSrc(s); setPrevState('idle'); } else setPrevState('none'); });
  }
  // The amud above appeared: show its END (where you were heading), not its top. The view is placed so the last
  // lines of the amud above sit just above where you were. Done again after the phone's pull-down bounce settles,
  // since the bounce would otherwise snap the page back to the top.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !prevSrc || prevHeight.current === null) return;
    prevHeight.current = null;
    const place = () => {
      const pv = prevElRef.current;
      if (!pv) return;
      const bottom = pv.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop; // the end of the amud above, in the page
      const target = Math.max(0, bottom - el.clientHeight * 0.55);
      if (Math.abs(el.scrollTop - target) > 40 && el.scrollTop < target) el.scrollTop = target;
    };
    requestAnimationFrame(place);
    const t1 = window.setTimeout(place, 150), t2 = window.setTimeout(place, 450), t3 = window.setTimeout(place, 800);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [prevSrc]);
  const scrolled = useRef(false);
  // Which amud / perek is in the middle of the screen right now (the one above, this one, or the one below).
  const prevElRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState<'prev' | 'main' | 'next'>('main');
  function onBodyScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    const pv = prevElRef.current?.getBoundingClientRect(), nx = endRef.current?.getBoundingClientRect();
    const where = prevSrc && pv && pv.bottom > mid ? 'prev' : nextSrc && nx && nx.top < mid ? 'next' : 'main';
    if (where !== inView) setInView(where);
  }

  // The bumper: at the very top or bottom of an amud the page stops. A gentle extra push (pulling a little further
  // with your finger, or scrolling a little further with a mouse) brings in the previous / next amud.
  const touch = useRef<{ y: number; top: boolean; bottom: boolean } | null>(null);
  const atTop = (el: HTMLElement) => el.scrollTop <= 2;
  const atBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  function onTouchStart(e: React.TouchEvent) {
    const el = bodyRef.current;
    if (!el) return;
    touch.current = { y: e.touches[0].clientY, top: atTop(el), bottom: atBottom(el) };
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = touch.current;
    if (!t) return;
    const dy = e.touches[0].clientY - t.y;
    if (t.bottom && dy < -45) { touch.current = null; loadNext(); }
    else if (t.top && dy > 45) { touch.current = null; loadPrev(); }
  }
  const wheelPush = useRef(0);
  function onWheel(e: React.WheelEvent) {
    const el = bodyRef.current;
    if (!el) return;
    if ((e.deltaY > 0 && atBottom(el)) || (e.deltaY < 0 && atTop(el))) {
      wheelPush.current += e.deltaY;
      if (wheelPush.current > 160) { wheelPush.current = 0; loadNext(); }
      else if (wheelPush.current < -160) { wheelPush.current = 0; loadPrev(); }
    } else wheelPush.current = 0;
  }

  // Previous / next amud, perek or siman: open it as the page in front of you.
  const [turning, setTurning] = useState(false);
  async function turn(ref: string) {
    if (!onOpenExact) { void onOpenRef(ref); return; }
    setTurning(true);
    try { await onOpenExact(ref); } finally { setTurning(false); }
  }
  // A new amud opened: start at its top (unless the chavrusa put us on a later line).
  useEffect(() => {
    scrolled.current = false;
    if (src?.focus && src.focus > 1) return;
    const t = window.setTimeout(() => { bodyRef.current?.scrollTo({ top: 0 }); }, 30);
    return () => window.clearTimeout(t);
  }, [src?.ref]);

  // The text keeps going: under the last line, the next amud / perek appears by itself (when you reach the end
  // or scroll down to it), and you can tap a line there to learn on from it. Free, straight from Sefaria.
  const nextRef = src && !isComm && !/:\d+(-\d+)?$/.test(src.ref) ? nextSection(src.ref) : null;
  const [nextSrc, setNextSrc] = useState<SourceData | null>(null);
  const [nextState, setNextState] = useState<'idle' | 'loading' | 'none'>('idle');
  useEffect(() => { setNextSrc(null); setNextState('idle'); }, [src?.ref]);
  function loadNext() {
    if (!nextRef || nextSrc || nextState !== 'idle') return;
    setNextState('loading');
    void fetchAhead(nextRef).then((s) => { if (s) { setNextSrc(s); setNextState('idle'); } else setNextState('none'); });
  }
  // Fetch the neighbors quietly (a moment after opening, so the amud itself comes first). Nothing is shown until the pull.
  useEffect(() => {
    if (!src || isComm) return;
    const t = window.setTimeout(() => { if (nextRef) void fetchAhead(nextRef); if (prevRef) void fetchAhead(prevRef); }, 700);
    return () => window.clearTimeout(t);
  }, [src?.ref]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const nextOutline = useOutline(nextSrc?.ref, !!settings.outline && !!nextSrc);
  const prevOutline = useOutline(prevSrc?.ref, !!settings.outline && !!prevSrc);

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
  // Quiet chat: a single tap waits a moment, so a double tap (full screen) doesn't also move your place.
  const tapRef = useRef<{ t: number; timer: number | null }>({ t: 0, timer: null });
  function tap(run: () => void) {
    const r = tapRef.current!; const now = Date.now();
    if (now - r.t < 320) { if (r.timer) window.clearTimeout(r.timer); r.timer = null; r.t = 0; onDoubleTap?.(); return; }
    r.t = now; r.timer = window.setTimeout(() => { r.timer = null; run(); }, 300);
  }
  const dbl = embedded && !!onDoubleTap;
  function toggleLine(i: number) {
    if (embedded) { setPicked((p) => (p === i ? null : i)); if (listOpen === i) setListOpen(null); }
    if (src && onPoint && !/ on /i.test(src.ref)) onPoint(src, i + 1);
    if (!canTranslate || showAll) return;
    setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <aside className={`sefer ${full ? 'full' : ''} ${home ? 'home' : ''} ${embedded ? 'embedded' : ''}`} aria-label="Sefer">
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
      <div className="sefer-head" style={embedded ? { display: 'none' } : undefined}>
        {home ? (
          <button className="icon-btn" onClick={home.onMenu} aria-label="Sessions">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        ) : <h2>Sefer</h2>}
        <button className="btn lib-open" onClick={() => setShowLib((v) => !v)} aria-pressed={showLib}>📚 Library</button>
        <button className="btn" onClick={() => setFull(true)} aria-label="Full screen" title="Full screen">⤢</button>
        {talk && (
          <button className={`chip talk ${talk.on ? 'live' : ''}`} onClick={talk.toggle} aria-pressed={talk.on} title={talk.status || undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {talk.on ? (talk.status ? `${talk.status} · End` : 'End talk') : 'Talk'}
          </button>
        )}
        {src && <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open on Sefaria ↗</a>}
        {home ? (
          <button className="icon-btn" onClick={home.onSettings} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        ) : <button className="icon-btn" onClick={onClose} aria-label="Close sefer">✕</button>}
      </div>

      {/* (The "Go to" box was removed: open places from the Library, or just tell the chavrusa.) */}

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
          {!isComm && (
            <button className={`toggle ${settings.commSummary ? 'on' : ''}`} onClick={() => onSettings({ commSummary: !settings.commSummary })} title="Rashi, Tosafos… summarized in short English under each comment">Summaries {settings.commSummary ? 'on' : 'off'}</button>
          )}
          {!isComm && (
            <button className={`toggle ${settings.outline ? 'on' : ''}`} onClick={() => onSettings({ outline: !settings.outline })} title="A one-line summary of each step, above its line">Steps {settings.outline ? 'on' : 'off'}</button>
          )}
          <span className="muted" style={{ alignSelf: 'center' }}>
            {onPoint ? 'Tap a line to learn from there' : canTranslate ? (showAll ? 'Translation under each part' : 'Tap a line to translate it') : 'Original only'}
          </span>
        </div>
      )}

      {settings.outline && outline.loading && !showLib && <div className="move-loading">Summarizing the steps of this {src ? sectionWord(src.ref) : 'page'}…</div>}
      {settings.outline && outline.failed && !outline.loading && !showLib && !isComm && <div className="move-loading">Couldn&apos;t summarize the steps of this {src ? sectionWord(src.ref) : 'page'}. <button className="linklike" onClick={outline.retry}>Try again</button></div>}
      <div className="sefer-body" ref={bodyRef} onClick={dbl ? () => tap(() => {}) : undefined} onScroll={onBodyScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onWheel={onWheel} style={showLib ? { display: 'none' } : undefined}>
        {!src && (home
          ? <div className="empty home-empty"><div className="he" style={{ fontSize: 44, fontWeight: 700 }}>שלום</div><p>What shall we learn? Open the <button className="linklike" onClick={() => setShowLib(true)}>📚 Library</button>, tap Talk, or type below (for example “Berachos 2a” or “today's daf”).</p></div>
          : <div className="empty">Sources your chavrusa brings will appear here.</div>)}
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
            {prevRef && (
              <div className="prev-sec" ref={prevElRef}>
                {prevSrc ? (
                  <>
                    <div className="next-head"><span className="he">{prevSrc.heRef}</span> <small>{prevSrc.ref} · before this {sectionWord(src.ref)}</small></div>
                    {prevSrc.he.map((line, i) => {
                      const en = prevSrc.en[i] || (prevSrc.en.length ? undefined : prevSrc.altEn?.[i]);
                      return (
                        <div key={`p${i}`} style={{ display: 'contents' }}>
                        {(prevOutline.byLine[i + 1] ?? []).map((m, k) => <div key={`pm${k}`} className="move">{m}</div>)}
                        <div data-line={`p${i + 1}`} className="line" onClick={() => onPoint?.(prevSrc, i + 1)}>
                          <div className="he">{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                          {canTranslate && showAll && en && <div className="en">{yeshivishEnglish(en)}</div>}
                        </div>
                        </div>
                      );
                    })}
                  </>
                ) : prevState === 'loading' ? <div className="muted next-head">Bringing {prevRef}…</div>
                  : prevState === 'none' ? null
                  : <button className="bumper" onClick={loadPrev}><span>Top of {src.ref}</span><small>↑ Pull down a little more (or tap) for {prevRef}</small></button>}
              </div>
            )}
            <div className="sefer-title">
              <div className="he">{src.heRef}</div>
              <small>{src.ref}{src.translation ? ` · Translation: ${src.translation}` : ''}</small>
            </div>
            {(() => {
              // Turn the page: the previous or next amud / perek / siman, one tap.
              const whole = !isComm && !/:\d+(-\d+)?$/.test(src.ref);
              const prev = whole ? prevSection(src.ref) : null, next = whole ? nextSection(src.ref) : null;
              if (!prev && !next) return null;
              const word = sectionWord(src.ref);
              const short = (r: string) => r.replace(/^.*? (\d+[ab]?)$/, '$1');
              return (
                <div className="page-turn">
                  {next ? <button className="btn" disabled={turning} onClick={() => turn(next)}>‹ Next {word} · {short(next)}</button> : <span />}
                  {prev ? <button className="btn" disabled={turning} onClick={() => turn(prev)}>{short(prev)} · Previous {word} ›</button> : <span />}
                </div>
              );
            })()}
            {src.he.map((line, i) => {
              const isOpen = canTranslate && (showAll || open.has(i));
              const en = src.en[i] || (src.en.length ? undefined : src.altEn?.[i]);
              const key = `${src.ref}#${i}`;
              return (
                <div key={i} style={{ display: 'contents' }}>
                {(outline.byLine[i + 1] ?? []).map((m, k) => <div key={`m${k}`} className="move">{m}</div>)}
                <div data-line={i + 1} className={`line ${open.has(i) ? 'open' : ''} ${src.focus === i + 1 ? 'focus' : ''}`} onClick={(e) => { if (dbl) { e.stopPropagation(); tap(() => toggleLine(i)); } else toggleLine(i); }}>
                  <div className={`he ${rashi ? 'rashi' : ''}`}>{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                  {(() => {
                    if (kind === 'none') return null;
                    if (embedded && picked !== i) return null;
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
                        {conns === null && !fallback.length && i === 0 && connState === 'loading' && <span className="muted comm-note">Finding commentaries…</span>}
                        {conns === null && i === 0 && connState === 'failed' && (
                          <button className="comm-btn more" onClick={() => setConnTry((n) => n + 1)}>Couldn't load commentaries · try again</button>
                        )}
                        {all.length > quick.length && (
                          <button className={`comm-btn more ${listOpen === i ? 'on' : ''}`} onClick={() => setListOpen((v) => (v === i ? null : i))}>
                            Commentaries ({all.length}) {listOpen === i ? '▴' : '▾'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {listOpen === i && (!embedded || picked === i) && (
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
                          : c.parts?.length ? c.parts.map((pt, k2) => {
                            const gk = src ? `${src.ref}|${c.title}` : '';
                            return (
                              <div key={k2} className="comm-line">
                                {pt.he.map((h, k3) => <div key={k3} className="he rashi">{settings.nikud ? h : stripNikud(h)}</div>)}
                                {settings.commSummary && c.title && (gists[pt.ref] ? <div className="gist"><span>Summary</span> {gists[pt.ref]}</div>
                                  : gistState[gk] === 'loading' ? <div className="gist muted">Summarizing…</div>
                                  : gistState[gk] === 'failed' ? <div className="gist muted">Couldn&apos;t summarize this. <button className="linklike" onClick={() => { setGistState((g) => { const n = { ...g }; delete n[gk]; return n; }); wantGists(c.title!); }}>Try again</button></div>
                                  : null)}
                                {/* Sefaria's translation: always shown when summaries are off; with summaries on, one tap away. */}
                                {pt.en.some(Boolean) && (settings.commSummary && c.title
                                  ? (trOpen.has(`${k}#${k2}`)
                                    ? <>{pt.en.map((e, k3) => e ? <div key={`e${k3}`} className="en tr">{yeshivishEnglish(e)}</div> : null)}<button className="tr-toggle" onClick={() => setTrOpen((t) => { const n = new Set(t); n.delete(`${k}#${k2}`); return n; })}>translation ▴</button></>
                                    : <button className="tr-toggle" onClick={() => setTrOpen((t) => new Set(t).add(`${k}#${k2}`))}>translation ▾</button>)
                                  : pt.en.map((e, k3) => e ? <div key={`e${k3}`} className="en">{yeshivishEnglish(e)}</div> : null))}
                              </div>
                            );
                          })
                          : (c.he ?? []).map((h, k2) => (
                            <div key={k2} className="comm-line">
                              <div className="he rashi">{settings.nikud ? h : stripNikud(h)}</div>
                              {c.en?.[k2] && <div className="en">{yeshivishEnglish(c.en[k2])}</div>}
                            </div>
                          ))}
                      </div>
                    );
                  })}
                  {isOpen && (
                    <div className="en" onClick={(e) => e.stopPropagation()}>
                      {en ? yeshivishEnglish(en) : aiText[key] ? (
                        <><span className="label-ai">AI translation</span><div>{aiText[key]}</div></>
                      ) : (
                        <button className="btn" disabled={loading === key} onClick={() => aiTranslate(key, line)}>
                          {loading === key ? 'Translating…' : 'No approved translation · AI translate this line'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </div>
              );
            })}
            {nextRef && (
              <div ref={endRef} className="next-sec">
                {nextSrc ? (
                  <>
                    <div className="next-head"><span className="he">{nextSrc.heRef}</span> <small>{nextSrc.ref} · the text continues</small></div>
                    {nextSrc.he.map((line, i) => {
                      const en = nextSrc.en[i] || (nextSrc.en.length ? undefined : nextSrc.altEn?.[i]);
                      return (
                        <div key={`n${i}`} style={{ display: 'contents' }}>
                        {(nextOutline.byLine[i + 1] ?? []).map((m, k) => <div key={`nm${k}`} className="move">{m}</div>)}
                        <div data-line={`n${i + 1}`} className="line" onClick={() => onPoint?.(nextSrc, i + 1)}>
                          <div className="he">{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                          {canTranslate && showAll && en && <div className="en">{yeshivishEnglish(en)}</div>}
                        </div>
                        </div>
                      );
                    })}
                  </>
                ) : nextState === 'loading' ? <div className="muted next-head">Bringing {nextRef}…</div>
                  : nextState === 'none' ? <div className="muted next-head">End of the sefer.</div>
                  : <button className="bumper" onClick={loadNext}><span>End of {src.ref}</span><small>↓ Pull up a little more (or tap) for {nextRef}</small></button>}
              </div>
            )}
            {src.he.length === 0 && src.en.map((l, i) => <div key={i} className="line"><div>{l}</div></div>)}
          </>
        )}
        {src && !isComm && !/:\d+(-\d+)?$/.test(src.ref) && (() => {
          // Always in view while scrolling: which amud you're looking at, with the page turns.
          const v = inView === 'prev' && prevSrc ? prevSrc : inView === 'next' && nextSrc ? nextSrc : src;
          const pv = prevSection(v.ref), nx = nextSection(v.ref);
          const word = sectionWord(v.ref);
          return (
            <div className="daf-bar">
              <button disabled={!nx || turning} onClick={() => nx && turn(nx)} aria-label={`Next ${word}`} title={`Next ${word}`}>‹</button>
              <span className="daf-now"><span className="he">{v.heRef}</span><small>{v.ref.replace(/^.*? (\d+[ab]?)$/, '$1')}</small></span>
              <button disabled={!pv || turning} onClick={() => pv && turn(pv)} aria-label={`Previous ${word}`} title={`Previous ${word}`}>›</button>
            </div>
          );
        })()}
      </div>
    </aside>
  );
}
