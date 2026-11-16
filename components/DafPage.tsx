'use client';
// Tzuras hadaf: the printed Vilna page of the amud you're on, drawn by the app itself so you can zoom in right here
// (pinch, double-tap, or + / −) while the Talk button stays on screen. The amud before and after are one tap away.
import { useEffect, useRef, useState, type ReactNode } from 'react';
// A message about the voice not starting is shown even in full screen (the chat with it is hidden).
const isAlert = (t: string) => /^(Microphone|Could not|The voice|The live|Live voice|Gemini Live|Your OpenAI)/.test(t);
import { DAF_CREDIT, dafPdfUrl, stepAmud, type Amud } from '@/lib/daf';

// PDF.js, loaded from the CDN the first time a page is opened.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
type PdfLib = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (src: { url: string }) => { promise: Promise<{ getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }> } };
let pdfjsLoading: Promise<PdfLib> | null = null;
function loadPdfJs(): Promise<PdfLib> {
  const w = window as unknown as { pdfjsLib?: PdfLib };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  return (pdfjsLoading ??= new Promise<PdfLib>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS; s.async = true;
    s.onload = () => { const lib = (window as unknown as { pdfjsLib?: PdfLib }).pdfjsLib; if (!lib) { reject(new Error('The page viewer did not load.')); return; } lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(lib); };
    s.onerror = () => { pdfjsLoading = null; reject(new Error('The page viewer could not load.')); };
    document.head.appendChild(s);
  }));
}

const MIN = 1, MAX = 5;
const ref = (a: Amud) => `${a.tractate} ${a.daf}${a.amud}`;


// The printed page has blank paper around it (above the first line, below the last, at the sides). Cut it off, so the
// daf itself reaches the edges (the very top of the phone in full screen) and the letters come out bigger. The page is
// looked at small (a copy about 300px wide) to find where the print starts and ends; a thin edge is kept.
function trimMargins(c: HTMLCanvasElement) {
  try {
    const W = 300, H = Math.round((c.height / c.width) * W);
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const tx = t.getContext('2d', { willReadFrequently: true })!;
    tx.drawImage(c, 0, 0, W, H);
    const px = tx.getImageData(0, 0, W, H).data;
    const dark = (x: number, y: number) => { const i = (y * W + x) * 4; return px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 200; };
    const rowInk = (y: number) => { let n = 0; for (let x = 0; x < W; x++) if (dark(x, y) && ++n >= 3) return true; return false; };
    const colInk = (x: number) => { let n = 0; for (let y = 0; y < H; y++) if (dark(x, y) && ++n >= 3) return true; return false; };
    let top = 0, bot = H - 1, left = 0, right = W - 1;
    while (top < H && !rowInk(top)) top++;
    while (bot > top && !rowInk(bot)) bot--;
    while (left < W && !colInk(left)) left++;
    while (right > left && !colInk(right)) right--;
    if (bot - top < H * 0.5 || right - left < W * 0.5) return; // not sure where the print is: leave the page as it is
    const k = c.width / W, pad = 3;
    const sx = Math.max(0, Math.floor((left - pad) * k)), sy = Math.max(0, Math.floor((top - pad) * k));
    const sw = Math.min(c.width - sx, Math.ceil((right - left + 2 * pad) * k)), sh = Math.min(c.height - sy, Math.ceil((bot - top + 2 * pad) * k));
    const copy = document.createElement('canvas'); copy.width = sw; copy.height = sh;
    copy.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    c.width = sw; c.height = sh;
    c.getContext('2d')!.drawImage(copy, 0, 0);
  } catch { /* leave the page as it is */ }
}

