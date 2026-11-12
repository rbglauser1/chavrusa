'use client';
// Learning time on Home: today and this week, and a line that fills toward the day's goal (Settings → Extras →
// Learning time goal). Counted by the app (app/page.tsx → app/api/time).
import { useEffect, useState } from 'react';

export const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

export default function LearningTime({ goal }: { goal: number }) {
  const [days, setDays] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/time').then((r) => r.json()).then((d) => setDays(d.days ?? {})).catch(() => setDays({}));
    load();
    const f = () => load();
    window.addEventListener('chavrusa-time', f);
    return () => window.removeEventListener('chavrusa-time', f);
  }, []);
  if (!days) return null;
  const now = new Date();
  const today = days[dayOf(now)] ?? 0;
  // The week from Sunday.
  let week = 0;
  for (let k = 0; k <= now.getDay(); k++) { const d = new Date(now); d.setDate(now.getDate() - k); week += days[dayOf(d)] ?? 0; }
  if (!today && !week && !goal) return null;
  const pct = goal ? Math.min(100, Math.round((today / goal) * 100)) : 0;
  return (
    <div className="hx-card lt">
      <div className="lt-row"><b>Learning time</b><span className="muted">This week {fmt(week)}</span></div>
      <div className="lt-today">Today <b>{fmt(today)}</b>{goal ? <span className="muted"> of {fmt(goal)}</span> : null}{goal && today >= goal ? <span className="lt-done"> ✓</span> : null}</div>
      {goal > 0 && <div className="lt-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}
