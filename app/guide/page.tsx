'use client';
import { useEffect, useState } from 'react';
import { BASE_EXCEPTIONS, BASE_FORMULA, STYLES } from '@/lib/config';

// "How we learn": the rules the Chavrusa follows, inside the app. The formula and the styles come straight from
// the same definitions the AI is given, so this page is always up to date.
export default function Guide() {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s.style) setCurrent(s.style);
      if (s.theme) document.documentElement.dataset.look = s.theme;
    }).catch(() => {});
  }, []);

  // "GOAL: …\nPACE: …" -> labelled lines.
  const lines = (behavior: string) => behavior.split('\n').map((l) => l.match(/^([A-Z][A-Z ']+):\s*(.*)$/) ?? [l, '', l]);
  const cap = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

  return (
    <div className="lab guide">
      <header className="lab-head">
        <a href="/" className="brand" style={{ textDecoration: 'none' }}>חברותא</a>
        <h1>How we learn</h1>
        <a href="/" style={{ marginLeft: 'auto', fontSize: 14 }}>← Back to learning</a>
      </header>

      <section>
        <h2>Above all: your directions</h2>
        <ul>
          <li>Whatever you tell it (pace, depth, length, “no English,” “you explain first,” a different style) it does right away, for the rest of the session.</li>
          <li>Say “always” or “from now on” and it saves it as a lasting rule (see Settings → what it remembers).</li>
          <li>Your directions override everything on this page, except the Orthodox perspective and never inventing sources.</li>
        </ul>
      </section>

      <section>
        <h2>The basic formula</h2>
        <p className="muted">Every style builds on this whenever you move through the text.</p>
        <ol className="guide-steps">
          {BASE_FORMULA.map((f) => <li key={f.label}><b>{f.label}:</b> {f.text}</li>)}
        </ol>
        <p className="muted">{BASE_EXCEPTIONS}</p>
      </section>

      <section>
        <h2>Learning styles</h2>
        <p className="muted">Each style is its own addition on top of the basic formula. Switch in Settings, or just say it (“switch to Simple Explainer,” “be gentler,” “quiz me”).</p>
        {STYLES.map((s) => (
          <details key={s.id} className={`guide-style ${current === s.id ? 'on' : ''}`} open={current === s.id}>
            <summary><b>{s.name}</b>{current === s.id && <span className="guide-now">your style</span>}<span className="muted"> · {s.blurb}</span></summary>
            <dl>
              {lines(s.behavior).map(([, k, v], i) => (k ? <div key={i}><dt>{cap(k)}</dt><dd>{v}</dd></div> : <div key={i}><dd>{v}</dd></div>))}
              {s.maxWords && <div><dt>Length</dt><dd>up to about {s.maxWords} words a turn</dd></div>}
            </dl>
          </details>
        ))}
      </section>

      <section>
        <h2>Texts and sources</h2>
        <ul>
          <li>Lashon kodesh first, phrase by phrase, then the English, unless you tell it otherwise.</li>
          <li>It quotes only text it actually opened, and never invents a source, quote or opinion.</li>
          <li>Commentaries only when you ask for one. Iyun brings the Rishonim and Acharonim by itself; Mussar and Chassidic bring their seforim on Chumash and Tanach.</li>
          <li>Only Orthodox sources: no academic or non-Orthodox works.</li>
          <li>For a practical question about what you should do, ask your rav. It's a learning partner, not a posek.</li>
        </ul>
      </section>

      <section>
        <h2>What's free and what uses AI</h2>
        <ul>
          <li><b>“Next” vs “continue”:</b> say <b>“next”</b> to just read the next line with its English, free. Say <b>“continue”</b> to go on with the full formula (read, explain if needed, say the move over, then the style's question): that uses AI.</li>
          <li><b>Free (no AI):</b> opening a place, “next” and “go back,” tapping a line, the Library, commentary buttons in the Sefer, reading straight through (shnayim mikra), switching style.</li>
          <li><b>Uses AI:</b> questions, explanations, and anything that needs understanding. With Saver on, everyday turns use the middle model; “go deeper” uses the top model for that turn and the next two. Under each reply you can see if AI was used and why.</li>
        </ul>
      </section>
    </div>
  );
}
