'use client';
// Nov 26: what he opened on the page (the ✦ choices and their boxes, a Step or Pshat he tapped open) stays open when he
// goes to Settings and comes back, or the page redraws: kept in memory and in this tab's session storage, per line.
import { useCallback, useEffect, useRef, useState } from 'react';

const mem = new Map<string, unknown>();
const SK = 'chavrusa-ui:';
function load<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  try { const v = sessionStorage.getItem(SK + key); if (v != null) { const p = JSON.parse(v) as T; mem.set(key, p); return p; } } catch { /* optional */ }
  return undefined;
}
function save(key: string, v: unknown) {
  mem.set(key, v);
  try { sessionStorage.setItem(SK + key, JSON.stringify(v)); } catch { /* storage full: memory still has it */ }
}

/** Like useState, but kept per key across unmounts (null key: plain state). */
export function useKept<T>(key: string | null, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => (key ? load<T>(key) ?? init : init));
  const keyRef = useRef(key);
  useEffect(() => { // another line in the same component: read its own
    if (keyRef.current === key) return;
    keyRef.current = key; setV(key ? load<T>(key) ?? init : init);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((nv: T | ((p: T) => T)) => {
    setV((p) => { const n = typeof nv === 'function' ? (nv as (p: T) => T)(p) : nv; if (keyRef.current) save(keyRef.current, n); return n; });
  }, []);
  return [v, set];
}
/** Whether a value was kept for this key (so a default, like "always open", doesn't override what he chose). */
export const wasKept = (key: string) => load(key) !== undefined;
