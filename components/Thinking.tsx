'use client';
// The word while the AI works (Nov 15): instead of a fixed "Thinking…", it moves along every couple of seconds the
// way Claude's does — Thinking, Considering, Trachting… Starts on a different word each time.
import { useEffect, useState } from 'react';

const WORDS = ['Thinking', 'Considering', 'Trachting', 'Mulling it over', 'Pondering', 'Weighing it up', 'Learning it through', 'Working it out', 'Looking inside', 'Putting it together', 'Turning it over', 'Chewing on it'];

export default function Thinking() {
  const [i, setI] = useState(() => Math.floor(Math.random() * WORDS.length));
  useEffect(() => {
    const t = window.setInterval(() => setI((k) => (k + 1 + Math.floor(Math.random() * 3)) % WORDS.length), 2600);
    return () => window.clearInterval(t);
  }, []);
  return <span className="thinking-word" key={i}>{WORDS[i]}…</span>;
}
