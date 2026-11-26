'use client';
// Nov 25: Bechina: test yourself on the Gemara you learned. Choose how much (this amud, this daf, the last 2 or 5 dafim),
// whether to be asked on Tosafos too (no / some / mostly Tosafos), multiple choice or written answers or both, how many
// questions, and the level (basic / standard / iyun). One question at a time; a written answer is marked by the AI
// (right / partly / not yet, and what was missing). At the end: the score, what to go back to, and a note in the
// Notebook if he wants. Opened from the reader's ⋯ menu and from Review (event 'chavrusa-bechina').
import { useEffect, useState } from 'react';
import { nextSection, prevSection } from '@/lib/refs';

type BQ = { type: 'mc' | 'open'; on: 'gemara' | 'tosafos'; ref: string; line: number; dh?: string; q: string; options?: string[]; answer: number | string; why: string };
type Mark = { pts: number; his?: string | number; note?: string };
type Span = 'amud' | 'daf' | 'two' | 'five';
type Opts = { span: Span; tosafos: 'none' | 'some' | 'focus'; format: 'mc' | 'open' | 'mix'; count: number; level: 'basic' | 'standard' | 'iyun'; lang: 'en' | 'he' };
const OPT_KEY = 'chavrusa-bechina-opts', HIST_KEY = 'chavrusa-bechinos';

const shortRef = (r: string) => r.replace(/^.* (\d+[ab])$/, '$1');
function amudim(base: string, span: Span): string[] {
  const m = base.match(/(\d+)([ab])$/);
  if (span === 'amud' || !m) return [base];
  if (span === 'daf') { const o = m[2] === 'a' ? nextSection(base) : prevSection(base); return o ? (m[2] === 'a' ? [base, o] : [o, base]) : [base]; }
  const want = span === 'two' ? 4 : 10;
  const out = [base];
  // Up to the end of this daf, then back from there.
  if (m[2] === 'a') { const b = nextSection(base); if (b) out.push(b); }
  while (out.length < want) { const p = prevSection(out[0]); if (!p) break; out.unshift(p); }
  return out;
}

