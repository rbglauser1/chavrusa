'use client';
// "Learn with me" (the ✦, Nov 15): the chavrusa leads the learner through the section one line at a time, so the
// learning keeps pulling him in. For each line:
//   • Where we are — from the section's map: when a new topic begins, its background (what's being discussed, good to
//     know); on every line, the step it is ("Now the beraisa brings a proof").
//   • The line itself, Hebrew and English.
//   • Two ways to learn, his choice, switchable any time:
//       Ask me as we go — a short question first (type an answer, or "Show me"); the chavrusa answers what he said,
//                          then the full explanation is there to open.
//       Just learn       — no questions: straight to the explanation.
//   • A kashya at the real turning points only: try it, or just show the teretz.
//   • At the end of a topic, where it ended up; at the end of the section, the big picture and on to the next.
// The reading behind follows along. The question, the map and the explanation are each made once and kept.
import Thinking from './Thinking';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bullets, isHebrewText } from './Bullets';
import { WithSources } from './LineExtras';
import { useBackLayer } from '@/lib/back';
import { setVoiceGuide } from '@/lib/voiceGuide';
import { getMap, placeOf, stepLabel, topicBeginsAt, topicEndsAt, type MapData } from '@/lib/mapClient';

type Mode = 'ask' | 'learn';
type Guide = { question: string; hint: string; kashya: { q: string; teretz: string } | null };
const MODE_KEY = 'chavrusa-lwm-mode';
const readMode = (): Mode | null => { try { const v = localStorage.getItem(MODE_KEY); return v === 'ask' || v === 'learn' ? v : null; } catch { return null; } };
const plain = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '');

function useJson<T>(url: string | null): { data: T | null; err: boolean; retry: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let gone = false;
    setData(null); setErr(false);
    fetch(url).then((r) => r.json()).then((d) => { if (!gone) { if (d && !d.error) setData(d); else setErr(true); } }).catch(() => { if (!gone) setErr(true); });
    return () => { gone = true; };
  }, [url, tick]);
  return { data, err, retry: () => setTick((n) => n + 1) };
}

const Wait = ({ what }: { what: React.ReactNode }) => <div className="muted"><span className="wait-dots"><span /><span /><span /></span>{what}</div>;

