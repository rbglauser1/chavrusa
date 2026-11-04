'use client';
// Phrase by phrase (Settings → Look → English layout): each short Hebrew phrase with its English right under it.
// The lining up is in lib/interlinear.ts (free, no AI); when a line can't be lined up, it's shown the usual way.
import { BoldEn } from './BoldEn';
import { yeshivishEnglish } from '@/lib/hebrew';

export { pairPhrases } from '@/lib/interlinear';

export function Interlinear({ pairs, heClass = '', show, num }: { pairs: { he: string; en: string }[]; heClass?: string; show: (he: string) => string; num?: number }) {
  return (
    <div className="il">
      {pairs.map((p, i) => (
        <div key={i} className="il-pair">
          <div className={`he il-he ${heClass}`} dir="rtl">{show(p.he)}{num !== undefined && i === 0 && <span className="num">{num}</span>}</div>
          <div className="en il-en">{p.en.includes('\u0002') ? <BoldEn text={p.en} /> : yeshivishEnglish(p.en)}</div>
        </div>
      ))}
    </div>
  );
}
