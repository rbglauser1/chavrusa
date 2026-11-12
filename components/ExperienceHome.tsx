'use client';
import ExperienceIcon from './ExperienceIcon';
import { SandTealHome } from './SandTeal';
import type { ReactNode } from 'react';
import type { Experience } from '@/lib/experiences';
import type { ContinueInfo } from './Home';
const COPY: Record<Experience, [string,string,string]> = {
  'paper-ink': ['A little time. A deeper understanding.','Your learning, continued.','An open page and a thoughtful conversation.'],
  'midnight-sefer': ['Make room for learning.','Your sefer is waiting.','Open the text. Bring your questions. Learn together.'],
  'beis-medrash': ['Welcome to your beis medrash.','Come back to the sugya.','A familiar place to open a sefer and learn.'],
  'sand-teal': ['Settle in. Let’s learn.','Pick up your learning.','A clear space for the text and your questions.'],
  editorial: ['The learning journal','Return to the page.','Read carefully. Ask freely. Keep what you learn.'],
  'guided-learning': ['Your next learning session','Begin with the text.','Read a passage, explore its meaning and test your understanding.'],
  'living-page': ['Room to think.','An open page.','The sefer comes first. Your chavrusa is close at hand.'],
  'study-workspace': ['Your study workspace','Continue where you left off.','Your text, sources and conversation in one place.'],
};
export default function ExperienceHome(p: { look: Experience; cont: ContinueInfo | null; onContinue: () => void; onLibrary: () => void; onRecent: () => void; onThemes: () => void; onSettings: () => void; onTalk: () => void; talkSupported: boolean; talkOn: boolean; extras?: ReactNode; onGuide: () => void; onFilm: () => void }) {
  if (p.look === 'sand-teal') return <SandTealHome {...p}/>;
  const [eyebrow,title,subtitle] = COPY[p.look];
  const tools: [string,string,string,() => void][] = [['01','Library','Find your next sefer',p.onLibrary],['02','Recent sessions','Return to a conversation',p.onRecent],['03','Notebook','Your notes and saved insights',() => window.dispatchEvent(new Event('chavrusa-notebook'))],['04','Look and fonts','Make this space your own',p.onThemes]];
  return <div className={`experience-home experience-${p.look}`}>
    <header className="experience-masthead"><button onClick={p.onGuide} aria-label="Chavrusa learning guide"><ExperienceIcon name="learn" size={28}/>Chavrusa</button><button onClick={p.onSettings}>Settings</button></header>
    <section className="experience-hero"><div className="experience-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p>{p.look === 'guided-learning' && <ol className="experience-path"><li>Read</li><li>Discuss</li><li>Recall</li></ol>}</section>
    <div className="experience-dashboard">
      <button className="experience-continue" onClick={p.cont ? p.onContinue : p.onLibrary}><span className="experience-eyebrow">{p.cont ? 'Continue learning' : 'Start a session'}</span><span className="experience-continue-title" dir="auto">{p.cont?.heRef || p.cont?.title || 'Choose a sefer'}</span><span>{p.cont?.ref ? `${p.cont.ref}${p.cont.line ? ` · segment ${p.cont.line}` : ''}` : 'Browse Gemara, Chumash, Mishnah and more'}</span><span className="experience-arrow"><ExperienceIcon name="arrow"/></span></button>
      <section className="experience-tools" aria-label="Learning tools">{tools.map(([n,label,hint,go]) => <button key={n} onClick={go}><span className="experience-tool-number">{n}</span><span><b>{label}</b><small>{hint}</small></span><span aria-hidden="true">→</span></button>)}</section>
      {p.talkSupported && <section className="experience-voice"><div><span className="experience-eyebrow">Your chavrusa</span><h2>{p.talkOn ? 'Your call is active' : 'Think it through together.'}</h2><p>Ask a question or learn aloud.</p></div><button onClick={p.onTalk}>{p.talkOn ? 'Return to call' : 'Start voice session'} <ExperienceIcon name="arrow"/></button></section>}
      <div className="experience-extras">{p.extras}</div>
    </div>
    <footer className="experience-footer"><div><button onClick={p.onGuide}>How to learn here</button><button onClick={p.onFilm}>Watch the guide</button><a href="/contact">Contact</a></div><p>AI makes mistakes · not rabbinically approved · for halacha, ask your rav</p></footer>
  </div>;
}
