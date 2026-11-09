'use client';
// The sugya map (Settings → Extras), all in English: the big picture of the amud or perek, then each topic with its
// intro, the background it needs, its steps as a timeline, and where it ends up. Tap a step (or a topic) to go to its line.
// Beside the AI's outline, straight from Sefaria (no AI): the meforshim on each step (tap one: it opens under its line),
// and under each topic where the halacha is ruled and the pesukim it quotes (tap one: its words open right here).
import { useEffect, useState } from 'react';

type Linked = { line: number; title: string; ref: string };
type Comm = { title: string; refs: string[] };
type Links = { halacha: Linked[]; verses: Linked[]; comm: Record<string, Comm[]> };
const NICE: Record<string, string> = { Tosafot: 'Tosafos', 'Tosafot Yom Tov': 'Tosfos Yom Tov', 'Rabbeinu Bahya': 'Rabbeinu Bachya' };
const FIRST = ['Rashi', 'Tosafot', 'Bartenura', 'Onkelos', 'Ramban', 'Rashbam', 'Ibn Ezra', 'Sforno', 'Tosafot Yom Tov', 'Rashba', 'Ritva', 'Ran', 'Maharsha'];
const rank = (t: string) => { const k = FIRST.indexOf(t); return k < 0 ? 99 : k; };
// A step's label reads as the flow of the text: "The Gemara asks", "Rav Pappa answers", "Proof".
const VERB: Record<string, string> = { Question: 'asks', Answer: 'answers', Proof: 'brings a proof', Rejection: 'pushes it off', Statement: 'says', Opinion: 'holds', Reason: 'explains', Speech: 'speaks', Prayer: 'prays' };
const labelOf = (s: { kind: string; who: string }) => (s.who && VERB[s.kind] ? `${s.who} ${VERB[s.kind]}` : `${s.kind}${s.who ? ` · ${s.who}` : ''}`);

// A halacha or a pasuk: tap to open its words right here, each piece with its English: Sefaria's when it has one,
// else a translation by the AI (made once per piece and kept for good, app/api/translate).
const clean = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
function LinkRow({ x, onOpen }: { x: Linked; onOpen?: (ref: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<{ he: string[]; en: string[] } | null | 'none'>(null);
  const [ai, setAi] = useState<Record<number, string | 'busy' | 'failed'>>({});
  const translate = (he: string[], en: string[]) => {
    he.forEach((h, i) => {
      if (clean(en[i] ?? '') || !clean(h) || i >= 12) return;
      setAi((a) => ({ ...a, [i]: 'busy' }));
      fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean(h) }) })
        .then((r) => r.json()).then((d) => setAi((a) => ({ ...a, [i]: d.translation ? String(d.translation) : 'failed' })))
        .catch(() => setAi((a) => ({ ...a, [i]: 'failed' })));
    });
  };
  const toggle = () => {
    setOpen((o) => !o);
    if (text) return;
    fetch(`/api/commentary?refs=${encodeURIComponent(x.ref)}`).then((r) => r.json())
      .then((d) => {
        if (!d.he?.length) { setText('none'); return; }
        const t = { he: d.he as string[], en: (d.en ?? []) as string[] };
        setText(t);
        translate(t.he, t.en);
      }).catch(() => setText('none'));
  };
  const usedAi = Object.values(ai).some((v) => v !== 'busy' && v !== 'failed');
  return (
    <li className={`smap-link ${open ? 'open' : ''}`}>
      <button className="smap-link-name" onClick={toggle}>{x.title}<span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
      {open && (
        <div className="smap-link-text">
          {!text ? <div className="muted">Opening…</div>
            : text === 'none' ? <div className="muted">Couldn’t open it.</div>
            : text.he.map((h, i) => {
              const en = clean(text.en[i] ?? ''), mine = ai[i];
              return (
                <div key={i}>
                  <div className="he" dir="rtl">{clean(h)}</div>
                  {en ? <div className="en">{en}</div>
                    : mine === 'busy' ? <div className="en muted">Translating…</div>
                    : mine && mine !== 'failed' ? <div className="en">{mine}</div>
                    : null}
                </div>
              );
            })}
          {usedAi && <div className="muted smap-ai-note">English translated by the AI.</div>}
          {onOpen && <button className="linklike" onClick={() => onOpen(x.ref)}>Learn it in the Sefer ↗</button>}
        </div>
      )}
    </li>
  );
}

