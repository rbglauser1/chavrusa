'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ContinueInfo } from './Home';
import { SandIcon } from './SandTeal';
import { useBackLayer } from '@/lib/back';

type View = 'home' | 'learn' | 'recent' | 'themes' | 'settings';
export function LaunchNav(p: { dockOnly?: boolean; view: View; onHome: () => void; onLibrary: () => void; onNotebook: () => void; onRecent: () => void; onThemes: () => void; onSettings: () => void; onReview: () => void }) {
  const [more, setMore] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useBackLayer(more, () => setMore(false));
  useEffect(() => {
    if (!more) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMore(false); moreButton.current?.focus(); } };
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !moreButton.current?.contains(e.target as Node)) setMore(false); };
    window.addEventListener('keydown', close); window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, [more]);
  const go = (fn: () => void) => { setMore(false); fn(); };
  return <>{!p.dockOnly && <header className="launch-header"><button className="launch-brand" onClick={() => go(p.onHome)}>Chavrusa</button><button className="launch-icon" aria-label="Settings" onClick={() => go(p.onSettings)}><SandIcon name="settings" size={25}/></button></header>}<nav className="launch-dock" aria-label="Main navigation"><button aria-current={p.view === 'home' ? 'page' : undefined} onClick={() => go(p.onHome)}><SandIcon name="home"/><span>Home</span></button><button onClick={() => go(p.onLibrary)}><SandIcon name="book"/><span>Library</span></button><button onClick={() => go(p.onNotebook)}><SandIcon name="notes"/><span>Notebook</span></button><button ref={moreButton} aria-expanded={more} aria-controls="launch-more" onClick={() => setMore(v => !v)}><SandIcon name="more"/><span>More</span></button></nav>{more && <div className="launch-more" id="launch-more" ref={menu} role="navigation" aria-label="More navigation"><button onClick={() => go(p.onRecent)}>Recent sessions</button><button onClick={() => go(p.onReview)}>Review your learning</button><button onClick={() => go(p.onThemes)}>Colors and fonts</button><button onClick={() => go(p.onSettings)}>All settings</button><a href="/guide">Learning guide</a><a href="/contact">Contact us</a></div>}</>;
}
export type LaunchHomeProps = { busy?: boolean; cont: ContinueInfo | null; onContinue: () => void; onLibrary: () => void; onRecent: () => void; onThemes: () => void; onTalk: () => void; talkSupported: boolean; talkOn: boolean; extras?: ReactNode; onGuide: () => void; onReview?: () => void; onAsk?: (text: string) => void | Promise<void> };
function Overview({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useBackLayer(true, onClose);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="launch-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={panel} className="launch-overview" role="dialog" aria-modal="true" aria-label="Your learning" onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea') ?? []).filter(x => !x.hasAttribute('disabled')); if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); } else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); } } }}><header><h2>Your learning</h2><button ref={close} className="launch-icon" aria-label="Close learning overview" onClick={onClose}><SandIcon name="close"/></button></header>{children}</section></div>;
}
const titleOf = (c: ContinueInfo | null) => (c?.ref || c?.title || c?.heRef || 'Choose a sefer').replace('Berakhot', 'Berachos');
export function SplitCanvasHome(p: LaunchHomeProps) {
  const [overview, setOverview] = useState(false);

  return (
    <main className="launch-home split-home no-pull" aria-label="Claude split canvas Home">
      <header className="split-intro">
        <h1>Make time{' '}<br />to learn.</h1>
      </header>
      <div className="split-panels">
        <section className="split-panel">
          <span className="launch-eyebrow">{p.cont ? 'Return to your learning' : 'Begin your learning'}</span>
          <h2 dir="auto">{titleOf(p.cont)}</h2>
          {p.cont && <p>Your place, ready when you are.</p>}
          <button className="launch-primary" onClick={p.cont ? p.onContinue : p.onLibrary}>
            {p.cont ? 'Continue' : 'Open the Library'} <SandIcon name="arrow" size={18} />
          </button>
        </section>
        <section className="split-panel split-new">
          <h2>Begin something new</h2>
          <button onClick={p.onLibrary}><SandIcon name="book" size={20} />Choose a sefer</button>
          <button onClick={p.onRecent}><SandIcon name="review" size={20} />Recents</button>
        </section>
      </div>
      <footer className="split-footer">
        {p.talkSupported && <button onClick={p.onTalk}>{p.talkOn ? 'Return to call' : 'Learn aloud'}</button>}
        <button onClick={() => setOverview(true)}>Your learning</button>
        <button onClick={p.onGuide}>Learning guide</button>
      </footer>
      {overview && <Overview onClose={() => setOverview(false)}>{p.extras}</Overview>}
    </main>
  );
}
export function ChatGPTHome(p: LaunchHomeProps) {
  const [tools, setTools] = useState(false);
  const [question, setQuestion] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  return <main className="launch-home cg-home no-pull" aria-label="ChatGPT style Home"><header className="cg-intro"><h1>What shall we learn?</h1></header><form className="cg-home-composer" onSubmit={async e => { e.preventDefault(); const text = question.trim(); if (!text || opening || p.busy || !p.onAsk) return; setOpening(true); setError(''); try { await p.onAsk(text); } catch { setError('Could not open the conversation. Please try again.'); } finally { setOpening(false); } }}><label className="sr-only" htmlFor="home-question">Ask your chavrusa</label><textarea id="home-question" rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask your chavrusa" disabled={opening || p.busy}/><div className="cg-home-tools"><button type="button" className="launch-icon cg-plus" aria-label="More learning tools" onClick={() => setTools(true)}>+</button><button type="button" className="cg-choose" onClick={p.onLibrary}><SandIcon name="book" size={17}/>Choose a sefer</button>{p.talkSupported && <button type="button" className="launch-icon cg-voice" onClick={p.onTalk} aria-label={p.talkOn ? 'Return to voice learning' : 'Start voice learning'}><SandIcon name="mic" size={20}/></button>}<button type="submit" className="cg-home-send" disabled={!question.trim() || opening || p.busy} aria-label="Send question"><SandIcon name="arrow" size={20}/></button></div>{p.busy && <p role="status" className="cg-home-wait">Your chavrusa is preparing a reply. Use Continue to return.</p>}{error && <p role="alert" className="cg-home-error">{error}</p>}</form><section className="cg-home-suggestions" aria-label="Learning shortcuts"><button onClick={p.cont ? p.onContinue : p.onLibrary}><SandIcon name="book" size={16}/>Read inside</button><button onClick={p.onReview ?? p.onContinue}><SandIcon name="review" size={16}/>Review</button><button onClick={p.onRecent}><SandIcon name="chat" size={16}/>Recent</button></section><button className="cg-home-return" onClick={p.cont ? p.onContinue : p.onLibrary}><span><small>{p.cont ? 'Continue where you left off' : 'Begin your learning'}</small><strong dir="auto">{titleOf(p.cont)}</strong></span><SandIcon name="arrow" size={19}/></button><footer className="cg-home-bottom"><p>AI can make mistakes. Check the sources.<br/>For halacha, ask your rav.</p><button onClick={p.onGuide}>Learning guide</button></footer>{tools && <Overview onClose={() => setTools(false)}><div className="launch-overview-actions"><button className="launch-primary" onClick={p.onLibrary}>Choose a sefer</button><button className="launch-primary" onClick={p.onThemes}>Look and fonts</button></div>{p.extras}</Overview>}</main>;
}
