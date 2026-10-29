'use client';
import { useEffect, useState } from 'react';

// The outline of an amud / perek (a one-line summary above where each move begins), when switched on.
// Line number -> its summaries. Made once per amud by the AI on the server, then kept.
export function useOutline(ref: string | null | undefined, on: boolean): { byLine: Record<number, string[]>; loading: boolean; failed: boolean; retry: () => void } {
  const [byLine, setByLine] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setByLine({}); setFailed(false);
    if (!on || !ref || / on /i.test(ref) || /:\d+(-\d+)?$/.test(ref)) return;
    let gone = false;
    setLoading(true);
    fetch(`/api/outline?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      const m: Record<number, string[]> = {};
      for (const x of (d.moves ?? []) as { line: number; summary: string }[]) (m[x.line] ??= []).push(x.summary);
      setByLine(m);
      setFailed(!Object.keys(m).length);
    }).catch(() => { if (!gone) setFailed(true); }).finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [ref, on, attempt]);
  return { byLine, loading, failed, retry: () => setAttempt((n) => n + 1) };
}

// The amud intro (a paragraph on what's coming), when switched on. Made once per amud on the server, then kept.
export function useIntro(ref: string | null | undefined, on: boolean): string {
  const [text, setText] = useState('');
  useEffect(() => {
    setText('');
    if (!on || !ref || / on /i.test(ref) || /:\d+(-\d+)?$/.test(ref)) return;
    let gone = false;
    fetch(`/api/intro?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => { if (!gone && typeof d.intro === 'string') setText(d.intro); }).catch(() => {});
    return () => { gone = true; };
  }, [ref, on]);
  return text;
}

// Onkelos on a perek of Chumash, when switched on: the Aramaic of each pasuk and its English (from Sefaria, no AI).
export function useTargum(ref: string | null | undefined, on: boolean): { he: string[]; en: string[] } {
  const [t, setT] = useState<{ he: string[]; en: string[] }>({ he: [], en: [] });
  useEffect(() => {
    setT({ he: [], en: [] });
    if (!on || !ref || !/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) \d+$/.test(ref)) return;
    let gone = false;
    fetch(`/api/targum?ref=${encodeURIComponent(ref)}`).then((r) => r.json()).then((d) => { if (!gone) setT({ he: d.he ?? [], en: d.en ?? [] }); }).catch(() => {});
    return () => { gone = true; };
  }, [ref, on]);
  return t;
}