type Step = { line: number; kind: string; who: string; summary: string };
type Topic = { title: string; line: number; intro: string; background: string[]; steps: Step[]; takeaway: string };

export default function SugyaMap({ refText, title = 'Sugya map', here, onGo, onClose, onComm, onOpen, tier, inline }: {
  refText: string; title?: string; here?: number; onGo: (line: number) => void; onClose: () => void;
  tier?: 'top' | 'middle'; // the comparison page: this model's map
  inline?: boolean;         // shown on a page, not as a sheet
  onComm?: (line: number, c: Comm) => void; // open a meforesh under its line
  onOpen?: (ref: string) => void;           // open a halacha or a pasuk in the Sefer
}) {
  const [links, setLinks] = useState<Links | null>(null);
  useEffect(() => {
    let gone = false;
    setLinks(null);
    fetch(`/api/map/links?ref=${encodeURIComponent(refText)}`).then((r) => r.json()).then((d) => { if (!gone) setLinks({ halacha: d.halacha ?? [], verses: d.verses ?? [], comm: d.comm ?? {} }); }).catch(() => {});
    return () => { gone = true; };
  }, [refText]);
  const [data, setData] = useState<{ overview: string; topics: Topic[]; model?: string; usd?: number } | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setData(null); setErr('');
    fetch(`/api/map?ref=${encodeURIComponent(refText)}${tier ? `&tier=${tier}` : ''}`).then((r) => r.json()).then((d) => {
      if (gone) return;
      const topics: Topic[] = d.topics?.length ? d.topics : d.steps?.length ? [{ title: '', line: d.steps[0].line, intro: '', background: [], steps: d.steps, takeaway: '' }] : [];
      if (topics.length) setData({ overview: d.overview ?? '', topics, model: d.model, usd: d.usd }); else setErr(d.error ? 'The map couldn’t be made just now.' : 'No map for this text.');
    }).catch(() => { if (!gone) setErr('The map couldn’t be made just now.'); });
    return () => { gone = true; };
  }, [refText, tick, tier]);
  // The step we're in: the last one starting at or before the line we're on.
  const all = data ? data.topics.flatMap((t) => t.steps) : [];
  const atStep = here ? all.reduce<Step | null>((k, s) => (s.line <= here ? s : k), null) : null;
  const go = (line: number) => { onGo(line); onClose(); };
  // Where each step and topic ends: just before the next one begins.
  const starts = [...new Set(all.map((x) => x.line))].sort((a, b) => a - b);
  const endOf = (line: number) => { const nx = starts.find((x) => x > line); return nx ? nx - 1 : Infinity; };
  const topicStart = (t: Topic) => Math.min(t.line, ...t.steps.map((x) => x.line));
  const topicEnd = (ti: number) => { const nx = data?.topics[ti + 1]; return nx ? topicStart(nx) - 1 : Infinity; };
  // The meforshim on a step: each one once, at the first line of the step it is on; the usual ones first.
  const commsOn = (from: number, to: number) => {
    if (!links) return [];
    const got = new Map<string, { line: number; c: Comm }>();
    for (const [n, list] of Object.entries(links.comm)) {
      const ln = Number(n);
      if (ln < from || ln > to) continue;
      for (const c of list) { const had = got.get(c.title); if (!had || ln < had.line) got.set(c.title, { line: ln, c }); }
    }
    return [...got.values()].sort((a, b) => rank(a.c.title) - rank(b.c.title) || a.c.title.localeCompare(b.c.title));
  };
  const [moreFor, setMoreFor] = useState<string | null>(null);
  return (
    <div className={inline ? 'smap-page' : 'smap-back'} onClick={inline ? undefined : onClose}>
      <div className="smap" onClick={(e) => e.stopPropagation()} role={inline ? undefined : 'dialog'} aria-label={title}>
        {inline
          ? data?.model && <div className="muted smap-made">Made by {data.model}{typeof data.usd === 'number' ? ` · cost ${data.usd < 0.01 ? 'under 1¢' : `${(data.usd * 100).toFixed(1)}¢`} (once)` : ''}</div>
          : <div className="smap-head"><span>{title} · {refText}</span><button className="smap-x" onClick={onClose} aria-label="Close">×</button></div>}
        {!data && !err && <div className="muted smap-wait">Laying it out…</div>}
        {err && <div className="muted smap-wait">{err} <button className="linklike" onClick={() => setTick((n) => n + 1)}>Try again</button></div>}
        {data && (
          <>
            {data.overview && <div className="smap-overview"><span className="smap-label">The big picture</span><p>{data.overview}</p></div>}
            {data.topics.map((t, ti) => (
              <section key={ti} className="smap-topic">
                {t.title && (
                  <button className="smap-topic-head" onClick={() => go(t.line)}>
                    <span className="smap-topic-n">{data.topics.length > 1 ? `${ti + 1}` : ''}</span>
                    <span className="smap-topic-title">{t.title}</span>
                    <span className="smap-line">line {t.line}</span>
                  </button>
                )}
                {t.intro && <p className="smap-intro">{t.intro}</p>}
                {t.background.length > 0 && (
                  <div className="smap-bg">
                    <span className="smap-label">Good to know</span>
                    <ul>{t.background.map((b, i) => { const m = b.match(/^([^:]{1,40}):\s*(.*)$/); return <li key={i}>{m ? <><b>{m[1]}</b>: {m[2]}</> : b}</li>; })}</ul>
                  </div>
                )}
                <ol className="smap-list">
                  {t.steps.map((s, i) => (
                    <li key={i} className={`smap-step k-${s.kind.toLowerCase()} ${s === atStep ? 'here' : ''}`}>
                      <button onClick={() => go(s.line)}>
                        <span className="smap-kind">{labelOf(s)}</span>
                        <span className="smap-sum">{s.summary}</span>
                        <span className="smap-line">line {s.line}</span>
                      </button>
                      {(() => {
                        // Once per line: on the last step that begins on it (a question and its answer on one line share them).
                        const nextStep = t.steps[i + 1] ?? data.topics[ti + 1]?.steps[0];
                        if (nextStep && nextStep.line === s.line) return null;
                        const cs = commsOn(s.line, endOf(s.line));
                        if (!cs.length || !onComm) return null;
                        const key = `${ti}-${i}`, all2 = moreFor === key, shown = all2 ? cs : cs.slice(0, 4);
                        return (
                          <div className="smap-tags">
                            <span className="smap-tags-label">Meforshim:</span>
                            {shown.map(({ line, c }) => <button key={c.title} onClick={() => { onComm(line, c); onClose(); }}>{NICE[c.title] ?? c.title}</button>)}
                            {cs.length > 4 && <button className="more" onClick={() => setMoreFor(all2 ? null : key)}>{all2 ? 'Less' : `+${cs.length - 4}`}</button>}
                          </div>
                        );
                      })()}
                    </li>
                  ))}
                </ol>
                {t.takeaway && <p className="smap-take"><span className="smap-label">Where it ends up</span>{t.takeaway}</p>}
                {links && (() => {
                  const from = ti === 0 ? 1 : topicStart(t), to = topicEnd(ti);
                  const inT = (x: Linked) => x.line >= from && x.line <= to;
                  const hal = links.halacha.filter(inT).slice(0, 8), vs = links.verses.filter(inT).slice(0, 10);
                  return (
                    <>
                      {hal.length > 0 && <div className="smap-links"><span className="smap-label">Where the halacha is</span><ul>{hal.map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}</ul></div>}
                      {vs.length > 0 && <div className="smap-links"><span className="smap-label">Verses quoted</span><ul>{vs.map((x) => <LinkRow key={x.ref} x={x} onOpen={onOpen} />)}</ul></div>}
                    </>
                  );
                })()}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