export default function LearnWithMe({ refText, he, en, start, onGo, onNext, onClose, onVoice }: {
  refText: string; he: string[]; en: string[]; start: number; // start: the line to begin on (1-based)
  onGo: (n: number) => void; onNext?: () => void; onClose: () => void;
  onVoice?: () => void; // start (or restart) the voice call, which then leads from here (lib/voiceGuide)
}) {
  useBackLayer(true, onClose);
  const total = he.length;
  const [n, setN] = useState(Math.min(Math.max(1, start), total));
  const [mode, setModeState] = useState<Mode | null>(readMode);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* fine */ } };
  const [map, setMap] = useState<MapData | null>(null);
  const [mapErr, setMapErr] = useState(false);
  useEffect(() => { getMap(refText).then(setMap).catch(() => setMapErr(true)); }, [refText]);
  const done = n > total; // past the last line: the end of the section
  const lineRef = `${refText}:${n}`;
  const guide = useJson<Guide>(!done && mode === 'ask' ? `/api/guide?ref=${encodeURIComponent(lineRef)}` : null);
  const kGuide = useJson<Guide>(!done && mode === 'learn' ? `/api/guide?ref=${encodeURIComponent(lineRef)}` : null); // the kashya, in Just learn
  // Per line: his answer, the chavrusa's reply, whether the explanation / hint / teretz are open.
  const [answer, setAnswer] = useState('');
  const [reply, setReply] = useState<{ text: string } | 'wait' | 'err' | null>(null);
  const [showX, setShowX] = useState(false);
  const [hint, setHint] = useState(false);
  const [teretz, setTeretz] = useState(false);
  const [kAns, setKAns] = useState('');
  const [kReply, setKReply] = useState<{ text: string } | 'wait' | 'err' | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAnswer(''); setReply(null); setShowX(false); setHint(false); setTeretz(false); setKAns(''); setKReply(null);
    if (!done) onGo(n);
    body.current?.scrollTo({ top: 0 });
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const learnX = mode === 'learn' || showX;
  const explain = useJson<{ text: string; sources: string[] }>(!done && learnX ? `/api/explain?ref=${encodeURIComponent(lineRef)}` : null);

  const send = (q: string, a: string, set: (v: { text: string } | 'wait' | 'err') => void) => {
    set('wait');
    fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: lineRef, question: q, answer: a }) })
      .then((r) => r.json()).then((d) => set(d.text ? { text: d.text } : 'err')).catch(() => set('err'));
  };

  if (typeof document === 'undefined') return null;
  const at = map && !done ? placeOf(map, n) : null;
  const newTopic = map && !done ? topicBeginsAt(map, n) : -1;
  const topic = newTopic >= 0 && map ? map.topics[newTopic] : null;
  const endsTopic = map && at && at.ti >= 0 && topicEndsAt(map, at.ti, n, total) ? at.topic : null;
  const g = mode === 'ask' ? guide : kGuide;
  const kashya = g.data?.kashya ?? null;
  const answered = !!reply && reply !== 'wait' && reply !== 'err';

  const heLine = he[n - 1] ? plain(he[n - 1]) : '';
  const enLine = en[n - 1] ? plain(en[n - 1]) : '';

  return createPortal(
    <div className="lwm" role="dialog" aria-label="Learn with me">
      <div className="lwm-head">
        <span className="lwm-title">✦ Learn with me</span>
        {mode && (
          <div className="lwm-mode" role="group" aria-label="How to learn">
            <button className={mode === 'ask' ? 'on' : ''} onClick={() => setMode('ask')}>Ask me</button>
            <button className={mode === 'learn' ? 'on' : ''} onClick={() => setMode('learn')}>Just learn</button>
          </div>
        )}
        {onVoice && mode && !done && (
          <button className="lwm-voice" title="The chavrusa leads you out loud" aria-label="Learn with me by voice"
            onClick={() => { setVoiceGuide({ mode, at: `${refText}:${n}` }); onClose(); onVoice(); }}>🎙</button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="lwm-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, ((done ? total : n - 1) / Math.max(1, total)) * 100)}%` }} /></div>

      <div className="lwm-body" ref={body}>
        {!mode ? (
          <div className="lwm-start">
            <p>How would you like to learn?</p>
            <button className="lwm-choice" onClick={() => setMode('ask')}><b>Ask me as we go</b><span>I ask you a short question on each line before I explain. Answer, or just tap “Show me”.</span></button>
            <button className="lwm-choice" onClick={() => setMode('learn')}><b>Just learn</b><span>No questions. I take you through line by line with the background and the explanation.</span></button>
            <small>You can switch any time at the top.</small>
          </div>
        ) : done ? (
          <div className="lwm-end">
            <h4>Well learned! You finished {refText}.</h4>
            {map?.overview && <><div className="lwm-label">The big picture</div><Bullets text={map.overview} className="smap-intro" /></>}
            <div className="lwm-nav">
              <button className="btn" onClick={() => setN(1)}>Start again</button>
              {onNext && <button className="btn primary" onClick={() => { onClose(); onNext(); }}>Next section ›</button>}
            </div>
          </div>
        ) : (
          <>
            {n === 1 && map?.overview && !topic && <div className="lwm-bg"><div className="lwm-label">Before we start</div><Bullets text={map.overview} className="smap-intro" /></div>}
            {topic && (
              <div className="lwm-bg">
                <div className="lwm-label">{newTopic === 0 ? 'Before we start' : 'A new topic'}</div>
                {topic.title && <h4 dir="auto">{topic.title}</h4>}
                {topic.intro && <Bullets text={topic.intro} className="smap-intro" />}
                {topic.background.length > 0 && (
                  <div className="smap-bg">
                    <span className="smap-label">Good to know</span>
                    <ul dir={isHebrewText(topic.background.join(' ')) ? 'rtl' : undefined}>{topic.background.map((b, i) => { const m = b.match(/^([^:]{1,40}):\s*(.*)$/); return <li key={i}>{m ? <><b>{m[1]}</b>: {m[2]}</> : b}</li>; })}</ul>
                  </div>
                )}
              </div>
            )}
            {at?.step && <div className="lwm-where" dir="auto"><span>Where we are · line {n} of {total}</span>{stepLabel(at.step)}: {at.step.summary}</div>}
            {!map && !mapErr && <div className="lwm-where"><span>Line {n} of {total}</span><Wait what="Getting the map of this section (once)…" /></div>}
            {mapErr && !at && <div className="lwm-where"><span>Line {n} of {total}</span></div>}

            <div className="lwm-text">
              {heLine && <p className="he" dir="rtl">{heLine}</p>}
              {enLine && <p className="en" dir="auto">{enLine}</p>}
            </div>

            {mode === 'ask' && (
              <div className="lwm-ask">
                {guide.err ? <div className="muted">The question couldn’t be made. <button className="linklike" onClick={guide.retry}>Try again</button> · <button className="linklike" onClick={() => setShowX(true)}>Show me</button></div>
                  : !guide.data ? <Wait what="Thinking of a question…" />
                  : (
                    <>
                      <div className="lwm-q" dir="auto"><b>Your chavrusa asks:</b> {guide.data.question}</div>
                      {hint && guide.data.hint && <div className="lwm-hint" dir="auto">💡 {guide.data.hint}</div>}
                      {!answered && (
                        <>
                          <textarea dir="auto" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What do you think? (type, or use the keyboard’s mic)" />
                          <div className="lwm-row">
                            <button className="btn primary" disabled={!answer.trim() || reply === 'wait'} onClick={() => send(guide.data!.question, answer, setReply)}>{reply === 'wait' ? 'Reading…' : 'Answer'}</button>
                            {!hint && guide.data.hint && <button className="btn" onClick={() => setHint(true)}>Hint</button>}
                            <button className="btn" onClick={() => { setReply({ text: '' }); setShowX(true); }}>Show me</button>
                          </div>
                          {reply === 'err' && <div className="muted">That didn’t go through. Try again.</div>}
                        </>
                      )}
                      {reply && reply !== 'wait' && reply !== 'err' && reply.text && <div className="lwm-reply" dir="auto">{reply.text}</div>}
                      {answered && !showX && <button className="btn" onClick={() => setShowX(true)}>The full explanation</button>}
                    </>
                  )}
              </div>
            )}

            {learnX && (
              <div className="lwm-x">
                <div className="lwm-label">The explanation</div>
                {explain.data ? <WithSources text={explain.data.text} sources={explain.data.sources ?? []} />
                  : explain.err ? <div className="muted">It couldn’t be made just now. <button className="linklike" onClick={explain.retry}>Try again</button></div>
                  : <Wait what={<Thinking />} />}
              </div>
            )}

            {kashya && (mode === 'learn' ? !!explain.data : answered || showX) && (
              <div className="lwm-kashya">
                <div className="lwm-label">A kashya</div>
                <p dir="auto">{kashya.q}</p>
                {mode === 'ask' && !teretz && kReply === null && (
                  <>
                    <textarea dir="auto" rows={2} value={kAns} onChange={(e) => setKAns(e.target.value)} placeholder="Want to try? (optional)" />
                    <div className="lwm-row">
                      <button className="btn" disabled={!kAns.trim()} onClick={() => send(kashya.q, kAns, setKReply)}>Answer</button>
                      <button className="btn" onClick={() => setTeretz(true)}>Show the teretz</button>
                    </div>
                  </>
                )}
                {kReply === 'wait' && <Wait what="Reading…" />}
                {kReply && kReply !== 'wait' && kReply !== 'err' && <div className="lwm-reply" dir="auto">{kReply.text}</div>}
                {mode === 'learn' && !teretz && <button className="btn" onClick={() => setTeretz(true)}>Show the teretz</button>}
                {(teretz || (kReply && kReply !== 'wait')) && <p className="lwm-teretz" dir="auto"><b>Teretz:</b> {kashya.teretz}</p>}
              </div>
            )}

            {endsTopic?.takeaway && (mode === 'learn' ? !!explain.data : answered || showX) && (
              <div className="lwm-bg"><div className="lwm-label">Where it ends up</div><p dir="auto">{endsTopic.takeaway}</p></div>
            )}
          </>
        )}
      </div>

      {mode && !done && (
        <div className="lwm-nav">
          <button className="btn" disabled={n <= 1} onClick={() => setN(n - 1)}>‹ Back</button>
          <button className="btn primary" onClick={() => setN(n + 1)}>{n === total ? 'Finish' : 'Next line ›'}</button>
        </div>
      )}
      <div className="ai-note left">Written by AI · AI makes mistakes · for halacha, ask your rav</div>
    </div>,
    document.body,
  );
}
