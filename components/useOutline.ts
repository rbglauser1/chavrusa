'use client';
import { useEffect, useState } from 'react';

// The outline of an amud / perek (a one-line summary above where each move begins), when switched on.
// Line number -> its summaries. Made once per amud by the AI on the server, then kept.
export function useOutline(ref: string | null | undefined, on: boolean): { byLine: Record<number, string[]>; loading: boolean } {
  const [byLine, setByLine] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setByLine({});
    if (!on || !ref || / on /i.test(ref) || /:\d+(-\d+)?$/.test(ref)) return;
    let gone = false;
    setLoading(true);
    fetch(`/api/outline?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      const m: Record<number, string[]> = {};
      for (const x of (d.moves ?? []) as { line: number; summary: string }[]) (m[x.line] ??= []).push(x.summary);
      setByLine(m);
    }).catch(() => {}).finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [ref, on]);
  return { byLine, loading };
}
