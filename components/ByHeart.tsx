'use client';
// "By heart" on a line of Mishnah, Pirkei Avos or a pasuk (Settings → Extras → Learn by heart): the line, with more
// of its words hidden each round, until you say it all from memory. "Check me" listens (the phone's own speech
// recognition, in Hebrew; free) and marks each word you said or missed. Tap a hidden word to peek at it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { stripNikud } from '@/lib/hebrew';

const ROUNDS = [0, 0.25, 0.5, 0.75, 1];
const skel = (w: string) => stripNikud(w).replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }[c] as string));
// Which words hide in a round: spread through the line, the same ones every time (so each round adds to the last).
const order = (n: number) => Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));

type Rec = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

export default function ByHeart({ he, nikud, onClose }: { he: string; nikud: boolean; onClose: () => void }) {
  const words = useMemo(() => he.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean), [he]);
  const [round, setRound] = useState(1);
  const [peek, setPeek] = useState<Set<number>>(new Set());
  const [said, setSaid] = useState<boolean[] | null>(null);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState('');
  const rec = useRef<Rec | null>(null);
  const hidden = useMemo(() => new Set(order(words.length).slice(0, Math.round(words.length * ROUNDS[round]))), [words.length, round]);
  useEffect(() => () => rec.current?.abort(), []);
  const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = typeof window !== 'undefined' ? (W.SpeechRecognition ?? W.webkitSpeechRecognition) : undefined;

  const check = () => {
    if (!Ctor) { setMsg('This phone can’t listen here. Say it out loud, then tap “Show all” to check yourself.'); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = 'he-IL'; r.interimResults = false; r.continuous = true;
    let heard = '';
    r.onresult = (e) => { heard = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' '); };
    r.onerror = (e) => { setMsg(e.error === 'not-allowed' ? 'The microphone is off for this app (Settings on the phone).' : 'Couldn’t hear that. Try again.'); };
    r.onend = () => {
      setListening(false);
      if (!heard.trim()) return;
      // In order: each word of the line counts as said if it comes up within the next few words heard.
      const got = heard.split(/\s+/).map(skel).filter(Boolean);
      let j = 0;
      const marks = words.map((w) => { const s = skel(w); if (!s) return true; for (let k = j; k < Math.min(got.length, j + 4); k++) if (got[k] === s || (s.length > 3 && (got[k].startsWith(s.slice(0, -1)) || s.startsWith(got[k].slice(0, -1))))) { j = k + 1; return true; } return false; });
      setSaid(marks);
      const miss = marks.filter((x) => !x).length;
      setMsg(miss ? `${miss} word${miss > 1 ? 's' : ''} to work on (in red).` : 'Every word! On to the next round.');
    };
    rec.current = r; setSaid(null); setMsg(''); setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  return (
    <div className="comm line-x byheart" onClick={(e) => e.stopPropagation()}>
      <div className="comm-title">🧠 Learn by heart<button className="comm-x" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="bh-rounds">{ROUNDS.map((_, k) => <button key={k} className={k === round ? 'on' : ''} onClick={() => { setRound(k); setPeek(new Set()); setSaid(null); setMsg(''); }}>{k === 0 ? 'Read' : k === ROUNDS.length - 1 ? 'All hidden' : `Round ${k}`}</button>)}</div>
      <div className="he bh-text" dir="rtl">
        {words.map((w, k) => {
          const show = !hidden.has(k) || peek.has(k) || said !== null;
          const cls = said ? (said[k] ? 'bh-ok' : 'bh-miss') : '';
          return show
            ? <span key={k} className={cls}>{nikud ? w : stripNikud(w)} </span>
            : <button key={k} className="bh-blank" onClick={() => setPeek((p) => new Set(p).add(k))} aria-label="Show this word">{' '.repeat(Math.max(2, stripNikud(w).length))}</button>;
        })}
      </div>
      <div className="bh-btns">
        <button className={`btn ${listening ? 'primary' : ''}`} onClick={check}>{listening ? '■ Done' : '🎙 Check me'}</button>
        <button className="btn ghost" onClick={() => setSaid(words.map(() => true))}>Show all</button>
        {round < ROUNDS.length - 1 && <button className="btn ghost" onClick={() => { setRound(round + 1); setPeek(new Set()); setSaid(null); setMsg(''); }}>Next round ›</button>}
      </div>
      {listening && <div className="muted">Listening… say it, then tap Done.</div>}
      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
