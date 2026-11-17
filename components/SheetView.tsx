'use client';
// The source sheet, inside the app (📄 Source sheet; components/SourceSheet.ts makes the page): a full screen with
// ✕ Close (or back) and Print. On the iPhone, Print opens the print screen, where "Save to Files" keeps it as a PDF.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SourceData } from '@/lib/db';
import { buildSourceSheet } from './SourceSheet';
import { useBackLayer } from '@/lib/back';

type Opts = Parameters<typeof buildSourceSheet>[1];

export default function SheetView({ src, opts, onClose }: { src: SourceData; opts: Opts; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  useBackLayer(true, onClose);
  useEffect(() => {
    let gone = false;
    buildSourceSheet(src, opts).then((h) => { if (!gone) setHtml(h); }).catch((e) => { if (!gone) setErr((e as Error).message || 'Couldn’t make the sheet.'); });
    return () => { gone = true; };
  }, [src.ref]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nov 16: the iPhone (above all the home-screen app) won't print a frame, so the sheet is put into the page itself,
  // inside its own shadow root so its styles stay apart, and the page is printed with everything else hidden.
  const print = () => {
    if (!html) return;
    document.getElementById('sheet-print')?.remove();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const host = document.createElement('div'); host.id = 'sheet-print';
    const root = host.attachShadow({ mode: 'open' });
    const css = Array.from(doc.querySelectorAll('style')).map((x) => x.textContent ?? '').join('').replace(/\bbody\{/g, ':host{display:block;');
    root.innerHTML = `<style>${css}</style>${doc.body.innerHTML}`;
    document.body.appendChild(host);
    const done = () => { window.removeEventListener('afterprint', done); window.setTimeout(() => host.remove(), 500); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch { /* nothing */ }
  };
  // Share (Mail, Messages, Save to Files…): the sheet as a page, for when printing isn't offered.
  const share = async () => {
    if (!html) return;
    const file = new File([html], `${src.ref} source sheet.html`, { type: 'text/html' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${src.ref} source sheet` }); return; } } catch { return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  };
  useEffect(() => () => { document.getElementById('sheet-print')?.remove(); }, []);
  return createPortal(
    <div className="sheetv" role="dialog" aria-label={`Source sheet for ${src.ref}`}>
      <div className="sheetv-top">
        <button className="sheetv-x" onClick={onClose} aria-label="Close">✕ Close</button>
        <b>📄 {src.ref}</b>
        <span className="sheetv-acts"><button className="sheetv-x" disabled={!html} onClick={share}>Share</button><button className="btn primary" disabled={!html} onClick={print}>Print</button></span>
      </div>
      {html ? <iframe ref={frame} className="sheetv-frame" title="Source sheet" srcDoc={html} />
        : err ? <div className="sheetv-wait">{err}</div>
        : <div className="sheetv-wait"><div className="sheetv-spin" aria-hidden="true" />Putting the source sheet together…<small>The first time for an amud, the map and the table are made too; this can take up to a minute.</small></div>}
    </div>,
    document.body,
  );
}
