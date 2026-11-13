'use client';
// One place for the AI (Nov 13): a floating ✦ that stays at the bottom right while you scroll. Tapped, a small sheet
// with what the AI can do for this line (Explain, Chat, Ideas, your own buttons) and for this amud (Sugya map,
// Review questions, Source sheet, Listen, your own buttons). Replaces the ✦ buttons under every line and the row of
// buttons at the top of the amud (Settings → Extras → AI tools: in one ✦ / under each line).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '@/lib/back';

export type HubAction = { label: string; run: () => void };

export default function AiHub({ lineLabel, pickLine, line, amud }: {
  lineLabel: (n: number) => string;
  pickLine: () => number | null;             // which line the sheet is about, decided when it opens
  line: (i: number) => HubAction[];
  amud: HubAction[];
}) {
  const [at, setAt] = useState<number | null | undefined>(undefined); // undefined: closed
  const open = at !== undefined;
  const close = () => setAt(undefined);
  useBackLayer(open, close);
  if (typeof document === 'undefined') return null;
  const lineActs = at != null ? line(at) : [];
  return createPortal(
    <>
      <button className={`ai-hub-btn ${open ? 'on' : ''}`} aria-label="AI tools" onClick={() => (open ? close() : setAt(pickLine()))}>✦</button>
      {open && (
        <div className="ai-hub-scrim" onClick={close}>
          <div className="ai-hub" role="dialog" aria-label="AI tools" onClick={(e) => e.stopPropagation()}>
            <div className="ai-hub-note">Written by AI · AI makes mistakes · check it inside</div>
            {at != null && lineActs.length > 0 && (
              <section>
                <h4>This line <span>{lineLabel(at)}</span></h4>
                <div className="ai-hub-acts">{lineActs.map((a) => <button key={a.label} onClick={() => { close(); a.run(); }}>{a.label}</button>)}</div>
              </section>
            )}
            {amud.length > 0 && (
              <section>
                <h4>This amud</h4>
                <div className="ai-hub-acts">{amud.map((a) => <button key={a.label} onClick={() => { close(); a.run(); }}>{a.label}</button>)}</div>
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
