'use client';
// Nov 22: a recorded voice clip playing (Big picture, the Chazara recap), so the chavrusa's face can show and talk
// while it plays, and its End button can stop it. Each such player is watched once; a short silent "unlock" sound
// (a data: URL) doesn't count.
import { useSyncExternalStore } from 'react';

let current: HTMLAudioElement | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const watched = new WeakSet<HTMLAudioElement>();

export function watchVoice(el: HTMLAudioElement) {
  if (watched.has(el)) return;
  watched.add(el);
  el.addEventListener('playing', () => { if (!el.src || el.src.startsWith('data:')) return; current = el; emit(); });
  const off = () => { if (current === el) { current = null; emit(); } };
  for (const ev of ['pause', 'ended', 'error', 'emptied']) el.addEventListener(ev, off);
}

/** Stop the clip that is playing (its own "ended" handler runs, so its button goes back to normal). */
export function stopClip() {
  const el = current;
  if (!el) return;
  el.pause();
  el.dispatchEvent(new Event('ended'));
}

export function useClipPlaying(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current !== null, () => false);
}
