// Focus help (Nov 16; Settings → Focus help): small helpers kept on this phone.
//  - the days learned in a row (the streak), counted from any learning on a day;
//  - the "Just 5 minutes" timer started from Home;
//  - whether the current call is a "sit with me" call (the chavrusa keeps him company while he reads on his own).

const DAYS = 'chavrusa-days';
const today = () => new Date().toLocaleDateString('en-CA'); // 2026-11-16, in the phone's own time zone

function days(): string[] { try { return JSON.parse(localStorage.getItem(DAYS) ?? '[]'); } catch { return []; } }
/** Mark today as a day of learning. Returns true the first time today. */
export function markLearned(): boolean {
  const d = days(), t = today();
  if (d.includes(t)) return false;
  try { localStorage.setItem(DAYS, JSON.stringify([...d, t].slice(-400))); } catch { /* optional */ }
  return true;
}
/** Days in a row, ending today (or yesterday, so a streak isn't lost before he learns today). */
export function streak(): number {
  const set = new Set(days());
  const at = new Date();
  if (!set.has(at.toLocaleDateString('en-CA'))) at.setDate(at.getDate() - 1);
  let n = 0;
  while (set.has(at.toLocaleDateString('en-CA'))) { n++; at.setDate(at.getDate() - 1); }
  return n;
}

// ——— Just 5 minutes ———
const FIVE = 'chavrusa-five', FIVE_LEN = 'chavrusa-five-len';
export function startFive(minutes = 5) {
  try { localStorage.setItem(FIVE, String(Date.now() + minutes * 60_000)); localStorage.setItem(FIVE_LEN, String(minutes)); } catch { /* optional */ }
  window.dispatchEvent(new Event('chavrusa-five'));
}
export function fiveEnd(): number | null { try { const v = Number(localStorage.getItem(FIVE)); return v > 0 ? v : null; } catch { return null; } }
export function fiveLen(): number { try { return Number(localStorage.getItem(FIVE_LEN)) || 5; } catch { return 5; } }
export function stopFive() { try { localStorage.removeItem(FIVE); } catch { /* optional */ } window.dispatchEvent(new Event('chavrusa-five')); }

// ——— Sit with me (a quiet voice call) ———
let sitting = false;
export const isSitting = () => sitting;
export function setSitting(on: boolean) { sitting = on; }

// ——— Small wins ———
const CHEERS = ['Nice work', 'Well done', 'Keep it up', 'Good going', 'That’s real learning', 'Step by step', 'You’re in it now', 'Shkoyach'];
export const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];
