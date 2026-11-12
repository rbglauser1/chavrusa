'use client';
// Your own texts have references like "Mine k3f9x 2"; in lists they show by their own title instead ("My shiur notes,
// part 2"; review, Nov 11).
import { useEffect, useState } from 'react';

let cache: Record<string, string> | null = null;

export function useMineTitles(on: boolean): (ref: string) => string {
  const [titles, setTitles] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    if (!on || cache) return;
    fetch('/api/mine').then((r) => r.json()).then((d) => {
      cache = Object.fromEntries((Array.isArray(d.items) ? d.items : []).map((x: { id: string; title: string }) => [x.id, x.title]));
      setTitles(cache);
    }).catch(() => {});
  }, [on]);
  return (ref: string) => {
    const m = String(ref ?? '').match(/^Mine\s+(\S+)(?:\s+(\d+))?/);
    if (!m) return ref;
    const t = titles[m[1]] ?? 'My text';
    return m[2] && m[2] !== '1' ? `${t}, part ${m[2]}` : t;
  };
}