export default function Bechina({ refText, onGo, onClose }: { refText: string; onGo: (ref: string, line: number) => void; onClose: () => void }) {
  const base = refText.replace(/:\d+(-\d+)?$/, '');
  const talmud = /\d+[ab]$/.test(base);
  const [o, setO] = useState<Opts>({ span: 'amud', tosafos: 'none', format: 'mix', count: 10, level: 'standard', lang: 'en' });
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(OPT_KEY) || 'null'); if (s) setO((x) => ({ ...x, ...s })); } catch { /* optional */ } }, []);
  const [stage, setStage] = useState<'setup' | 'wait' | 'quiz' | 'done'>('setup');
  const [err, setErr] = useState('');
  const [qs, setQs] = useState<BQ[]>([]);
  const [set, setSet] = useState(1);
  const [i, setI] = useState(0);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [draft, setDraft] = useState('');
  const [grading, setGrading] = useState(false);
  const [saved, setSaved] = useState(false);
  const refs = amudim(base, talmud ? o.span : 'amud');
  const label = refs.length > 1 ? `${refs[0]} – ${shortRef(refs[refs.length - 1])}` : refs[0];
  const set1 = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((x) => { const n = { ...x, [k]: v }; try { localStorage.setItem(OPT_KEY, JSON.stringify(n)); } catch { /* optional */ } return n; });

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const start = (which = set) => {
    setStage('wait'); setErr(''); setMarks({}); setI(0); setDraft(''); setSaved(false); setSet(which);
    fetch('/api/bechina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refs, tosafos: talmud ? o.tosafos : 'none', format: o.format, count: o.count, level: o.level, set: which, lang: o.lang }) })
      .then((r) => r.json()).then((d) => {
        if (d.questions?.length) { setQs(d.questions); setStage('quiz'); } else { setErr(d.error || 'The bechina couldn’t be made just now.'); setStage('setup'); }
      }).catch(() => { setErr('The bechina couldn’t be made just now.'); setStage('setup'); });
  };
  const q = qs[i];
  const mark = marks[i];
  const pickMc = (k: number) => { if (mark) return; setMarks((m) => ({ ...m, [i]: { pts: k === q.answer ? 2 : 0, his: k } })); };
  const sendOpen = (dontKnow = false) => {
    const his = dontKnow ? '' : draft.trim();
    if (!dontKnow && !his) return;
    if (dontKnow) { setMarks((m) => ({ ...m, [i]: { pts: 0, his: '—', note: '' } })); return; }
    setGrading(true);
    fetch('/api/bechina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: { q: q.q, answer: q.answer, his, ref: q.ref, line: q.line, dh: q.dh, he: o.lang === 'he' } }) })
      .then((r) => r.json()).then((d) => setMarks((m) => ({ ...m, [i]: { pts: typeof d.score === 'number' ? d.score : 0, his, note: d.note || d.error || '' } })))
      .catch(() => setMarks((m) => ({ ...m, [i]: { pts: 0, his, note: 'It couldn’t be marked just now.' } })))
      .finally(() => setGrading(false));
  };
  const next = () => {
    setDraft('');
    if (i + 1 < qs.length) { setI(i + 1); return; }
    setStage('done');
    const pts = (Object.values(marks) as Mark[]).reduce((a: number, m: Mark) => a + m.pts, 0);
    try {
      const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
      localStorage.setItem(HIST_KEY, JSON.stringify([...(Array.isArray(h) ? h : []), { label, pct: Math.round((pts / (qs.length * 2)) * 100), n: qs.length, tosafos: o.tosafos, at: Date.now() }].slice(-50)));
    } catch { /* optional */ }
  };
  const total = (Object.values(marks) as Mark[]).reduce((a: number, m: Mark) => a + m.pts, 0);
  const pct = qs.length ? Math.round((total / (qs.length * 2)) * 100) : 0;
  const where = (x: BQ) => `${x.on === 'tosafos' ? `Tosafos${x.dh ? ` ד״ה ${x.dh}` : ''}` : 'Gemara'} · ${shortRef(x.ref)}, line ${x.line}`;
  const save = () => {
    const missed = qs.map((x, k) => ({ x, m: marks[k] })).filter((y) => (y.m?.pts ?? 0) < 2).map((y) => `${shortRef(y.x.ref)}:${y.x.line}`);
    fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refs[0], n: 1, text: `Bechina on ${label}${o.tosafos !== 'none' && talmud ? ' (with Tosafos)' : ''}: ${pct}% (${qs.length} questions, ${o.level})${missed.length ? `. To go over: ${missed.join(', ')}` : ''}` }) })
      .then((r) => { if (r.ok) setSaved(true); }).catch(() => {});
  };
  let hist: { label: string; pct: number; at: number }[] = [];
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); hist = Array.isArray(h) ? h.slice(-3).reverse() : []; } catch { /* optional */ }

  const Seg = <T extends string | number>({ value, list, on }: { value: T; list: [T, string][]; on: (v: T) => void }) => (
    <span className="bx-seg">{list.map(([v, t]) => <button key={String(v)} type="button" className={value === v ? 'on' : ''} onClick={() => on(v)}>{t}</button>)}</span>
  );

  return (
    <div className="smap-back" onClick={onClose}>
      <div className="smap bx" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bechina">
        <div className="smap-head"><span>Bechina · {label}</span><button className="smap-x" onClick={onClose} aria-label="Close">×</button></div>

        {stage === 'setup' && (
          <div className="bx-setup">
            {talmud && <><label>How much</label><Seg value={o.span} on={(v) => set1('span', v)} list={[['amud', 'This amud'], ['daf', 'This daf'], ['two', 'Last 2 dafim'], ['five', 'Last 5 dafim']]} /></>}
            {talmud && <><label>Tosafos</label><Seg value={o.tosafos} on={(v) => set1('tosafos', v)} list={[['none', 'Gemara only'], ['some', 'Some Tosafos'], ['focus', 'Mostly Tosafos']]} /></>}
            <label>Questions</label><Seg value={o.format} on={(v) => set1('format', v)} list={[['mc', 'Multiple choice'], ['open', 'Written'], ['mix', 'Both']]} />
            <label>How many</label><Seg value={o.count} on={(v) => set1('count', v)} list={[[5, '5'], [10, '10'], [15, '15'], [20, '20']]} />
            <label>Language</label><Seg value={o.lang} on={(v) => set1('lang', v)} list={[['en', 'English'], ['he', 'עברית']]} />
            <label>Level</label><Seg value={o.level} on={(v) => set1('level', v)} list={[['basic', 'Basic'], ['standard', 'Standard'], ['iyun', 'Iyun']]} />
            <p className="muted bx-small">{label}{talmud && o.tosafos !== 'none' ? ', with Tosafos' : ''}. Written answers are marked by the AI; you can answer by typing or with the keyboard’s mic.</p>
            {err && <p className="bx-err">{err}</p>}
            <button className="bx-go" onClick={() => start(1)}>Start the bechina</button>
            {hist.length > 0 && <div className="bx-hist"><b>Your last bechinos</b>{hist.map((h, k) => <span key={k}>{h.label} · {h.pct}%</span>)}</div>}
          </div>
        )}

        {stage === 'wait' && <div className="muted smap-wait"><span className="wait-dots"><span /><span /><span /></span> Writing your bechina{refs.length > 2 ? ' (a long one takes up to a minute)' : ''}…</div>}

        {stage === 'quiz' && q && (
          <div className="bx-quiz">
            <div className="bx-prog"><span style={{ width: `${(i / qs.length) * 100}%` }} /></div>
            <div className="bx-meta"><span>{i + 1} of {qs.length}</span><span className={`bx-on ${q.on}`}>{where(q)}</span></div>
            <p className="bx-q" dir="auto">{q.q}</p>
            {q.type === 'mc' && q.options ? (
              <div className="bx-opts">
                {q.options.map((op, k) => (
                  <button key={k} type="button" dir="auto" disabled={!!mark}
                    className={!mark ? '' : k === q.answer ? 'right' : mark.his === k ? 'wrong' : 'dim'} onClick={() => pickMc(k)}>{op}</button>
                ))}
              </div>
            ) : !mark ? (
              <form className="bx-open" onSubmit={(e) => { e.preventDefault(); sendOpen(); }}>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} dir="auto" placeholder={o.lang === 'he' ? 'התשובה שלך… (or in English)' : 'Your answer…'} disabled={grading} />
                <span className="bx-row">
                  <button type="submit" disabled={!draft.trim() || grading}>{grading ? 'Marking…' : 'Submit'}</button>
                  <button type="button" className="ghost" disabled={grading} onClick={() => sendOpen(true)}>I don’t know</button>
                </span>
              </form>
            ) : null}
            {mark && (
              <div className={`bx-verdict p${mark.pts}`}>
                <b>{mark.pts === 2 ? 'Right' : mark.pts === 1 ? 'Partly' : q.type === 'mc' ? 'Not this one' : 'Not yet'}</b>
                {mark.note && <span dir="auto">{mark.note}</span>}
                {q.type === 'open' && <span className="bx-model" dir="auto"><i>A full answer:</i> {String(q.answer)}</span>}
                {q.why && <span className="bx-why" dir="auto">{q.why}</span>}
                <span className="bx-row">
                  <button type="button" onClick={next}>{i + 1 < qs.length ? 'Next question' : 'See my score'}</button>
                  <button type="button" className="ghost" onClick={() => { onGo(q.ref, q.line); onClose(); }}>Look inside</button>
                </span>
              </div>
            )}
          </div>
        )}

        {stage === 'done' && (
          <div className="bx-done">
            <div className="bx-score"><b>{pct}%</b><span>{qs.filter((_, k) => (marks[k]?.pts ?? 0) === 2).length} right · {qs.filter((_, k) => marks[k]?.pts === 1).length} partly · {qs.filter((_, k) => (marks[k]?.pts ?? 0) === 0).length} not yet</span></div>
            <p className="bx-cheer">{pct >= 90 ? 'Excellent: you know this well.' : pct >= 70 ? 'Good. Go over the few below and you have it.' : pct >= 50 ? 'A fair start. Go back over the places below.' : 'Worth learning it again. The places below are the ones to go over.'}</p>
            {qs.some((_, k) => (marks[k]?.pts ?? 0) < 2) && (
              <ol className="bx-miss">
                {qs.map((x, k) => ({ x, k, m: marks[k] })).filter((y) => (y.m?.pts ?? 0) < 2).map(({ x, k, m }) => (
                  <li key={k}><span dir="auto">{x.q}</span><small>{where(x)}{m?.pts === 1 ? ' · partly' : ''}</small><button className="linklike" onClick={() => { onGo(x.ref, x.line); onClose(); }}>Go there</button></li>
                ))}
              </ol>
            )}
            <span className="bx-row">
              <button type="button" disabled={saved} onClick={save}>{saved ? 'Saved to the Notebook ✓' : 'Save to the Notebook'}</button>
              <button type="button" className="ghost" onClick={() => start(set + 1)}>New bechina, new questions</button>
              <button type="button" className="ghost" onClick={() => setStage('setup')}>Change the options</button>
            </span>
            <p className="muted bx-small">Written by AI · AI makes mistakes. If a question looks wrong, check it inside.</p>
          </div>
        )}
      </div>
    </div>
  );
}
