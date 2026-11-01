'use client';
// Tzuras hadaf: the printed Vilna page of the amud you're on, full screen, with the amud before and after one tap away.
import { useEffect, useState } from 'react';
import { DAF_CREDIT, dafPdfUrl, stepAmud, type Amud } from '@/lib/daf';

export default function DafPage({ start, onClose }: { start: Amud; onClose: () => void }) {
  const [a, setA] = useState<Amud>(start);
  useEffect(() => { setA(start); }, [start.tractate, start.daf, start.amud]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = stepAmud(a, -1), next = stepAmud(a, 1);
  const url = dafPdfUrl(a);
  return (
    <div className="daf-page" role="dialog" aria-label={`${a.tractate} ${a.daf}${a.amud}, the printed page`}>
      <div className="daf-page-bar">
        <button className="daf-page-nav" disabled={!next} onClick={() => next && setA(next)} aria-label="Next amud">‹</button>
        <span className="daf-page-title">{a.tractate} {a.daf}{a.amud}</span>
        <button className="daf-page-nav" disabled={!prev} onClick={() => prev && setA(prev)} aria-label="Previous amud">›</button>
        <a className="daf-page-open" href={url} target="_blank" rel="noopener noreferrer">Full size ↗</a>
        <button className="daf-page-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <iframe key={url} className="daf-page-frame" src={url} title={`${a.tractate} ${a.daf}${a.amud}`} />
      <div className="daf-page-credit">{DAF_CREDIT}</div>
    </div>
  );
}