export default function DafPage({ start, onClose, talk, status }: { start: Amud; onClose: () => void; talk?: ReactNode; status?: string }) {
  const [a, setA] = useState<Amud>(start);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0); // "Try again" draws the page once more
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false); // full screen: just the page (and Talk); a tap brings the bar back
  const fullRef = useRef(full); fullRef.current = full;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setA(start); }, [start.tractate, start.daf, start.amud]); // eslint-disable-line react-hooks/exhaustive-deps
  // Full screen like the Gemara's: the whole document scrolls (not a box inside it), so Safari tucks its bars away and
  // the page runs from the very top of the phone to the very bottom.
  useEffect(() => {
    document.body.toggleAttribute('data-dafull', full);
    // In full screen the page's width is counted against the screen (the document scrolls), not against a box.
    if (canvas.current) canvas.current.style.width = `${zoomRef.current * 100}${full ? 'vw' : '%'}`;
    window.scrollTo(0, 0);
    return () => document.body.removeAttribute('data-dafull');
  }, [full]);
  const prev = stepAmud(a, -1), next = stepAmud(a, 1);

  // Draw the page, sharp enough to zoom in on Rashi and Tosafos.
  useEffect(() => {
    let gone = false;
    setState('loading'); setErr(''); setZoom(1); zoomRef.current = 1; if (canvas.current) canvas.current.style.width = fullRef.current ? '100vw' : '100%';
    (async () => {
      try {
        const lib = await loadPdfJs();
        // A dropped connection ("Load failed" on the iPhone) is tried once more by itself, after a moment.
        const url = `/api/daf?ref=${encodeURIComponent(ref(a))}`;
        let doc;
        try { doc = await lib.getDocument({ url }).promise; }
        catch { await new Promise((r) => setTimeout(r, 1200)); if (gone) return; doc = await lib.getDocument({ url: `${url}&t=${Date.now()}` }).promise; }
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(4, 2600 / base.width) });
        const c = canvas.current;
        if (gone || !c) return;
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        if (gone) return;
        trimMargins(c);
        if (!gone) setState('ok');
      } catch (e) {
        if (!gone) {
          const m = (e as Error).message || '';
          setErr(/load failed|failed to fetch|network/i.test(m) || !m ? "The page didn't load. The connection may have dropped." : m);
          setState('error');
        }
      }
    })();
    return () => { gone = true; };
  }, [a.tractate, a.daf, a.amud, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom around a point (where you pinch or double-tap): the canvas is resized and the scroll moved right away, so the
  // spot under your fingers stays under your fingers.
  const zoomRef = useRef(1);
  function zoomTo(z: number, cx?: number, cy?: number) {
    const el = box.current, c = canvas.current;
    const nz = Math.min(MAX, Math.max(MIN, z));
    const old = zoomRef.current;
    if (!el || !c || nz === old) { zoomRef.current = nz; setZoom(nz); return; }
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left;
    const k = nz / old;
    if (fullRef.current) {
      // Full screen: the document itself scrolls, both ways (so Safari can hide its bars).
      const vx = cx ?? window.innerWidth / 2, vy = cy ?? window.innerHeight / 2;
      const cr = c.getBoundingClientRect();
      const top = cr.top + window.scrollY, left = cr.left + window.scrollX; // the page's corner, in the document
      const y = window.scrollY + vy - top, x = window.scrollX + vx - left; // the spot, from the page's corner
      c.style.width = `${nz * 100}${fullRef.current ? 'vw' : '%'}`;
      zoomRef.current = nz;
      window.scrollTo(left + x * k - vx, top + y * k - vy);
      setZoom(nz);
      return;
    }
    const py = (cy ?? r.top + r.height / 2) - r.top;
    const x = el.scrollLeft + px, y = el.scrollTop + py; // the spot, in the page as it is now
    c.style.width = `${nz * 100}${fullRef.current ? 'vw' : '%'}`;
    zoomRef.current = nz;
    el.scrollLeft = x * k - px;
    el.scrollTop = y * k - py;
    setZoom(nz);
  }

  // Pinch to zoom (the phone's own pinch is turned off here, so the Talk button never slides off the screen).
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
      // Moving both fingers together drags the page.
      if (fullRef.current) window.scrollBy(-(cx - midX), -(cy - midY));
      else if (box.current) { box.current.scrollLeft -= cx - midX; box.current.scrollTop -= cy - midY; }
      midX = cx; midY = cy;
    };
    // A single tap (not a drag, not the first of a double-tap): full screen on and off.
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
      if (e.touches.length === 0 && !moved && lastTap) {
        window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(() => { if (lastTap) { setFull(!fullRef.current); lastTap = 0; } }, 320);
      }
    };
    const noGesture = (e: Event) => e.preventDefault(); // iPhone Safari's own pinch
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

  return (
    <div className={`daf-page ${full ? 'full' : ''}`} role="dialog" aria-label={`${ref(a)}, the printed page`}>
      <div className="daf-page-bar">
        <button className="daf-page-nav" disabled={!next} onClick={() => next && setA(next)} aria-label="Next amud">‹</button>
        <span className="daf-page-title">{ref(a)}</span>
        <button className="daf-page-nav" disabled={!prev} onClick={() => prev && setA(prev)} aria-label="Previous amud">›</button>
        <span className="daf-page-zoom">
          <button className="daf-page-nav" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= MIN} aria-label="Zoom out">−</button>
          <button className="daf-page-nav" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Zoom in">+</button>
        </span>
        <button className="daf-page-nav" onClick={() => setFull(true)} aria-label="Full screen" title="Full screen (tap the page to come back)">⤢</button>
        <button className="daf-page-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="daf-page-box" ref={box}>
        <canvas ref={canvas} className="daf-page-canvas" style={{ width: `${zoom * 100}%`, visibility: state === 'ok' ? 'visible' : 'hidden' }} />
        {state === 'loading' && <div className="daf-page-msg">Opening the page…</div>}
        {state === 'error' && <div className="daf-page-msg"><span>{err}<br /><button className="btn" style={{ margin: '12px 0' }} onClick={(e) => { e.stopPropagation(); setTries((n) => n + 1); }}>Try again</button><br /><a href={dafPdfUrl(a)} target="_blank" rel="noopener noreferrer">Open the page in a new tab ↗</a></span></div>}
      </div>
      {(talk || full) && (
        // Talk right here on the page: the call goes on while you look at the daf, at any zoom. In full screen, the way
        // back sits right next to it, where the thumb already is.
        <div className="daf-page-talk">
          {full && <button className="daf-page-exit" onClick={() => setFull(false)} aria-label="Exit full screen">⤡</button>}
          {status && (!full || isAlert(status)) && <span className={`daf-page-status ${isAlert(status) ? 'err' : ''}`}>{status}</span>}
          {talk}
        </div>
      )}
      <div className="daf-page-credit">{DAF_CREDIT}</div>
    </div>
  );
}
