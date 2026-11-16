'use client';
// The Lab (Nov 15): the learner narrowed the app down. Every other look and all the testing options (voice tests, the
// Hebrew reading tests, the rule lab, the call recorder, GPT-Live or Gemini, keeping it steady) live in the Lab, which
// is on only for this device: open the app with ?lab=1 (or Settings → Lab), and ?lab=0 / "Leave the Lab" to go back.
import { useEffect, useState } from 'react';

const KEY = 'chavrusa-lab';
export function readLab(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('lab');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}
export function setLab(on: boolean) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* fine */ }
  window.dispatchEvent(new Event('chavrusa-lab'));
}
export function useLab(): boolean {
  const [lab, set] = useState(false);
  useEffect(() => {
    set(readLab());
    const on = () => set(readLab());
    window.addEventListener('chavrusa-lab', on);
    return () => window.removeEventListener('chavrusa-lab', on);
  }, []);
  return lab;
}
