'use client';
// "This line in the map" (the ✦, Nov 15): one tap, and the part of the section's map this line belongs to pops up —
// the topic, its background, and its steps with this line's step lit — without opening the whole map. The map is the
// same one the full map shows (made once per section and kept; lib/mapClient keeps it on the device too).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bullets, isHebrewText } from './Bullets';
import { useBackLayer } from '@/lib/back';
import { getMap, placeOf, stepLabel, type MapData } from '@/lib/mapClient';

export default function MapPeek({ refText, line, onGo, onFull, onClose }: {
  refText: string; line: number; onGo: (n: number) => void; onFull: () => void; onClose: () => void;
}) {
  const [map, setMap] = useState<MapData | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useBackLayer(true, onClose);
  useEffect(() => {
    let gone = false;
    setErr('');
    getMap(refText).then((m) => { if (!gone) setMap(m); }).catch(() => { if (!gone) setErr('The map couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [refText, tick]);
  if (typeof document === 'undefined') return null;
  const at = map ? placeOf(map, line) : null;
  const t = at?.topic;
  return createPortal(
    <div className="peek-scrim" onClick={onClose}>
      <div className="peek" role="dialog" aria-label="This line in the map" onClick={(e) => e.stopPropagation()}>
        <div className="peek-head">
          <span>🗺 Line {line} in the map</span>
          <button className="linklike" onClick={() => { onClose(); onFull(); }}>Full map</button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!map ? (
          err ? <div className="muted">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>
            : <div className="muted"><span className="wait-dots"><span /><span /><span /></span>Making the map for this section (once)…</div>
        ) : t ? (
          <div className="peek-body">
            {t.title && <h4 dir="auto">{t.title}</h4>}
            {t.intro && <Bullets text={t.intro} className="smap-intro" />}
            {t.background.length > 0 && (
              <div className="smap-bg">
                <span className="smap-label">Good to know</span>
                <ul dir={isHebrewText(t.background.join(' ')) ? 'rtl' : undefined}>{t.background.map((b, i) => { const m = b.match(/^([^:]{1,40}):\s*(.*)$/); return <li key={i}>{m ? <><b>{m[1]}</b>: {m[2]}</> : b}</li>; })}</ul>
              </div>
            )}
            <ol className="peek-steps">
              {t.steps.map((s, i) => (
                <li key={i} className={s === at?.step ? 'here' : ''}>
                  <button onClick={() => { onGo(s.line); onClose(); }}>
                    <span className="peek-who" dir="auto">{stepLabel(s)}</span>
                    <span className="peek-sum" dir="auto">{s.summary}</span>
                    <small>line {s.line}{s === at?.step ? ' · you are here' : ''}</small>
                  </button>
                </li>
              ))}
            </ol>
            {t.takeaway && <p className="peek-take" dir="auto"><b>Where it ends up:</b> {t.takeaway}</p>}
          </div>
        ) : <div className="muted">No map for this text.</div>}
        <div className="ai-note left">Written by AI · AI makes mistakes</div>
      </div>
    </div>,
    document.body,
  );
}
