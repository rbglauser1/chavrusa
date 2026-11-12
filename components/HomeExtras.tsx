'use client';
// Home's optional cards (Settings → Extras): the Notebook, Chazara (review) and Progress and plans.
import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/config';
import Progress from './Progress';
import LearningTime from './LearningTime';

type Recap = { sessionId: string; title: string; when: string; points: string[]; questions: { q: string; a: string }[] };

function ago(iso: string): string {
  const d = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function RecapCard({ r, label }: { r: Recap; label: string }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  return (
    <div className="hx-recap">
      <div className="hx-sub">{label} · {r.title} · {ago(r.when)}</div>
      <ul className="hx-points">{r.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      {r.questions.map((q, i) => (
        <div key={i} className="hx-q">
          <div className="hx-qq">{q.q}</div>
          {shown.has(i) ? <div className="hx-qa">{q.a}</div> : <button className="linklike" onClick={() => setShown((s) => new Set(s).add(i))}>Show the answer</button>}
        </div>
      ))}
    </div>
  );
}

function Chazara() {
  const [data, setData] = useState<{ last: Recap | null; older: Recap | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => { if (open && !data) fetch('/api/chazara').then((r) => r.json()).then(setData).catch(() => setData({ last: null, older: null })); }, [open, data]);
  const hear = async () => {
    const r = data?.last; if (!r) return;
    setSpeaking(true);
    try {
      const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Chazara. ${r.title}. ${r.points.join(' ')}` }) });
      if (res.ok) { const a = new Audio(URL.createObjectURL(await res.blob())); a.onended = () => setSpeaking(false); await a.play(); } else setSpeaking(false);
    } catch { setSpeaking(false); }
  };
  return (
    <div className="hx-card">
      <button className="hx-head" onClick={() => setOpen((o) => !o)}><span>Chazara</span><span className="muted">{open ? 'Hide' : 'Review what you learned'}</span></button>
      {open && data && (data.last || data.older) && <div className="ai-note left">Recap written by AI · AI makes mistakes</div>}
      {open && !data && <div className="muted hx-wait">Putting it together…</div>}
      {open && data && !data.last && !data.older && <div className="muted hx-wait">Nothing to review yet. Learn a little, and it will be here.</div>}
      {open && data?.last && (
        <>
          <RecapCard r={data.last} label="Last time" />
          <button className="btn ghost hx-hear" disabled={speaking} onClick={() => void hear()}>{speaking ? 'Playing…' : '🔊 Hear the recap'}</button>
        </>
      )}
      {open && data?.older && data.older.sessionId !== data.last?.sessionId && <RecapCard r={data.older} label="From before" />}
    </div>
  );
}

export default function HomeExtras({ settings, onOpen, onSettings }: { settings: Settings; onOpen: (ref: string) => void; onSettings: (patch: Partial<Settings>) => void }) {
  const notes = settings.notes !== false;
  return (
    <div className="hx">
      <LearningTime goal={settings.timeGoal ?? 0} />
      {notes && (
        <button className="hx-card hx-nb" onClick={() => window.dispatchEvent(new Event('chavrusa-notebook'))}>
          <b>Notebook</b><span className="muted">All your notes, by sefer and topic</span>
        </button>
      )}
      {settings.chazara && <Chazara />}
      {settings.progress && <Progress settings={settings} onOpen={onOpen} onSettings={onSettings} />}
    </div>
  );
}
