'use client';
// Going back, the same everywhere: the phone's or browser's back (the back button, a swipe from the edge) steps back
// one screen inside the app (closes the Library, the map, Settings, goes back to Home) instead of leaving it.
//
// Each screen or panel that can be "backed out of" is a layer. Opening it adds one step to the browser's history;
// back closes the top layer. Closing it with the app's own ✕ or ‹ removes its step again, so the history always
// matches what is open.
import { useEffect, useRef } from 'react';

type Layer = { id: number; onBack: () => void };
const stack: Layer[] = [];
let seq = 0;
let skip = 0;            // our own history.go() calls still to come back as popstate events
const waiting: number[] = []; // layers opened while one of our history.go() calls is still on its way
let ready = false;

function init() {
  if (ready || typeof window === 'undefined') return;
  ready = true;
  window.addEventListener('popstate', () => {
    if (skip > 0) {
      skip--;
      if (!skip) while (waiting.length) history.pushState({ layer: waiting.shift() }, '');
      return;
    }
    const top = stack.pop();
    top?.onBack();
  });
}

function openLayer(onBack: () => void): number {
  init();
  const id = ++seq;
  stack.push({ id, onBack });
  if (skip > 0) waiting.push(id); // wait until our own step back has landed, or it would undo this one
  else history.pushState({ layer: id }, '');
  return id;
}

function closeLayer(id: number) {
  const i = stack.findIndex((l) => l.id === id);
  if (i < 0) return; // already closed by back
  const removed = stack.splice(i);
  // Steps not pushed yet are just forgotten; the pushed ones are taken back.
  let pushed = 0;
  for (const l of removed) { const w = waiting.indexOf(l.id); if (w >= 0) waiting.splice(w, 1); else pushed++; }
  if (pushed > 0) { skip++; history.go(-pushed); }
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
