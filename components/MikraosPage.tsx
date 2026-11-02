'use client';
// Mikraos Gedolos: a perek of Chumash laid out like a printed page: the pesukim at the top with Onkelos beside them,
// and Rashi, Ramban, Ibn Ezra, Sforno and Or HaChaim below, each comment with its pasuk. A few pesukim per page, the
// way a printed Chumash turns its pages. Pinch, double-tap or + / − to zoom; a tap for full screen; Talk stays on screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Settings } from '@/lib/config';
import { MEFORSHIM, MG_DEFAULT } from '@/lib/mikraos';

type HeEn = { he: string; en: string };
type Data = { ref: string; heRef: string; pesukim: string[]; pesukimEn: string[]; onkelos: HeEn[]; meforshim: { id: string; he: string; name: string; perPasuk: HeEn[][]; missing?: boolean }[] };
const PER_PAGE = 4;
const MIN = 1, MAX = 5;
const BOOK_HE: Record<string, string> = { Genesis: 'בראשית', Exodus: 'שמות', Leviticus: 'ויקרא', Numbers: 'במדבר', Deuteronomy: 'דברים' };
const BOOK_LEN: Record<string, number> = { Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34 };

// Hebrew numerals: 1 -> א, 15 -> טו, 16 -> טז, 18 -> יח, 120 -> קכ.
function heNum(n: number): string {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], hund = ['', 'ק', 'ר', 'ש', 'ת'];
  let s = hund[Math.floor(n / 100)] ?? '';
  const r = n % 100;
  if (r === 15) return `${s}טו`;
  if (r === 16) return `${s}טז`;
  s += tens[Math.floor(r / 10)] + ones[r % 10];
  return s;
}
// Sefaria's bold (the dibur hamaschil) kept as private marks: \u0002 … \u0003.
function Bolded({ t }: { t: string }) {
  const parts = t.split(/(\u0002[^\u0003]*\u0003)/);
  return <>{parts.map((p, i) => (p.startsWith('\u0002') ? <b key={i}>{p.slice(1, -1)}</b> : <span key={i}>{p}</span>))}</>;
}

