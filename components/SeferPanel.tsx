'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BoldEn } from './BoldEn';
import { Interlinear, pairPhrases } from './Interlinear';
import SugyaMap from './SugyaMap';
import Review from './Review';
import { Dibbur } from './Dibbur';
import TextCredit from './TextCredit';
import NoteAdd from './NoteAdd';
import MyButtonBox from './MyButtonBox';
import AiHub, { type HubAction } from './AiHub';
import LineChat from './LineChat';
import Clamp from './Clamp';
import Elsewhere from './Elsewhere';
import ByHeart from './ByHeart';
import Marks from './Marks';
import SheetView from './SheetView';
import HalachaTrail from './HalachaTrail';
import ListenBox from './ListenBox';
import Stepped, { longPiece } from './Stepped';
import WordBox, { wordAt } from './WordBox';
import { ExplainBox, IdeasBox, SourcesBox, hasIdeas, sourcesCount, type Groups } from './LineExtras';
import { useBackLayer } from '@/lib/back';
import type { SourceData } from '@/lib/db';
import Library, { jumpLibrary, libraryTrail } from './Library';
import type { Settings } from '@/lib/config';
import { stripNikud, yeshivishEnglish } from '@/lib/hebrew';
import { nextSection, prevSection, sectionWord } from '@/lib/refs';
import { useIntro, useOutline, useTargum } from './useOutline';

interface Props {
  sources: SourceData[];
  selected: number;
  onSelect: (i: number) => void;
  onClose: () => void;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  sessionId: string | null;
  onOpenRef: (q: string) => Promise<string | null>; // returns an error message, or null when opened
  onOpenExact?: (ref: string, focus?: number) => Promise<string | { message: string; approvable?: string } | null>; // an exact Sefaria reference (Library)
  libraryRequest?: number; // changes when the page asks to open the Library
  onLibraryOpened?: () => void; // acknowledge the pending request across screen mounts
  talk?: { on: boolean; toggle: () => void; status: string }; // start or end a voice call from here
  onPoint?: (src: SourceData, n: number) => void; // the learner tapped a line: learn from here
  inlineComm?: { main: string; line: number; title: string; ref: string; he: string[]; en: string[]; key: number } | null; // a commentary the Chavrusa opened: show it under its line
  home?: { onMenu: () => void; onSettings: () => void } | null; // Sefer only: the Sefer is the whole app (sessions and settings in its header, no close)
  onDoubleTap?: () => void;
  onSeen?: (ref: string, heRef: string, line: number) => void; // the line at the top of the view (amud before / this / next), after scrolling settles
  docScroll?: boolean; // Quiet chat full screen: the whole page scrolls (so Safari lets the text slide up under its top edge) // Quiet chat: a double tap on the text goes full screen (or back)
  embedded?: boolean; // inside Quiet chat: just the text and its tools (the layout has its own header)
}

// Where the learner was, kept while the Sefer is closed (Nov 7: opening Settings from 5b and coming back put him at the
// top of 5a): the amud above and below that were showing, and how far down he was. Kept for 10 minutes.
const kept = new Map<string, { prev: SourceData | null; next: SourceData | null; top: number; at: number }>();

