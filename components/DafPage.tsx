'use client';
// Tzuras hadaf: the printed Vilna page of the amud you're on, drawn by the app itself so you can zoom in right here
// (pinch, double-tap, or + / −) while the Talk button stays on screen. The amud before and after are one tap away.
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

export default function DafPage({ start, onClose, talk, status }: { start: Amud; onClose: () => void; talk?: ReactNode; status?: string }) {
  const [a, setA] = useState<Amud>(start);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false); // full screen: just the page (and Talk); a tap brings the bar back
  const fullRef = useRef(full); fullRef.current = full;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setA(start); }, [start.tractate, start.daf, start.amud]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = stepAmud(a, -1), next = stepAmud(a, 1);

  // Draw the page, sharp enough to zoom in on Rashi and Tosafos.
  useEffect(() => {
    let gone = false;
    setState('loading'); setErr(''); setZoom(1); zoomRef.current = 1; if (canvas.current) canvas.current.style.width = '100%';
    (async () => {
      try {
        const lib = await loadPdfJs();
        const doc = await lib.getDocument({ url: `/api/daf?ref=${encodeURIComponent(ref(a))}` }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(4, 2600 / base.width) });
        const c = canvas.current;
        if (gone || !c) return;
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        if (!gone) setState('ok');
      } catch (e) {
        if (!gone) { setErr((e as Error).message || 'The page could not be loaded.'); setState('error'); }
      }
    })();
    return () => { gone = true; };
  }, [a.tractate, a.daf, a.amud]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom around a point (where you pinch or double-tap): the canvas is resized and the scroll moved right away, so the
  // spot under your fingers stays under your fingers.
  const zoomRef = useRef(1);
  function zoomTo(z: number, cx?: number, cy?: number) {
    const el = box.current, c = canvas.current;
    const nz = Math.min(MAX, Math.max(MIN, z));
    const old = zoomRef.current;
    if (!el || !c || nz === old) { zoomRef.current = nz; setZoom(nz); return; }
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const x = el.scrollLeft + px, y = el.scrollTop + py; // the spot, in the page as it is now
    const k = nz / old;
    c.style.width = `${nz * 100}%`;
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
      if (box.current) { box.current.scrollLeft -= cx - midX; box.current.scrollTop -= cy - midY; }
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
      {full && <button className="daf-page-unfull" onClick={() => setFull(false)} aria-label="Leave full screen">⤡</button>}
      <div className="daf-page-box" ref={box}>
        <canvas ref={canvas} className="daf-page-canvas" style={{ width: `${zoom * 100}%`, visibility: state === 'ok' ? 'visible' : 'hidden' }} />
        {state === 'loading' && <div className="daf-page-msg">Opening the page…</div>}
        {state === 'error' && <div className="daf-page-msg"><span>{err}<br /><a href={dafPdfUrl(a)} target="_blank" rel="noopener noreferrer">Open the page in a new tab ↗</a></span></div>}
      </div>
      {talk && (
        // Talk right here on the page: the call goes on while you look at the daf, at any zoom.
        <div className="daf-page-talk">{status && <span className="daf-page-status">{status}</span>}{talk}</div>
      )}
      <div className="daf-page-credit">{DAF_CREDIT}</div>
    </div>
  );
}