export default function MikraosPage({ startRef, startPasuk, onClose, talk, status, settings, onChange }: { startRef: string; startPasuk?: number; onClose: () => void; talk?: ReactNode; status?: string; settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  // The learner's page: which meforshim (in the catalog's order), Onkelos, and English under everything.
  const chosen = MEFORSHIM.filter((m) => (settings.mgMeforshim ?? MG_DEFAULT).includes(m.id)).map((m) => m.id);
  const withOnk = settings.mgOnkelos !== false, withEn = !!settings.mgEnglish;
  const [panel, setPanel] = useState(false);
  const toggleMef = (id: string) => onChange({ mgMeforshim: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  const [ref, setRef] = useState(startRef.replace(/:.*$/, ''));
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(Math.floor(((startPasuk ?? 1) - 1) / PER_PAGE));
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const fullRef = useRef(full); fullRef.current = full;
  const box = useRef<HTMLDivElement | null>(null);
  const paper = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);

  useEffect(() => {
    let gone = false;
    setData(null); setErr('');
    const q = new URLSearchParams({ ref, m: chosen.join(','), onk: withOnk ? '1' : '0', en: withEn ? '1' : '0' });
    fetch(`/api/mikraos?${q}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      if (d.error) { setErr(d.error); return; }
      setData(d);
    }).catch(() => { if (!gone) setErr('The page could not be loaded.'); });
    return () => { gone = true; };
  }, [ref, chosen.join(','), withOnk, withEn]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = ref.replace(/ \d+$/, ''), perek = Number(ref.match(/(\d+)$/)?.[1] ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.pesukim.length / PER_PAGE)) : 1;
  const first = page * PER_PAGE; // pasuk index (0-based) at the top of this page
  const range = data ? data.pesukim.slice(first, first + PER_PAGE).map((_, k) => first + k) : [];
  const goPage = (p: number) => {
    if (!data) return;
    if (p >= 0 && p < pages) { setPage(p); box.current?.scrollTo({ top: 0 }); return; }
    // Past the end or the start: the next (or previous) perek.
    const np = perek + (p < 0 ? -1 : 1);
    if (np < 1 || np > (BOOK_LEN[book] ?? 200)) return;
    setRef(`${book} ${np}`);
    setPage(p < 0 ? 999 : 0);
  };
  // After the previous perek loads, "999" means its last page.
  useEffect(() => { if (data && page >= pages) setPage(pages - 1); }, [data, page, pages]);

  // Zoom around a point (where you pinch or double-tap).
  function zoomTo(z: number, cx?: number, cy?: number) {
    const el = box.current, pp = paper.current;
    const nz = Math.min(MAX, Math.max(MIN, z));
    const old = zoomRef.current;
    if (!el || !pp || nz === old) { zoomRef.current = nz; setZoom(nz); return; }
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const x = el.scrollLeft + px, y = el.scrollTop + py;
    const k = nz / old;
    pp.style.width = `${nz * 100}%`;
    pp.style.fontSize = `${nz}em`;
    zoomRef.current = nz;
    el.scrollLeft = x * k - px;
    el.scrollTop = y * k - py;
    setZoom(nz);
  }
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let startDist = 0, startZoom = 1, lastTap = 0, tapTimer: number | undefined, moved = false, tapX = 0, tapY = 0, midX = 0, midY = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; midX = (e.touches[0].clientX + e.touches[1].clientX) / 2; midY = (e.touches[0].clientY + e.touches[1].clientY) / 2; lastTap = 0; e.preventDefault(); }
      else if (e.touches.length === 1) {
        const now = Date.now();
        moved = false; tapX = e.touches[0].clientX; tapY = e.touches[0].clientY;
        if (now - lastTap < 300) { e.preventDefault(); window.clearTimeout(tapTimer); const t = e.touches[0]; zoomTo(zoomRef.current > 1.4 ? 1 : 2.5, t.clientX, t.clientY); lastTap = 0; }
        else lastTap = now;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && Math.hypot(e.touches[0].clientX - tapX, e.touches[0].clientY - tapY) > 10) moved = true;
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo(startZoom * (dist(e.touches) / startDist), cx, cy);
      el.scrollLeft -= cx - midX; el.scrollTop -= cy - midY;
      midX = cx; midY = cy;
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
      if (e.touches.length === 0 && !moved && lastTap) {
        window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(() => { if (lastTap) { setFull(!fullRef.current); lastTap = 0; } }, 320);
      }
    };
    const noGesture = (e: Event) => e.preventDefault();
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    document.addEventListener('gesturestart', noGesture);
    return () => {
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd);
      document.removeEventListener('gesturestart', noGesture);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = `${BOOK_HE[book] ?? book} ${heNum(perek)}`;
  return (
    <div className={`daf-page mg ${full ? 'full' : ''}`} role="dialog" aria-label={`${ref}, Mikraos Gedolos`}>
      <div className="daf-page-bar">
        <button className="daf-page-nav" onClick={() => goPage(page + 1)} aria-label="Next page">‹</button>
        <span className="daf-page-title">{book} {perek}{data ? `:${first + 1}–${Math.min(first + PER_PAGE, data.pesukim.length)}` : ''}</span>
        <button className="daf-page-nav" onClick={() => goPage(page - 1)} aria-label="Previous page">›</button>
        <span className="daf-page-zoom">
          <button className="daf-page-nav" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= MIN} aria-label="Zoom out">−</button>
          <button className="daf-page-nav" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Zoom in">+</button>
        </span>
        <button className={`daf-page-nav ${panel ? 'on' : ''}`} onClick={() => setPanel((v) => !v)} aria-label="Choose meforshim and English" title="Meforshim and English">☰</button>
        <button className="daf-page-nav" onClick={() => setFull(true)} aria-label="Full screen">⤢</button>
        <button className="daf-page-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {panel && (
        <div className="mg-panel">
          <div className="mg-panel-row">
            <label><input type="checkbox" checked={withEn} onChange={() => onChange({ mgEnglish: !withEn })} /> English under everything</label>
            <label><input type="checkbox" checked={withOnk} onChange={() => onChange({ mgOnkelos: !withOnk })} /> Onkelos</label>
          </div>
          <div className="mg-panel-title">Meforshim on your page</div>
          <div className="mg-panel-grid">
            {MEFORSHIM.map((m) => {
              const missing = data?.meforshim.find((x) => x.id === m.id)?.missing;
              return (
                <label key={m.id} className={missing ? 'missing' : ''}>
                  <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggleMef(m.id)} /> {m.name} <span className="he">{m.he}</span>{missing ? <small> (not on this sefer)</small> : null}
                </label>
              );
            })}
          </div>
          <button className="btn" onClick={() => setPanel(false)}>Done</button>
        </div>
      )}
      <div className="daf-page-box mg-box" ref={box}>
        {!data && <div className="daf-page-msg">{err || 'Opening the page…'}</div>}
        {data && (
          <div className="mg-paper" ref={paper} dir="rtl" style={{ width: `${zoom * 100}%`, fontSize: `${zoom}em` }}>
            <div className="mg-head"><span>{title}</span><span className="mg-head-p">{heNum(first + 1)}–{heNum(Math.min(first + PER_PAGE, data.pesukim.length))}</span></div>
            <div className="mg-top">
              <div className="mg-text">
                {range.map((i) => withEn
                  ? <div key={i} className="mg-pair"><div><span className="mg-num">{heNum(i + 1)}</span> {data.pesukim[i]}</div>{data.pesukimEn[i] && <div className="mg-en" dir="ltr">{data.pesukimEn[i]}</div>}</div>
                  : <span key={i}><span className="mg-num">{heNum(i + 1)}</span> {data.pesukim[i]} </span>)}
              </div>
              {data.onkelos.length > 0 && (
                <div className="mg-onk">
                  <div className="mg-label">אונקלוס</div>
                  {range.map((i) => data.onkelos[i]?.he ? (withEn
                    ? <div key={i} className="mg-pair"><div><span className="mg-num">{heNum(i + 1)}</span> {data.onkelos[i].he}</div>{data.onkelos[i].en && <div className="mg-en" dir="ltr">{data.onkelos[i].en}</div>}</div>
                    : <span key={i}><span className="mg-num">{heNum(i + 1)}</span> {data.onkelos[i].he} </span>) : null)}
                </div>
              )}
            </div>
            {data.meforshim.map((m) => {
              const has = range.some((i) => (m.perPasuk[i] ?? []).length);
              // (A meforesh with nothing on these pesukim is left off this page.)
              if (!has) return null;
              return (
                <div key={m.id} className={`mg-comm ${m.id === 'Rashi' ? 'mg-rashi' : ''}`}>
                  <div className="mg-label">{m.he}</div>
                  <div className={`mg-cols rashi ${withEn ? 'one' : ''}`}>
                    {range.map((i) => (m.perPasuk[i] ?? []).length ? (withEn
                      ? <div key={i}>{(m.perPasuk[i] ?? []).map((c, k) => <div key={k} className="mg-pair">{k === 0 && <span className="mg-num">({heNum(i + 1)}) </span>}<Bolded t={c.he} />{c.en && <div className="mg-en" dir="ltr">{c.en}</div>}</div>)}</div>
                      : <span key={i}><span className="mg-num">({heNum(i + 1)})</span> {(m.perPasuk[i] ?? []).map((c, k) => <span key={k}><Bolded t={c.he} /> </span>)}</span>
                    ) : null)}
                  </div>
                </div>
              );
            })}
            <div className="mg-foot">Text from Sefaria · approved sources only{withEn ? ' · English: Sefaria\'s translations' : ''}</div>
          </div>
        )}
      </div>
      {(talk || full) && (
        <div className="daf-page-talk">
          {full && <button className="daf-page-exit" onClick={() => setFull(false)} aria-label="Exit full screen">⤡</button>}
          {!full && status && <span className="daf-page-status">{status}</span>}
          {talk}
        </div>
      )}
    </div>
  );
}