export default function SeferPanel({ sources, selected, onSelect, onClose, settings, onSettings, sessionId, onOpenRef, onOpenExact, libraryRequest, onLibraryOpened, talk, onPoint, inlineComm, home, embedded, onDoubleTap, docScroll, onSeen }: Props) {
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
  // Closing the Library (✕ or back): back to the text, or, when no text is open yet, out of the Sefer altogether
  // (Nov 10: ✕ left a blank page with no way out).
  const closeLib = () => { setShowLib(false); if (!sources.length) onClose(); };
  useBackLayer(showLib, closeLib); // back closes the Library
  // Open the Library only when the page asks anew; not again whenever the Sefer comes back on screen (review, Nov 11:
  // it reopened over the text after Settings and on resume).
  useEffect(() => {
    if (!libraryRequest) return;
    setShowLib(true);
    onLibraryOpened?.();
  }, [libraryRequest, onLibraryOpened]);
  // A new text in front (picked in the Library, or asked for by name): the Library steps aside.
  const libRef = useRef(sources[selected]?.ref);
  useEffect(() => { const r = sources[selected]?.ref; if (r && r !== libRef.current) { libRef.current = r; setShowLib(false); } }, [sources, selected]);
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
  // A line tapped in the amud before or after becomes the main text (its own tab): its buttons show at once, the same
  // as a tap on a line of this amud (before, it took a second tap).
  const pickAfter = useRef<{ ref: string; i: number } | null>(null);
  useEffect(() => {
    setOpen(new Set()); setComm({}); setXOpen(new Set()); setCOpen(new Set()); setHOpen(new Set()); setEOpen(new Set()); setHeartOpen(new Set()); setWordOn(null); setSOpen(new Set()); setIOpen(new Set()); setBOpen(null); setTopOpen(null);
    const want = pickAfter.current;
    if (want && src && want.ref === src.ref) { pickAfter.current = null; setPicked(want.i); } else setPicked(null);
    // Coming back to a text: the AI boxes you had open on it (Explain, Chat, Ideas) open again (Nov 13).
    if (src?.ref) try {
      const v = JSON.parse(localStorage.getItem(`chavrusa-aiopen:${src.ref}`) ?? 'null');
      if (v) { setXOpen(new Set(v.x ?? [])); setCOpen(new Set(v.c ?? [])); setIOpen(new Set(v.i ?? [])); }
    } catch { /* optional */ }
  }, [selected, src?.ref]); // eslint-disable-line react-hooks/exhaustive-deps
  // Scroll to the line the learner is on (and highlight it).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const amudTop = useRef<HTMLDivElement | null>(null); // where the amud's AI boxes open (map, review, listen)
  // What scrolls: the Sefer's own body, or (full screen in Quiet chat) the whole page.
  const sc = (): HTMLElement | null => (docScroll && typeof document !== 'undefined' ? (document.scrollingElement as HTMLElement) : bodyRef.current);
  const viewTop = (el: HTMLElement) => (docScroll ? 0 : el.getBoundingClientRect().top);
  const viewH = (el: HTMLElement) => (docScroll ? window.innerHeight : el.clientHeight);
  // A line he tapped himself is already in front of him: don't scroll it back to its start (Nov 10).
  const tappedLine = useRef<{ ref: string; n: number; at: number } | null>(null);
  useEffect(() => {
    if (!src?.focus || restoring.current) return;
    const tl = tappedLine.current;
    if (tl && tl.ref === src.ref && tl.n === src.focus && Date.now() - tl.at < 4000) return;
    // Land at the start of the line (its Hebrew first), with the step heading above it when Steps are on.
    const t = window.setTimeout(() => {
      let el = bodyRef.current?.querySelector(`[data-line="${src.focus}"]`) as HTMLElement | null;
      while (el?.previousElementSibling && (el.previousElementSibling as HTMLElement).classList.contains('move')) el = el.previousElementSibling as HTMLElement;
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 120);
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
  // Explain and Sources under a line (Settings → Extras, both on unless switched off): which lines have them open, and
  // what Sefaria links to each line of this amud / perek (fetched once per amud / perek; free).
  const [xOpen, setXOpen] = useState<Set<number>>(new Set());
  const [cOpen, setCOpen] = useState<Set<number>>(new Set()); // the line chats open
  const [eOpen, setEOpen] = useState<Set<number>>(new Set()); // "Where else in Shas" open on these lines
  const [heartOpen, setHeartOpen] = useState<Set<number>>(new Set()); // "Learn by heart" open on these lines
  const flowEl = useCallback(() => bodyRef.current?.querySelector('.sefer-flow') as HTMLElement | null, []);
  const [hOpen, setHOpen] = useState<Set<number>>(new Set()); // "From the sugya to the halacha" open on these lines
  const [listenOpen, setListenOpen] = useState(false); // "Listen to the daf" at the top of the Sefer
  const closeWord = useCallback(() => setWordOn(null), []);
  const [wordOn, setWordOn] = useState<{ i: number; w: string; raw: string; at: DOMRect } | null>(null); // a word tapped for its meaning
  const [sOpen, setSOpen] = useState<Set<number>>(new Set());
  const [iOpen, setIOpen] = useState<Set<number>>(new Set());
  useEffect(() => { // remember the open AI boxes on this text (above)
    if (!src?.ref) return;
    try {
      const k = `chavrusa-aiopen:${src.ref}`;
      if (xOpen.size + cOpen.size + iOpen.size) localStorage.setItem(k, JSON.stringify({ x: [...xOpen], c: [...cOpen], i: [...iOpen] }));
      else localStorage.removeItem(k);
    } catch { /* optional */ }
  }, [xOpen, cOpen, iOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // The learner's own buttons (Settings → Extras → My buttons): which is open on which line ("line|id"), and at the top.
  const [bOpen, setBOpen] = useState<string | null>(null);
  const [topOpen, setTopOpen] = useState<string | null>(null);
  const lineButtons = (settings.myButtons ?? []).filter((b) => !b.off && b.where === 'line');
  const amudButtons = (settings.myButtons ?? []).filter((b) => !b.off && b.where === 'amud');
  const flipIn = (set: (f: (s: Set<number>) => Set<number>) => void, i: number) => set((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  // Explain, Sources, Ideas and the learner's own buttons: on every sefer in the Library (Gemara, Mishnah, Tanach, the
  // Rambam, Shulchan Aruch, Midrash, mussar…), not on a meforesh opened as its own text, nor on his own uploads.
  const lineX = kind !== 'none' && !!src && !/^Mine /.test(src.ref);
  const [rel, setRel] = useState<{ ref: string; lines: Record<string, Groups>; tanakh: boolean } | null>(null);
  useEffect(() => {
    if (!lineX || !src || (settings.lineSources === false && settings.halachaTrail === false && settings.elsewhere === false)) return;
    if (rel?.ref === src.ref) return;
    let gone = false;
    const ref = src.ref.replace(/:\d+(-\d+)?$/, '');
    fetch(`/api/related?ref=${encodeURIComponent(ref)}`).then((r) => r.json())
      .then((d) => { if (!gone) setRel({ ref: src.ref, lines: d.lines ?? {}, tanakh: !!d.tanakh }); }).catch(() => {});
    return () => { gone = true; };
  }, [src?.ref, lineX, settings.lineSources, settings.halachaTrail, settings.elsewhere]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Under a line: Rashi (or the Bartenura) first, then Tosafos, then the rest in the order they were opened.
  const commRank = (key: string) => { const l = key.slice(key.indexOf(':') + 1); return /^(Rashi|Bartenura)/.test(l) ? 0 : /^Tosaf/.test(l) ? 1 : 2; };
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

  // Rashi open on every line (Settings → Look, or the ⋯ menu): once Sefaria's list of commentaries for this amud /
  // perek arrives, Rashi (on Mishnayos, the Bartenura) opens by itself under each line that has one, a few at a time.
  // Tosafos open on every line too (Gemara only), the same way.
  const autoWho = kind === 'gemara' || kind === 'tanakh' ? 'Rashi' : kind === 'mishnah' ? 'Bartenura' : null;
  useAutoOpen(!!settings.autoRashi, autoWho);
  useAutoOpen(!!settings.autoTosfos, kind === 'gemara' ? 'Tosafot' : null);
  function useAutoOpen(on: boolean, autoWho: string | null) {
  useEffect(() => {
    if (!src || !autoWho || !conns) return;
    const label = nice(autoWho);
    if (!on) {
      // Switched off: close the boxes it opened.
      setComm((c) => { const n = { ...c }; for (const k of Object.keys(n)) if (k.endsWith(`:${label}`)) delete n[k]; return n; });
      return;
    }
    let gone = false;
    const queue = src.he.map((_, i) => i).filter((i) => !comm[`${i}:${label}`]);
    const work = async () => {
      while (queue.length && !gone) {
        const i = queue.shift()!;
        const x = lineComms(i).find((c) => c.title === autoWho);
        if (x) await openLinked(i, x);
      }
    };
    void Promise.all([work(), work(), work(), work()]);
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, autoWho, conns, src?.ref]);
  }
  const outline = useOutline(src?.ref, !!settings.outline);

  // Scrolling up past the top: the end of the previous amud / perek appears above (kept in place while it loads).
  const prevRef = src && !isComm && !/:\d+(-\d+)?$/.test(src.ref) ? prevSection(src.ref) : null;
  const restoring = useRef((() => { const k = src ? kept.get(src.ref) : undefined; return k && Date.now() - k.at < 600_000 && k.top > 40 ? k : null; })());
  const [prevSrc, setPrevSrc] = useState<SourceData | null>(restoring.current?.prev ?? null);
  const [prevState, setPrevState] = useState<'idle' | 'loading' | 'none'>('idle');
  const prevHeight = useRef<number | null>(null);
  // The amud before and after are fetched quietly as soon as this one opens, so the pull shows them at once.
  const ahead = useRef<Record<string, Promise<SourceData | null>>>({});
  const fetchAhead = (ref: string) => (ahead.current[ref] ??= fetch(`/api/peek?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => (d.source ?? null) as SourceData | null).catch(() => { delete ahead.current[ref]; return null; }));
  useEffect(() => { if (restoring.current) return; setPrevSrc(null); setPrevState('idle'); setInView('main'); }, [src?.ref]);
  function loadPrev() {
    if (!prevRef || prevSrc || prevState !== 'idle') return;
    setPrevState('loading');
    void fetchAhead(prevRef).then((s) => { if (s) { prevHeight.current = sc()?.scrollHeight ?? null; setPrevSrc(s); setPrevState('idle'); } else setPrevState('none'); });
  }
  // The amud above appeared: show its END (where you were heading), not its top. The view is placed so the last
  // lines of the amud above sit just above where you were. Done again after the phone's pull-down bounce settles,
  // since the bounce would otherwise snap the page back to the top.
  useEffect(() => {
    const el = sc();
    if (!el || !prevSrc || prevHeight.current === null || restoring.current) return;
    prevHeight.current = null;
    const place = () => {
      const pv = prevElRef.current;
      if (!pv) return;
      const bottom = pv.getBoundingClientRect().bottom - viewTop(el) + el.scrollTop; // the end of the amud above, in the page
      const target = Math.max(0, bottom - viewH(el) * 0.55);
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
  const lastTop = useRef(0);
  // Going in or out of full screen: keep your place on the page.
  useEffect(() => {
    const t = lastTop.current;
    if (!t) return;
    const r = requestAnimationFrame(() => { const el = sc(); if (el) el.scrollTop = t; });
    return () => cancelAnimationFrame(r);
  }, [docScroll]);
  function onBodyScroll() {
    const el = sc();
    if (!el) return;
    lastTop.current = el.scrollTop;
    if (src && !restoring.current) kept.set(src.ref, { prev: prevSrc, next: nextSrc, top: el.scrollTop, at: Date.now() });
    const mid = viewTop(el) + viewH(el) / 2;
    const pv = prevElRef.current?.getBoundingClientRect(), nx = endRef.current?.getBoundingClientRect();
    const where = prevSrc && pv && pv.bottom > mid ? 'prev' : nextSrc && nx && nx.top < mid ? 'next' : 'main';
    if (where !== inView) setInView(where);
    // Where he is reading: the first line at the top of the view, once the scrolling settles (Recent and "pick up
    // where you left off" open there).
    if (onSeen && !restoring.current) {
      if (seenTimer.current) window.clearTimeout(seenTimer.current);
      const sid = sessionId, from = src?.ref;
      seenTimer.current = window.setTimeout(() => {
        const box = sc();
        if (!box || !src) return;
        // Only if the same session and text are still open (Nov 10: a note from the text just left, Yehoshua, was
        // saved under the session opened next, so Recent's Yoma opened Yehoshua).
        if (latest.current.sid !== sid || latest.current.ref !== from) return;
        const top = viewTop(box) + 8;
        const els = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('.sefer-flow [data-line]') ?? []);
        const el = els.find((e) => e.getBoundingClientRect().bottom > top);
        if (!el) return;
        const d = el.dataset.line ?? '';
        const s2 = d.startsWith('p') ? prevSrc : d.startsWith('n') ? nextSrc : src;
        const n = Number(d.replace(/^[pn]/, ''));
        if (s2 && n && !/ on /i.test(s2.ref) && !/:\d+(-\d+)?$/.test(s2.ref)) onSeen(s2.ref, s2.heRef, n);
      }, 800);
    }
  }
  const seenTimer = useRef<number | null>(null);
  const latest = useRef({ sid: sessionId, ref: src?.ref });
  latest.current = { sid: sessionId, ref: src?.ref };
  useEffect(() => () => { if (seenTimer.current) window.clearTimeout(seenTimer.current); }, []);

  // The bumper: at the very top or bottom of an amud the page stops. A gentle extra push (pulling a little further
  // with your finger, or scrolling a little further with a mouse) brings in the previous / next amud.
  const touch = useRef<{ y: number; top: boolean; bottom: boolean } | null>(null);
  const atTop = (el: HTMLElement) => el.scrollTop <= 2;
  const atBottom = (el: HTMLElement) => el.scrollTop + viewH(el) >= el.scrollHeight - 2;
  const scrollFn = useRef(onBodyScroll);
  scrollFn.current = onBodyScroll;
  useEffect(() => {
    if (!docScroll) return;
    const f = () => scrollFn.current();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [docScroll]);
  function onTouchStart(e: React.TouchEvent) {
    const el = sc();
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
    const el = sc();
    if (!el) return;
    if ((e.deltaY > 0 && atBottom(el)) || (e.deltaY < 0 && atTop(el))) {
      wheelPush.current += e.deltaY;
      if (wheelPush.current > 160) { wheelPush.current = 0; loadNext(); }
      else if (wheelPush.current < -160) { wheelPush.current = 0; loadPrev(); }
    } else wheelPush.current = 0;
  }

  // Continuous scroll (the small button by Talk in Quiet chat): the text glides up at the chosen speed.
  // At the end of an amud it brings the next one in and keeps going. Touching the text stops it.
  const autoRef = useRef<{ speed: number; raf: number; last: number; carry: number }>({ speed: 0, raf: 0, last: 0, carry: 0 });
  const loadNextRef = useRef(loadNext);
  loadNextRef.current = loadNext;
  useEffect(() => {
    if (!embedded) return;
    const PX = [0, 14, 22, 34, 50, 72]; // pixels a second for speeds 1..5
    const stopAuto = () => {
      const a = autoRef.current;
      if (a.raf) cancelAnimationFrame(a.raf);
      a.raf = 0; a.speed = 0;
    };
    const step = (t: number) => {
      const a = autoRef.current, el = sc();
      if (!a.speed || !el) { a.raf = 0; return; }
      const dt = a.last ? Math.min(0.1, (t - a.last) / 1000) : 0;
      a.last = t;
      a.carry += PX[a.speed] * dt;
      const move = Math.floor(a.carry);
      if (move >= 1) { a.carry -= move; el.scrollTop += move; }
      if (el.scrollTop + viewH(el) >= el.scrollHeight - 4) loadNextRef.current();
      a.raf = requestAnimationFrame(step);
    };
    const on = (e: Event) => {
      const speed = Number((e as CustomEvent).detail?.speed ?? 0);
      const a = autoRef.current;
      if (!speed) { stopAuto(); return; }
      a.speed = Math.min(5, Math.max(1, speed));
      a.last = 0; a.carry = 0;
      if (!a.raf) a.raf = requestAnimationFrame(step);
    };
    const touched = () => { if (autoRef.current.speed) { stopAuto(); window.dispatchEvent(new Event('chavrusa-autoscroll-stopped')); } };
    window.addEventListener('chavrusa-autoscroll', on);
    const body = bodyRef.current;
    body?.addEventListener('touchstart', touched, { passive: true });
    body?.addEventListener('wheel', touched, { passive: true });
    return () => {
      stopAuto();
      window.removeEventListener('chavrusa-autoscroll', on);
      body?.removeEventListener('touchstart', touched);
      body?.removeEventListener('wheel', touched);
    };
  }, [embedded, docScroll]);

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
    if (restoring.current || (src?.focus && src.focus > 1)) return;
    const t = window.setTimeout(() => { sc()?.scrollTo({ top: 0 }); }, 30);
    return () => window.clearTimeout(t);
  }, [src?.ref]);

  // The text keeps going: under the last line, the next amud / perek appears by itself (when you reach the end
  // or scroll down to it), and you can tap a line there to learn on from it. Free, straight from Sefaria.
  const nextRef = src && !isComm && !/:\d+(-\d+)?$/.test(src.ref) ? nextSection(src.ref) : null;
  // Notes on the line (Settings → Extras): this text's notes, an open editor, and reload when one is added by voice.
  type LineNote = { id: string; ref: string; n: number; text: string; created: string; on?: string; quote?: string };
  const [notes, setNotes] = useState<LineNote[]>([]);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false); // the sugya map (Settings → Extras)
  const [reviewOpen, setReviewOpen] = useState(false); // review questions (Settings → Extras)
  // Back (the phone's or browser's) closes the map, the review questions, or the Library (lib/back).
  useBackLayer(mapOpen, () => setMapOpen(false));
  useBackLayer(reviewOpen, () => setReviewOpen(false));
  // The amud buttons, also at the top of the amud before and after this one (Nov 11: scrolled up into 6a, there were
  // none). On another amud, a tap first makes it the one in front, then opens (the source sheet opens at once).
  const [sheetFor, setSheetFor] = useState<SourceData | null>(null); // the source sheet, shown inside the app
  const pendingAmud = useRef<{ ref: string; what: 'map' | 'review' | 'listen' } | null>(null);
  useEffect(() => {
    const p = pendingAmud.current;
    if (!p || src?.ref !== p.ref) return;
    pendingAmud.current = null;
    window.setTimeout(() => { if (p.what === 'map') setMapOpen(true); else if (p.what === 'review') setReviewOpen(true); else setListenOpen(true); }, 300);
  }, [src?.ref]);
  const hubOn = settings.aiHub !== false;
  const amudRow = (s2: SourceData, main: boolean) => {
    if (hubOn) return null; // the ✦ has them (AiHub)
    const show = (settings.sugyaMap || settings.review || settings.listenDaf !== false || settings.sourceSheet !== false || (main && amudButtons.length > 0)) && !isComm && !/:\d+(-\d+)?$/.test(s2.ref) && !/^Mine /.test(s2.ref);
    if (!show) return null;
    const open = (what: 'map' | 'review' | 'listen') => {
      if (main) { if (what === 'map') setMapOpen(true); else if (what === 'review') setReviewOpen(true); else setListenOpen((o) => !o); return; }
      pendingAmud.current = { ref: s2.ref, what };
      void onOpenExact?.(s2.ref);
    };
    return (
      <div className="smap-btns">
        {settings.sugyaMap && <button className="smap-btn" onClick={() => open('map')}>🗺 {kind === 'tanakh' || kind === 'mishnah' ? 'Perek map' : 'Sugya map'}</button>}
        {settings.review && <button className="smap-btn" onClick={() => open('review')}>✓ Review questions</button>}
        {settings.sourceSheet !== false && kind !== 'none' && <button className="smap-btn" onClick={() => setSheetFor(s2)}>📄 Source sheet</button>}
        {settings.listenDaf !== false && kind !== 'none' && <button className={`smap-btn ${main && listenOpen ? 'on' : ''}`} onClick={() => open('listen')}>🎧 Listen</button>}
        {main && amudButtons.map((b) => <button key={b.id} className={`smap-btn ${topOpen === b.id ? 'on' : ''}`} onClick={() => setTopOpen(topOpen === b.id ? null : b.id)}>✦ {b.name}</button>)}
      </div>
    );
  };
  const [noteText, setNoteText] = useState('');
  const loadNotes = () => { if (settings.notes !== false && src?.ref) fetch(`/api/notes?ref=${encodeURIComponent(src.ref)}`).then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => {}); else setNotes([]); };
  useEffect(loadNotes, [src?.ref, settings.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => loadNotes(); window.addEventListener('notes-changed', f); window.addEventListener('chavrusa-notes', f); return () => { window.removeEventListener('notes-changed', f); window.removeEventListener('chavrusa-notes', f); }; }); // eslint-disable-line react-hooks/exhaustive-deps
  const saveNote = async (n: number) => {
    const text = noteText.trim();
    if (!text || !src) return;
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: src.ref, n, text }) }).catch(() => {});
    setNoteFor(null); setNoteText(''); loadNotes();
  };
  const dropNote = async (id: string) => { await fetch(`/api/notes?id=${id}`, { method: 'DELETE' }).catch(() => {}); loadNotes(); };
  const [nextSrc, setNextSrc] = useState<SourceData | null>(restoring.current?.next ?? null);
  const [nextState, setNextState] = useState<'idle' | 'loading' | 'none'>('idle');
  useEffect(() => { if (restoring.current) return; setNextSrc(null); setNextState('idle'); }, [src?.ref]);
  // Coming back: the same amudim, and the same place on the page (again as the page settles).
  useEffect(() => {
    const k = restoring.current;
    if (!k) return;
    const put = () => { const el = sc(); if (el) { el.scrollTop = k.top; lastTop.current = k.top; } };
    requestAnimationFrame(put);
    const ts = [120, 400, 900].map((ms) => window.setTimeout(put, ms));
    const done = window.setTimeout(() => { restoring.current = null; }, 1000);
    return () => { ts.forEach((t) => window.clearTimeout(t)); window.clearTimeout(done); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Remember the place as he reads.
  useEffect(() => { if (src && !restoring.current) kept.set(src.ref, { prev: prevSrc, next: nextSrc, top: lastTop.current, at: Date.now() }); }, [src?.ref, prevSrc, nextSrc]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const introOn = settings.amudIntro !== false;
  const intro = useIntro(src?.ref, introOn && !isComm);
  const nextIntro = useIntro(nextSrc?.ref, introOn && !!nextSrc);
  const prevIntro = useIntro(prevSrc?.ref, introOn && !!prevSrc);
  // A commentary opened as its own text ("Learn it in the Sefer"): with summaries on, each comment gets its summary here too.
  const [ownGists, setOwnGists] = useState<{ ref: string; list: string[]; state: 'loading' | 'done' | 'failed' } | null>(null);
  useEffect(() => {
    setOwnGists(null);
    if (!src || !isComm || !settings.commSummary || !src.he.length) return;
    const title = src.ref.split(/ on /i)[0];
    const refs = src.he.map((_, i) => `${src.ref}:${i + 1}`);
    let gone = false;
    setOwnGists({ ref: src.ref, list: [], state: 'loading' });
    fetch('/api/gist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, section: src.ref, refs }) })
      .then((r) => r.json())
      .then((d) => { if (gone) return; const g = d.gists ?? {}; const list = refs.map((r) => g[r] ?? ''); setOwnGists({ ref: src.ref, list, state: list.some(Boolean) ? 'done' : 'failed' }); })
      .catch(() => { if (!gone) setOwnGists({ ref: src.ref, list: [], state: 'failed' }); });
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src?.ref, isComm, settings.commSummary]);
  // …and a way back to the text you were learning.
  const mainIdx = (() => { for (let k = sources.length - 1; k >= 0; k--) if (!/ on /i.test(sources[k].ref)) return k; return -1; })();
  const tg = useTargum(src?.ref, !!settings.onkelos);
  const nextTg = useTargum(nextSrc?.ref, !!settings.onkelos && !!nextSrc);
  const prevTg = useTargum(prevSrc?.ref, !!settings.onkelos && !!prevSrc);
  const tgBox = (t: { he: string[]; en: string[] }, i: number) => (t.he[i] ? (
    <div className="tg" onClick={(e) => { e.stopPropagation(); if (dbl && !(e.target as HTMLElement).closest("button")) tap(() => {}); }}>
      <span className="tg-label">Onkelos</span>
      <div className="he tg-he">{settings.nikud ? t.he[i] : stripNikud(t.he[i])}</div>
      {canTranslate && showAll && t.en[i] && <div className="tg-en">{yeshivishEnglish(t.en[i])}</div>}
    </div>
  ) : null);
  const introBox = (t: string) => (t ? <div className="amud-intro"><span>On this {sectionWord(src?.ref ?? '')}</span><div className="ai-note left">Written by AI · AI makes mistakes</div>{t}</div> : null);

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
    if (now - r.t < 320) { if (r.timer) window.clearTimeout(r.timer); r.timer = null; r.t = 0; setWordOn(null); onDoubleTap?.(); return; }
    r.t = now; r.timer = window.setTimeout(() => { r.timer = null; run(); }, 300);
  }
  const dbl = embedded && !!onDoubleTap;
  function toggleLine(i: number) {
    if (embedded) { setPicked((p) => (p === i ? null : i)); if (listOpen === i) setListOpen(null); }
    if (src) tappedLine.current = { ref: src.ref, n: i + 1, at: Date.now() };
    if (src && onPoint && !/ on /i.test(src.ref)) onPoint(src, i + 1);
    if (!canTranslate || showAll) return;
    setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  // The ✦ (AiHub): which line it is about — the one you tapped, else the first line showing on the screen.
  const hubLine = (): number | null => {
    if (picked != null) return picked;
    if (open.size) return Math.max(...open);
    const els = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-line]') ?? [])].filter((e) => /^\d+$/.test(e.dataset.line ?? ''));
    for (const e of els) if (e.getBoundingClientRect().bottom > 120) return Number(e.dataset.line) - 1;
    return els.length ? 0 : null;
  };
  // After the ✦ opens a box under a line, bring that box into view (a line can be long: it scrolls to the new box).
  const showLine = (i: number) => {
    const ln = () => bodyRef.current?.querySelector(`[data-line="${i + 1}"]`);
    const before = new Set(ln()?.querySelectorAll('.line-x') ?? []);
    window.setTimeout(() => {
      const fresh = [...(ln()?.querySelectorAll('.line-x') ?? [])].find((b) => !before.has(b));
      (fresh ?? ln())?.scrollIntoView({ block: fresh ? 'center' : 'start', behavior: 'smooth' });
    }, 160);
  };
  const addIn = (set: (f: (x: Set<number>) => Set<number>) => void, i: number) => { showLine(i); set((x) => new Set(x).add(i)); };
  const toAmud = () => window.setTimeout(() => amudTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
  const hubLineActs = (i: number): HubAction[] => {
    if (!lineX || !src) return [];
    const L = rel?.ref === src.ref ? rel.lines[partNum(i)] : undefined;
    return [
      ...(settings.explainLine !== false ? [{ label: '✦ Explain', run: () => addIn(setXOpen, i) }] : []),
      ...(settings.lineChat !== false ? [{ label: '✦ Chat', run: () => addIn(setCOpen, i) }] : []),
      ...(settings.lineSources !== false && L && hasIdeas(L) ? [{ label: '✦ Ideas', run: () => addIn(setIOpen, i) }] : []),
      ...lineButtons.map((b) => ({ label: `✦ ${b.name}`, run: () => { showLine(i); setBOpen(`${i}|${b.id}`); } })),
    ];
  };
  const hubAmud: HubAction[] = !src || isComm || /:\d+(-\d+)?$/.test(src.ref) || /^Mine /.test(src.ref) ? [] : [
    ...(settings.sugyaMap ? [{ label: `🗺 ${kind === 'tanakh' || kind === 'mishnah' ? 'Perek map' : 'Sugya map'}`, run: () => { setMapOpen(true); toAmud(); } }] : []),
    ...(settings.review ? [{ label: '✓ Review questions', run: () => { setReviewOpen(true); toAmud(); } }] : []),
    ...(settings.sourceSheet !== false && kind !== 'none' ? [{ label: '📄 Source sheet', run: () => setSheetFor(src) }] : []),
    ...(settings.listenDaf !== false && kind !== 'none' ? [{ label: '🎧 Listen', run: () => { setListenOpen(true); toAmud(); } }] : []),
    ...amudButtons.map((b) => ({ label: `✦ ${b.name}`, run: () => { setTopOpen(b.id); toAmud(); } })),
  ];
  const hub = hubOn && src && !isComm && !showLib && (lineX || hubAmud.length > 0)
    ? <AiHub lineLabel={(n) => `${src.ref.replace(/:\d+(-\d+)?$/, '')}:${n + 1}`} pickLine={hubLine} line={hubLineActs} amud={hubAmud} />
    : null;
  return (
    <aside className={`sefer ${full ? 'full' : ''} ${home ? 'home' : ''} ${embedded ? 'embedded' : ''} ${embedded && settings.lineRules ? 'rules' : ''}`} aria-label="Sefer">
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
      {libUsed && <div style={showLib ? { display: 'contents' } : { display: 'none' }}><Library shown={showLib} onOpen={onOpenExact ?? onOpenRef} onClose={closeLib} /></div>}

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
          {embedded && !isComm && (
            <button className={`toggle ${settings.amudIntro !== false ? 'on' : ''}`} onClick={() => onSettings({ amudIntro: settings.amudIntro === false })}>Intro {settings.amudIntro !== false ? 'on' : 'off'}</button>
          )}
          {embedded && /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d/.test(src.ref) && (
            <button className={`toggle ${settings.onkelos ? 'on' : ''}`} onClick={() => onSettings({ onkelos: !settings.onkelos })}>Onkelos {settings.onkelos ? 'on' : 'off'}</button>
          )}
          <span className="muted" style={{ alignSelf: 'center' }}>
            {onPoint ? 'Tap a line to learn from there' : canTranslate ? (showAll ? 'Translation under each part' : 'Tap a line to translate it') : 'Original only'}
          </span>
        </div>
      )}

      {settings.outline && outline.loading && !showLib && <div className="move-loading">Summarizing the steps of this {src ? sectionWord(src.ref) : 'page'}…</div>}
      {settings.outline && outline.failed && !outline.loading && !showLib && !isComm && <div className="move-loading">Couldn&apos;t summarize the steps of this {src ? sectionWord(src.ref) : 'page'}. <button className="linklike" onClick={outline.retry}>Try again</button></div>}
      <div className="sefer-body" ref={bodyRef} onClick={dbl ? () => tap(() => {}) : undefined} onScroll={onBodyScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onWheel={onWheel} style={showLib ? { display: 'none' } : undefined}>
        {/* The text and its page texture scroll as one (the texture is painted on this, not on the scrolling box). */}
        <div className={`sefer-flow${src && /[\u0591-\u05AF]/.test(src.he.slice(0, 4).join(' ')) ? ' pointed' : ''}`}>
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
                    {amudRow(prevSrc, false)}
                    {introBox(prevIntro)}
                    {prevSrc.he.map((line, i) => {
                      const en = prevSrc.en[i] || (prevSrc.en.length ? undefined : prevSrc.altEn?.[i]);
                      // Under each phrase here too (Nov 7: the amud before and after the chosen one showed the whole line).
                      const pairs = settings.interlinear && canTranslate && showAll && en ? pairPhrases(line, prevSrc.enB?.[i], en) : null;
                      return (
                        <div key={`p${i}`} style={{ display: 'contents' }}>
                        {(prevOutline.byLine[i + 1] ?? []).map((m, k) => <div key={`pm${k}`} className="move">{m}</div>)}
                        <div data-line={`p${i + 1}`} className="line" onClick={(e) => { if (dbl) { e.stopPropagation(); tap(() => { pickAfter.current = { ref: prevSrc.ref, i }; onPoint?.(prevSrc, i + 1); }); } else { pickAfter.current = { ref: prevSrc.ref, i }; onPoint?.(prevSrc, i + 1); } }}>
                          {pairs
                            ? <Interlinear pairs={pairs} heClass="" show={(h) => (settings.nikud ? h : stripNikud(h))} num={i + 1} />
                            : <>
                              <div className="he">{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                              {canTranslate && showAll && en && <div className="en">{prevSrc.enB?.[i] ? <BoldEn text={prevSrc.enB[i]} /> : yeshivishEnglish(en)}</div>}
                            </>}
                          {tgBox(prevTg, i)}
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
            {/* Scrolled up into the amud before: this amud gets its own heading too, so the change is clear both ways. */}
            {prevSrc && <div className="next-head here-head"><span className="he">{src.heRef}</span> <small>{src.ref}</small></div>}
            <div className="sefer-title">
              <div className="he">{src.heRef}</div>
              <small>{src.ref}{src.translation ? ` · Translation: ${src.translation}` : ''}</small>
            </div>
            <div ref={amudTop} />
            {src && amudRow(src, true)}
            {sheetFor && <SheetView src={sheetFor} opts={{ withMap: !!settings.sugyaMap, nikud: !!settings.nikud, lines: rel?.ref === sheetFor.ref ? rel.lines : undefined }} onClose={() => setSheetFor(null)} />}
            {settings.marks !== false && src && !isComm && <Marks refText={src.ref} box={flowEl} />}
            {listenOpen && src && <ListenBox refText={src.ref.replace(/:\d+(-\d+)?$/, '')} heRef={src.heRef} onClose={() => setListenOpen(false)} />}
            {topOpen && src && (() => { const b = amudButtons.find((x) => x.id === topOpen); return b ? <MyButtonBox key={b.id} id={b.id} name={b.name} refText={src.ref.replace(/:\d+(-\d+)?$/, '')} onClose={() => setTopOpen(null)} /> : null; })()}
            {reviewOpen && (
              <Review refText={src.ref} onClose={() => setReviewOpen(false)}
                onGo={(n) => { document.querySelector(`.sefer-flow [data-line="${n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }} />
            )}
            {mapOpen && (
              <SugyaMap refText={src.ref} title={kind === 'tanakh' || kind === 'mishnah' ? 'Perek map' : 'Sugya map'} here={src.focus} onClose={() => setMapOpen(false)}
                onGo={(n) => { const el = document.querySelector(`.sefer-flow [data-line="${n}"]`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                onComm={settings.mapComms === false ? undefined : (n, x) => {
                  const i = n - 1;
                  if (embedded) setPicked(i);
                  if (!comm[`${i}:${nice(x.title)}`]) void openLinked(i, x);
                  window.setTimeout(() => document.querySelector(`.sefer-flow [data-line="${n}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
                }}
                onOpen={onOpenExact ? (r) => { setMapOpen(false); const m = r.match(/^(.*?):(\d+)(?:-\d+)?$/); void (m ? onOpenExact(m[1], Number(m[2])) : onOpenExact(r)); } : undefined} />
            )}
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
            {embedded && isComm && mainIdx >= 0 && (
              <button className="back-to-main" onClick={() => onSelect(mainIdx)}>‹ Back to <span className="he">{sources[mainIdx].heRef}</span></button>
            )}
            {isComm && ownGists?.state === 'loading' && <div className="gist muted">Summarizing…</div>}
            {introBox(intro)}
            {settings.outline && Object.keys(outline.byLine).length > 0 && <div className="ai-note left">The step headings are written by AI · AI makes mistakes</div>}
            {src.he.map((line, i) => {
              const isOpen = canTranslate && (showAll || open.has(i));
              const en = src.en[i] || (src.en.length ? undefined : src.altEn?.[i]);
              const key = `${src.ref}#${i}`;
              const pairs = settings.interlinear && isOpen && en ? pairPhrases(line, src.enB?.[i], en) : null;
              return (
                <div key={i} style={{ display: 'contents' }}>
                {(outline.byLine[i + 1] ?? []).map((m, k) => <div key={`m${k}`} className="move">{m}</div>)}
                <div data-line={i + 1} className={`line ${open.has(i) ? 'open' : ''} ${src.focus === i + 1 ? 'focus' : ''}`} onClick={(e) => {
                  // In a line that is already open, a tap on a Hebrew word shows its meaning (Settings → Extras).
                  const active = open.has(i) || (embedded ? picked === i : src.focus === i + 1);
                  if (active && settings.wordTap !== false && (e.target as HTMLElement).closest?.('.he')) {
                    const hit = wordAt(e.clientX, e.clientY);
                    if (hit) { e.stopPropagation(); const showWord = () => setWordOn({ i, w: hit.w, raw: hit.raw, at: hit.rect }); if (dbl) tap(showWord); else showWord(); return; }
                  }
                  if (dbl) { e.stopPropagation(); tap(() => toggleLine(i)); } else toggleLine(i); }}>
                  {pairs
                    ? <Interlinear pairs={pairs} heClass={rashi ? 'rashi' : ''} show={(h) => (settings.nikud ? h : stripNikud(h))} num={i + 1} />
                    : <div className={`he ${rashi ? 'rashi' : ''}`}>{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>}
                  {isComm && ownGists?.ref === src.ref && ownGists.list[i] && <div className="gist"><span>AI summary</span> {ownGists.list[i]}</div>}
                  {settings.notes !== false && (() => {
                    const mine = notes.filter((x) => x.n === i + 1 && x.on !== 'a mark'); // color marks show as color, not as a note here
                    const showAdd = open.has(i) || picked === i || src.focus === i + 1;
                    if (!mine.length && !showAdd && noteFor !== i) return null;
                    return (
                      <div className="line-notes" onClick={(e) => e.stopPropagation()}>
                        {mine.map((x) => (
                          <div key={x.id} className="line-note"><span className="ln-mark">✎</span><span className="ln-text" dir="auto">{x.on && <b className="ln-on">On {x.on}: </b>}<Clamp text={x.text} lines={3} /></span><button className="ln-x" aria-label="Delete this note" onClick={() => { if (window.confirm('Delete this note?')) void dropNote(x.id); }}>×</button></div>
                        ))}
                        {noteFor === i ? (
                          <div className="ln-edit">
                            <textarea autoFocus rows={3} dir="auto" placeholder="Your note on this line" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                            <div className="ln-btns"><button className="btn" disabled={!noteText.trim()} onClick={() => void saveNote(i + 1)}>Save</button><button className="btn ghost" onClick={() => { setNoteFor(null); setNoteText(''); }}>Cancel</button></div>
                          </div>
                        ) : showAdd ? <button className="ln-add" onClick={() => { setNoteFor(i); setNoteText(''); }}>✎ Add a note</button> : null}
                      </div>
                    );
                  })()}
                  {(() => {
                    if (kind === 'none') return null;
                    if (embedded && !settings.autoComms && picked !== i) return null;
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
                        {lineX && !hubOn && settings.explainLine !== false && (
                          <button className={`comm-btn ai ${xOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setXOpen, i)}>✦ Explain</button>
                        )}
                        {lineX && !hubOn && settings.lineChat !== false && (
                          <button className={`comm-btn ai ${cOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setCOpen, i)}>✦ Chat</button>
                        )}
                        {lineX && settings.lineSources !== false && rel?.ref === src.ref && sourcesCount(rel.lines[partNum(i)]) > 0 && (
                          <button className={`comm-btn ${sOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setSOpen, i)}>Sources ({sourcesCount(rel.lines[partNum(i)])})</button>
                        )}
                        {lineX && settings.elsewhere !== false && (kind === 'gemara' || kind === 'mishnah') && rel?.ref === src.ref && (rel.lines[partNum(i)]?.parallels.length ?? 0) > 0 && (
                          <button className={`comm-btn ${eOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setEOpen, i)}>⇄ Elsewhere ({rel.lines[partNum(i)].parallels.length})</button>
                        )}
                        {lineX && settings.byHeart !== false && (kind === 'mishnah' || /^Pirkei Avot/.test(src.ref) || (kind === 'tanakh' && settings.byHeart === true)) && (
                          <button className={`comm-btn ${heartOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setHeartOpen, i)}>🧠 By heart</button>
                        )}
                        {lineX && settings.halachaTrail !== false && (kind === 'gemara' || kind === 'mishnah') && rel?.ref === src.ref && (rel.lines[partNum(i)]?.halacha.length ?? 0) > 0 && (
                          <button className={`comm-btn ${hOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setHOpen, i)}>⚖ Halacha</button>
                        )}
                        {lineX && !hubOn && settings.lineSources !== false && rel?.ref === src.ref && hasIdeas(rel.lines[partNum(i)]) && (
                          <button className={`comm-btn ai ${iOpen.has(i) ? 'on' : ''}`} onClick={() => flipIn(setIOpen, i)}>✦ Ideas</button>
                        )}
                        {lineX && !hubOn && lineButtons.map((b) => (
                          <button key={b.id} className={`comm-btn ai ${bOpen === `${i}|${b.id}` ? 'on' : ''}`} onClick={() => setBOpen(bOpen === `${i}|${b.id}` ? null : `${i}|${b.id}`)}>✦ {b.name}</button>
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
                  {listOpen === i && (!embedded || settings.autoComms || picked === i) && (
                    <div className="comm-list" onClick={(e) => e.stopPropagation()}>
                      {lineComms(i).map((x) => (
                        <button key={x.title} className={`comm-btn ${comm[`${i}:${nice(x.title)}`] ? 'on' : ''}`} onClick={() => openLinked(i, x)}>{nice(x.title)}</button>
                      ))}
                    </div>
                  )}
                  {xOpen.has(i) && <ExplainBox lineRef={partRef(i)} onClose={() => flipIn(setXOpen, i)} />}
                  {wordOn?.i === i && <WordBox key={`${wordOn.w}|${wordOn.at.top}|${wordOn.at.left}`} word={wordOn.w} raw={wordOn.raw} lineRef={partRef(i)} at={wordOn.at} onClose={closeWord} />}
                  {cOpen.has(i) && <LineChat lineRef={partRef(i)} onClose={() => flipIn(setCOpen, i)} />}
                  {bOpen?.startsWith(`${i}|`) && (() => { const b = lineButtons.find((x) => x.id === bOpen.slice(bOpen.indexOf('|') + 1)); return b ? <MyButtonBox key={b.id} id={b.id} name={b.name} refText={partRef(i)} onClose={() => setBOpen(null)} /> : null; })()}
                  {iOpen.has(i) && rel?.ref === src.ref && rel.lines[partNum(i)] && (
                    <IdeasBox groups={rel.lines[partNum(i)]} lineRef={partRef(i)} onClose={() => flipIn(setIOpen, i)} />
                  )}
                  {eOpen.has(i) && rel?.ref === src.ref && rel.lines[partNum(i)] && (
                    <Elsewhere items={rel.lines[partNum(i)].parallels} lineRef={partRef(i)} onClose={() => flipIn(setEOpen, i)}
                      onOpen={onOpenExact ? (r) => { const m = r.match(/^(.*?):(\d+)(?:-\d+)?$/); void (m ? onOpenExact(m[1], Number(m[2])) : onOpenExact(r)); } : undefined} />
                  )}
                  {heartOpen.has(i) && <ByHeart he={src.he[i]} nikud={!!settings.nikud} onClose={() => flipIn(setHeartOpen, i)} />}
                  {hOpen.has(i) && rel?.ref === src.ref && rel.lines[partNum(i)] && (
                    <HalachaTrail halacha={rel.lines[partNum(i)].halacha} lineLabel={`${partRef(i)}`} onClose={() => flipIn(setHOpen, i)}
                      onOpen={onOpenExact ? (r) => { const m = r.match(/^(.*?):(\d+)(?:-\d+)?$/); void (m ? onOpenExact(m[1], Number(m[2])) : onOpenExact(r)); } : undefined} />
                  )}
                  {sOpen.has(i) && rel?.ref === src.ref && rel.lines[partNum(i)] && (
                    <SourcesBox groups={rel.lines[partNum(i)]} tanakh={rel.tanakh} onClose={() => flipIn(setSOpen, i)}
                      onOpen={onOpenExact ? (r) => { const m = r.match(/^(.*?):(\d+)(?:-\d+)?$/); void (m ? onOpenExact(m[1], Number(m[2])) : onOpenExact(r)); } : undefined} />
                  )}
                  {(Object.entries(comm) as [string, Comm][]).filter(([k]) => k.startsWith(`${i}:`)).sort(([a], [b]) => commRank(a) - commRank(b)).map(([k, c]) => {
                    const label = k.slice(k.indexOf(':') + 1);
                    return (
                      <div key={k} className="comm" onClick={(e) => {
                        e.stopPropagation();
                        // A tap on a word of the meforesh: its meaning, or an abbreviation opened up (Extras → Word meanings).
                        if (settings.wordTap !== false && (e.target as HTMLElement).closest?.('.he') && !(e.target as HTMLElement).closest('button')) {
                          const hit = wordAt(e.clientX, e.clientY);
                          if (hit) { const showWord = () => setWordOn({ i, w: hit.w, raw: hit.raw, at: hit.rect }); if (dbl) tap(showWord); else showWord(); return; }
                        }
                        if (dbl && !(e.target as HTMLElement).closest("button")) tap(() => {}); }}>
                        <div className="comm-title">
                          {label}
                          {c.refs?.length && onOpenExact ? (
                            <button className="comm-learn" onClick={() => void onOpenExact(c.refs![0].replace(/:\d+(-\d+)?$/, '') || c.refs![0])}>Learn it in the Sefer ↗</button>
                          ) : null}
                          {settings.notes !== false && <NoteAdd refText={src.ref} n={Number(k.split(':')[0]) + 1} on={label} quote={stripNikud(c.he?.[0] ?? '').slice(0, 120)} label="✎" />}
                          <button className="comm-x" aria-label={`Close ${label}`} onClick={() => setComm((m) => { const n = { ...m }; delete n[k]; return n; })}>✕</button>
                        </div>
                        {c.loading ? <div className="muted">Opening…</div>
                          : c.error ? <div className="muted">{c.error}</div>
                          : c.empty ? <div className="muted">No {label} on this part on Sefaria.</div>
                          : c.parts?.length ? c.parts.map((pt, k2) => {
                            const gk = src ? `${src.ref}|${c.title}` : '';
                            return (
                              <div key={k2} className="comm-line">
                                {/* A long piece can be broken into its steps: Tosafos always (Extras → Tosafos steps); any other meforesh when Steps is on. */}
                                {longPiece(pt.he) && ((/^Tosa/i.test(c.title ?? label) && settings.tosSteps !== false) || settings.outline)
                                  ? <Stepped refText={pt.ref}>{pt.he.map((h, k3) => <div key={k3} className="he rashi"><Dibbur text={settings.nikud ? h : stripNikud(h)} /></div>)}</Stepped>
                                  : pt.he.map((h, k3) => <div key={k3} className="he rashi"><Dibbur text={settings.nikud ? h : stripNikud(h)} /></div>)}
                                {settings.commSummary && c.title && (gists[pt.ref] ? <div className="gist"><span>AI summary</span> {gists[pt.ref]}</div>
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
                              <div className="he rashi"><Dibbur text={settings.nikud ? h : stripNikud(h)} /></div>
                              {c.en?.[k2] && <div className="en">{yeshivishEnglish(c.en[k2])}</div>}
                            </div>
                          ))}
                      </div>
                    );
                  })}
                  {isOpen && !pairs && (
                    <div className="en" onClick={(e) => {
                      // A tap on the English opens the line's buttons, and a second tap closes them, like the Hebrew (Nov 11).
                      e.stopPropagation();
                      if ((e.target as HTMLElement).closest('button')) return;
                      if (window.getSelection()?.toString()) return; // words being selected for a color mark
                      if (dbl) tap(() => toggleLine(i)); else toggleLine(i); }}>
                      {en ? (src.enB?.[i] ? <BoldEn text={src.enB[i]} /> : yeshivishEnglish(en)) : aiText[key] ? (
                        <><span className="label-ai">AI translation · AI makes mistakes</span><div>{aiText[key]}</div></>
                      ) : (
                        <button className="btn" disabled={loading === key} onClick={() => aiTranslate(key, line)}>
                          {loading === key ? 'Translating…' : 'No approved translation · AI translate this line'}
                        </button>
                      )}
                    </div>
                  )}
                  {tgBox(tg, i)}
                </div>
                </div>
              );
            })}
            <TextCredit src={src} />
            {nextRef && (
              <div ref={endRef} className="next-sec">
                {nextSrc ? (
                  <>
                    <div className="next-head"><span className="he">{nextSrc.heRef}</span> <small>{nextSrc.ref} · the text continues</small></div>
                    {amudRow(nextSrc, false)}
                    {introBox(nextIntro)}
                    {nextSrc.he.map((line, i) => {
                      const en = nextSrc.en[i] || (nextSrc.en.length ? undefined : nextSrc.altEn?.[i]);
                      // Under each phrase here too (Nov 7: the amud before and after the chosen one showed the whole line).
                      const pairs = settings.interlinear && canTranslate && showAll && en ? pairPhrases(line, nextSrc.enB?.[i], en) : null;
                      return (
                        <div key={`n${i}`} style={{ display: 'contents' }}>
                        {(nextOutline.byLine[i + 1] ?? []).map((m, k) => <div key={`nm${k}`} className="move">{m}</div>)}
                        <div data-line={`n${i + 1}`} className="line" onClick={(e) => { if (dbl) { e.stopPropagation(); tap(() => { pickAfter.current = { ref: nextSrc.ref, i }; onPoint?.(nextSrc, i + 1); }); } else { pickAfter.current = { ref: nextSrc.ref, i }; onPoint?.(nextSrc, i + 1); } }}>
                          {pairs
                            ? <Interlinear pairs={pairs} heClass="" show={(h) => (settings.nikud ? h : stripNikud(h))} num={i + 1} />
                            : <>
                              <div className="he">{settings.nikud ? line : stripNikud(line)}<span className="num">{i + 1}</span></div>
                              {canTranslate && showAll && en && <div className="en">{nextSrc.enB?.[i] ? <BoldEn text={nextSrc.enB[i]} /> : yeshivishEnglish(en)}</div>}
                            </>}
                          {tgBox(nextTg, i)}
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
          const bar = (
            <div className="daf-bar">
              <button disabled={!nx || turning} onClick={() => nx && turn(nx)} aria-label={`Next ${word}`} title={`Next ${word}`}>‹</button>
              <span className="daf-now"><span className="he">{v.heRef}</span><small>{v.ref.replace(/^.*? (\d+[ab]?)$/, '$1')}</small></span>
              <button disabled={!pv || turning} onClick={() => pv && turn(pv)} aria-label={`Previous ${word}`} title={`Previous ${word}`}>›</button>
            </div>
          );
          // Quiet chat: the counter lives in the bottom row, level with Talk (outside the text, so the top fade never touches it).
          if (embedded && typeof document !== 'undefined') return showLib ? null : createPortal(<div className="daf-dock">{bar}</div>, document.body);
          return bar;
        })()}
        </div>
      </div>
      {hub}
    </aside>
  );
}
