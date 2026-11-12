'use client';
// The dark call screen (Settings → Extras → Dark call screen, off unless you turn it on): while a call is on, the
// screen goes dark and quiet. It shows only the words being read, large, the words that come next, dimmed, and three
// buttons: Again, Pause, Go on. "Text" goes back to the page; the call carries on.
import { useEffect } from 'react';
import type { SourceData } from '@/lib/db';
import { stripNikud } from '@/lib/hebrew';
import { splitPieces } from '@/lib/pieces';

type Live = { state: string; active: boolean; start: () => void; stop: () => void; goOn?: () => void; again?: () => void; hold?: () => void };

const LABEL: Record<string, string> = { connecting: 'Connecting', listening: 'Listening', thinking: 'Getting the next part', speaking: 'Reading inside', paused: 'Paused' };
const plain = (s: string) => s.replace(/<[^>]+>/g, '').trim();

export default function CallScreen({ live, src, nikud, onText }: { live: Live; src: SourceData | null; nikud: boolean; onText: () => void }) {
  // Keep the screen on while it is showing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const get = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    void get();
    const vis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, []);

  const n = src?.focus ?? 1;
  const he = src?.he[n - 1] ?? '', en = plain(src?.en[n - 1] ?? src?.altEn?.[n - 1] ?? '');
  const pieces = he ? splitPieces(he, en) : [];
  const at = Math.min(Math.max((src?.focusPart ?? 1) - 1, 0), Math.max(pieces.length - 1, 0));
  const now = pieces[at];
  const next = pieces[at + 1]?.he ?? src?.he[n] ?? '';
  const show = (h: string) => (nikud ? h : stripNikud(h));
  const paused = live.state === 'paused';
  const size = !now ? 0 : now.he.length > 160 ? 22 : now.he.length > 90 ? 27 : now.he.length > 45 ? 32 : 38;

  return (
    <div className="callx" role="dialog" aria-label="In a call">
      <header className="callx-top">
        <div className="callx-place">
          <span className="callx-ref" dir="rtl">{src?.heRef || src?.ref || 'חברותא'}</span>
          {src && <span className="callx-n">LINE {String(n).padStart(2, '0')}</span>}
        </div>
        <button className="callx-text" onClick={onText}>TEXT</button>
      </header>

      <div className="callx-ai">AI makes mistakes · not rabbinically approved · ask your rav</div>
      <main className="callx-main">
        <div className={`callx-state s-${live.state}`}><i />{LABEL[live.state] ?? live.state}</div>
        {now ? (
          <>
            <div className="callx-he" dir="rtl" style={{ fontSize: size }}>{show(now.he)}</div>
            {now.en && <div className="callx-en">{now.en}</div>}
            {next && <div className="callx-next" dir="rtl">{show(next)}</div>}
          </>
        ) : <div className="callx-en">Tell your chavrusa what you’d like to learn.</div>}
        <div className={`callx-wave ${live.state === 'speaking' ? 'on' : ''}`} aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <span key={i} style={{ animationDelay: `${(i * 97) % 700}ms` }} />)}</div>
      </main>

      <footer className="callx-foot">
        <div className="callx-btns">
          <button disabled={paused} onClick={() => live.again?.()}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg>Again
          </button>
          <button className="callx-pause" aria-label={paused ? 'Carry on' : 'Pause'} onClick={() => (paused ? live.start() : live.hold?.())}>
            {paused
              ? <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
              : <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>}
          </button>
          <button disabled={paused} onClick={() => live.goOn?.()}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 5l9 7-9 7zM18 5v14" /></svg>Go on
          </button>
        </div>
        <div className="callx-last">
          <span />
          <button onClick={() => live.stop()}>End the call</button>
        </div>
      </footer>
    </div>
  );
}
