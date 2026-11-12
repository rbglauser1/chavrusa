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
  const print = () => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { /* the browser's own print */ } };
  return createPortal(
    <div className="sheetv" role="dialog" aria-label={`Source sheet for ${src.ref}`}>
      <div className="sheetv-top">
        <button className="sheetv-x" onClick={onClose} aria-label="Close">✕ Close</button>
        <b>📄 {src.ref}</b>
        <button className="btn primary" disabled={!html} onClick={print}>Print</button>
      </div>
      {html ? <iframe ref={frame} className="sheetv-frame" title="Source sheet" srcDoc={html} />
        : err ? <div className="sheetv-wait">{err}</div>
        : <div className="sheetv-wait"><div className="sheetv-spin" aria-hidden="true" />Putting the source sheet together…<small>The first time for an amud, the map and the table are made too; this can take up to a minute.</small></div>}
    </div>,
    document.body,
  );
}
