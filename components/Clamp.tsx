'use client';
// A long note (a saved chat, "What we learned") shows a few lines with "Show all", so it doesn't flood the page
// (review, Nov 11). Short notes show in full.
import { useState, type CSSProperties, type ReactNode } from 'react';

export default function Clamp({ text, children, lines = 4 }: { text: string; children?: ReactNode; lines?: number }) {
  const [all, setAll] = useState(false);
  const long = text.length > 260 || text.split('\n').length > lines + 1;
  if (!long) return <>{children ?? text}</>;
  return (
    <>
      <span className={all ? 'clamp-all' : 'clamp'} style={{ ['--lines' as string]: lines } as CSSProperties}>{children ?? text}</span>
      <button className="linklike clamp-more" onClick={(e) => { e.stopPropagation(); setAll(!all); }}>{all ? 'Show less' : 'Show all'}</button>
    </>
  );
}
