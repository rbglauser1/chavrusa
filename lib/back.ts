'use client';
// Going back, the same everywhere: the phone's or browser's back (the back button, a swipe from the edge) steps back
// one screen inside the app (closes the Library, the map, Settings, goes back to Home) instead of leaving it.
//
// Each screen or panel that can be "backed out of" is a layer. Opening it adds one step to the browser's history;
// back closes the top layer. Closing it with the app's own ✕ or ‹ removes its step again, so the history always
// matches what is open.
import { useEffect, useRef } from 'react';

type Layer = { id: number; onBack: () => void; pushed: boolean };
const stack: Layer[] = [];
let seq = 0;
let moving = 0;          // our own history.go() calls still on their way
let ready = false;

// Add the history steps of layers that were opened while one of our own steps back was still on its way (a step
// pushed in that moment would be the one taken back).
function flush() {
  moving = 0;
  // Nov 15: our own steps back can overshoot (two layers closing at once — the Library and its sefer panel — counted
  // one step too many and landed on Home's step). Any layer still open whose step is now gone gets it back.
  const at = Number((history.state as { layer?: number } | null)?.layer ?? 0);
  for (const l of stack) {
    if (!l.pushed || l.id > at) { l.pushed = true; history.pushState({ layer: l.id }, ''); }
  }
}
let flushTimer: number | null = null;

function init() {
  if (ready || typeof window === 'undefined') return;
  ready = true;
  window.addEventListener('popstate', (e) => {
    // Where the history landed: the layer whose step it is (0: beneath them all). Every open layer above it closes.
    // A layer the app closed itself is already off the stack, so its own step back closes nothing; and going
    // forward lands on a step of a layer that is gone, which closes nothing either.
    const landed = Number((e.state as { layer?: number } | null)?.layer ?? 0);
    // Our own step back (a layer closed with ✕ or by choosing something): close nothing; when the last one lands,
    // put back the step of any layer that is still open (flush).
    if (moving > 0) { if (--moving === 0) { if (flushTimer) window.clearTimeout(flushTimer); flush(); } return; }
    while (stack.length && stack[stack.length - 1].pushed && stack[stack.length - 1].id > landed) stack.pop()!.onBack();
  });
}

function openLayer(onBack: () => void): number {
  init();
  const id = ++seq;
  const pushed = moving === 0;
  stack.push({ id, onBack, pushed, at: new Error().stack?.split('\n').slice(2, 5).join(' | ') } as Layer);
  (window as unknown as { __layers?: Layer[] }).__layers = stack; // for checking what is open (Nov 16)
  if (pushed) history.pushState({ layer: id }, '');
  return id;
}

function closeLayer(id: number) {
  const i = stack.findIndex((l) => l.id === id);
  if (i < 0) return; // already closed by back
  const steps = stack.splice(i).filter((l) => l.pushed).length; // it, and anything opened above it
  if (!steps) return;
  moving++;
  history.go(-steps);
  // Should the browser never report that step (some merge several into one), carry on after a moment.
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 500);
}

/** While `open`, the phone's / browser's back calls `onBack` (which should close it) instead of leaving the app. */
export function useBackLayer(open: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!open) return;
    const id = openLayer(() => cb.current());
    return () => closeLayer(id);
  }, [open]);
}

/** The app's own ‹ (Nov 16): close the top open layer directly, not through the browser's history (a leftover step
 *  there could make history.back() close nothing). Its own closing removes its history step. False if none is open. */
export function closeTop(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onBack();
  return true;
}
