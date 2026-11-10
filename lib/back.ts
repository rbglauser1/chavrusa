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
  for (const l of stack) if (!l.pushed) { l.pushed = true; history.pushState({ layer: l.id }, ''); }
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
    while (stack.length && stack[stack.length - 1].pushed && stack[stack.length - 1].id > landed) stack.pop()!.onBack();
    if (moving > 0 && --moving === 0) { if (flushTimer) window.clearTimeout(flushTimer); flush(); }
  });
}

function openLayer(onBack: () => void): number {
  init();
  const id = ++seq;
  const pushed = moving === 0;
  stack.push({ id, onBack, pushed });
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
