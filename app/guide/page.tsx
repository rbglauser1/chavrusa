'use client';
import { useEffect, useState } from 'react';
import { allStyles, BASE_EXCEPTIONS, BASE_FORMULA, CustomStyle } from '@/lib/config';

type Cost = 'free' | 'ai';
const DIRECTIONS: [string, [string, string, Cost][]][] = [
  ['Start', [
    ['“Berachos 36b,” “Peah, first perek,” “Shulchan Aruch Orach Chaim 239”', 'opens the place in the Sefer.', 'free'],
    ['“Today’s daf,” “this week’s parsha”', 'opens it.', 'free'],
    ['“Where were we?”', 'picks up where you left off.', 'free'],
    ['📚 Library', 'browse every sefer on Sefaria and open one.', 'free'],
  ]],
  ['Moving through the text', [
    ['“Next”', 'reads the next line, Hebrew phrase by phrase with the English, and stops. (“Go on,” “keep going” too.)', 'free'],
    ['“Continue”', 'goes on with the full basic formula: reads the next piece, explains if needed, says the move over, then your style’s question.', 'ai'],
    ['“Back,” “read it again”', 'goes back a line, or repeats it.', 'free'],
    ['“Next mishnah,” “next pasuk,” “next amud”', 'moves one step.', 'free'],
    ['Tap a line in the Sefer', 'that’s where you learn from; a call starts there.', 'free'],
  ]],
  ['Reading straight through', [
    ['“Read it through,” “shnayim mikra,” “read just the Hebrew”', 'reads with no pauses or questions.', 'free'],
    ['“Keep reading”', 'carries on from where it stopped.', 'free'],
    ['“Read the Tosafos”', 'reads that commentary word for word.', 'free'],
  ]],
  ['Commentaries', [
    ['“Open the Taz,” “let’s see the Rashi”', 'opens it on the line you’re on (or the next line that has one).', 'free'],
    ['“The Taz on se’if 3”', 'goes to that place.', 'free'],
    ['Buttons under each line in the Sefer', 'Rashi, Tosafos, Mishnah Berurah… and “Commentaries (N)” for all of them. “Learn it in the Sefer” opens one to learn together.', 'free'],
    ['“What is Tosafos asking?”', 'explains it, using the commentary’s actual words.', 'ai'],
  ]],
  ['Understanding', [
    ['Any question, “explain,” “why?”', 'answers it.', 'ai'],
    ['“Go deeper”', 'uses the top model for this turn and the next two.', 'ai'],
  ]],
  ['How we learn', [
    ['“Switch to Simple Explainer,” “simpler,” “be gentler,” “quiz me,” “push me harder”', 'changes the style.', 'free'],
    ['“You explain first,” “no English,” “slower,” anything else', 'it follows for the rest of the session.', 'ai'],
    ['“From now on…,” “always…”', 'saves it as a lasting rule.', 'ai'],
    ['“What do you remember about me?”', 'shows what it saved.', 'free'],
    ['“Forget that”', 'removes a saved rule.', 'ai'],
  ]],
  ['Wrapping up', [
    ['“Let’s stop here”', 'a short summary and review questions.', 'ai'],
    ['“Thanks,” “bye”', 'a short goodbye.', 'free'],
  ]],
];

// "How we learn": the rules the Chavrusa follows, inside the app. The formula and the styles come straight from
// the same definitions the AI is given, so this page is always up to date.
export default function Guide() {
  const [current, setCurrent] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomStyle[]>([]);
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s.style) setCurrent(s.style);
      if (Array.isArray(s.customStyles)) setCustom(s.customStyles);
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
        <h2>What you can say</h2>
        <p className="muted">By voice or typing. <span className="tag free">free</span> means no AI is used; <span className="tag ai">AI</span> means it is.</p>
        {DIRECTIONS.map(([group, items]) => (
          <div key={group} className="guide-dir">
            <h3>{group}</h3>
            <ul>
              {items.map(([say, what, cost]) => (
                <li key={say}><b>{say}</b> {what} <span className={`tag ${cost}`}>{cost === 'free' ? 'free' : 'AI'}</span></li>
              ))}
            </ul>
          </div>
        ))}
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
        {allStyles(custom).map((s) => (
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
        <h2>How it learns with you</h2>
        <ul>
          <li>One step at a time: one phrase, one line, or one step of logic per turn. Never a whole sugya, perek or Rashi at once.</li>
          <li>Short turns: about 150 words unless the style or you say otherwise; shorter in a voice call.</li>
          <li>Plain, modern English: never “thou,” “hath,” “unto.”</li>
          <li>Yeshivish Ashkenazi pronunciation and spelling (Shabbos, Tosafos, mitzvos), and “Hashem” and “Elokim” for the Names.</li>
          <li>For halacha it leads with the Ashkenazi poskim (Rema, Mishnah Berurah), while noting the Shulchan Aruch.</li>
          <li>It finds places the way a printed sefer shows them: “at the two dots,” “the line starting with…,” “the next line.” If more than one place fits, it asks which.</li>
        </ul>
      </section>

      <section>
        <h2>A session</h2>
        <ol>
          <li>No topic yet? It offers a few: today's daf, this week's parsha, or where you left off.</li>
          <li>It states the question of the sugya in a sentence or two, then goes step by step with the basic formula.</li>
          <li>You can say next, continue, go back, deeper, simpler, skip, read it again, or change style at any time.</li>
          <li>When you stop: a short summary, who holds what, and two or three review questions.</li>
        </ol>
      </section>

      <section>
        <h2>Texts, sources and boundaries</h2>
        <ul>
          <li>Lashon kodesh first, phrase by phrase, then the English, unless you tell it otherwise.</li>
          <li>It quotes only text it actually opened, and never invents a source, quote or opinion.</li>
          <li>Commentaries only when you ask for one. Iyun brings the Rishonim and Acharonim by itself; Mussar and Chassidic bring their seforim on Chumash and Tanach.</li>
          <li>Only Orthodox sources: no academic or non-Orthodox works.</li>
          <li>For a practical question about what you should do, ask your rav. It's a learning partner, not a posek.</li>
          <li>Off-topic requests: it declines in a friendly sentence and steers back to learning.</li>
          <li>It reminds you that it can make mistakes only when it matters (practical halacha, sensitive hashkafa, or an uncertain source).</li>
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
