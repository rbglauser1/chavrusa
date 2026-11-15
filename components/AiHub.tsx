'use client';
// One place for the AI (Nov 13): a floating ✦ that stays at the bottom right while you scroll. Tapped, a small sheet
// with what the AI can do for this line (Explain, Chat, Ideas, your own buttons) and for this amud (Sugya map,
// Review questions, Source sheet, Listen, your own buttons). Nov 15: just four on top — Learn with me, Explain, Chat,
// Map (the line's part of the map) — and the rest under More. Replaces the ✦ buttons under every line and the row of
// buttons at the top of the amud (Settings → Extras → AI tools: in one ✦ / under each line).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '@/lib/back';

export type HubAction = { label: string; run: () => void };

export default function AiHub({ lineLabel, pickLine, main, more }: {
  lineLabel: (n: number) => string;
  pickLine: () => number | null;               // which line the sheet is about, decided when it opens
  main: (at: number | null) => HubAction[];    // the few everyday tools (Nov 15: simplified)
  more: (at: number | null) => HubAction[];    // the rest, behind "More"
}) {
  const [at, setAt] = useState<number | null | undefined>(undefined); // undefined: closed
  const [showMore, setShowMore] = useState(false);
  const open = at !== undefined;
  const close = () => { setAt(undefined); setShowMore(false); };
  useBackLayer(open, close);
  if (typeof document === 'undefined') return null;
  const acts = open ? main(at ?? null) : [];
  const extra = open ? more(at ?? null) : [];
  const btns = (list: HubAction[]) => <div className="ai-hub-acts">{list.map((a) => <button key={a.label} onClick={() => { close(); a.run(); }}>{a.label}</button>)}</div>;
  return createPortal(
    <>
      <button className={`ai-hub-btn ${open ? 'on' : ''}`} aria-label="AI tools" onClick={() => (open ? close() : setAt(pickLine()))}>✦</button>
      {open && (
        <div className="ai-hub-scrim" onClick={close}>
          <div className="ai-hub" role="dialog" aria-label="AI tools" onClick={(e) => e.stopPropagation()}>
            <div className="ai-hub-note">Written by AI · AI makes mistakes · check it inside</div>
            <section>
              <h4>{at != null ? <>Line <span>{lineLabel(at)}</span></> : 'This section'}</h4>
              {btns(acts)}
            </section>
            {extra.length > 0 && (
              <section>
                <button className="ai-hub-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>{showMore ? 'Less ▴' : 'More ▾'}</button>
                {showMore && btns(extra)}
              </section>
            )}
            {at != null && <div className="ai-hub-tip">Tap a line first to choose a different one.</div>}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
