'use client';
// Phrase by phrase (Settings → Look → English layout): each short Hebrew phrase with its English right under it.
// The lining up is in lib/interlinear.ts (free, no AI); when a line can't be lined up, it's shown the usual way.
import type { ReactNode } from 'react';
import { BoldEn } from './BoldEn';
import { yeshivishEnglish } from '@/lib/hebrew';

export { pairPhrases } from '@/lib/interlinear';

// Nov 23: `marks`, one per pair (Sentence by sentence, with Color the give and take): each sentence's color, and its
// label where a new step begins.
export function Interlinear({ pairs, heClass = '', show, num, marks, after }: { pairs: { he: string; en: string }[]; heClass?: string; show: (he: string) => string; num?: number; marks?: ({ tone: string; tag?: string } | null)[] | null; after?: (i: number) => ReactNode }) {
  return (
    <div className="il">
      {pairs.map((p, i) => (
        <div key={i} className={`il-pair ${marks?.[i] ? `flow flow-${marks[i]!.tone}` : ''}`}>
          {marks?.[i]?.tag && <div className="flow-tags in-il"><span className={`flow-tag t-${marks[i]!.tone}`}>{marks[i]!.tag}</span></div>}
          <div className={`he il-he ${heClass}`} dir="rtl">{show(p.he)}{num !== undefined && i === 0 && <span className="num">{num}</span>}</div>
          <div className="en il-en">{p.en.includes('\u0002') ? <BoldEn text={p.en} /> : yeshivishEnglish(p.en)}{after?.(i)}</div>
        </div>
      ))}
    </div>
  );
}
