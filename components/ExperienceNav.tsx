'use client';
import { isExperience } from '@/lib/experiences';
import type { Look } from '@/lib/config';
type View = 'home' | 'learn' | 'recent' | 'themes' | 'settings';
export default function ExperienceNav(p: { look: Look; view: View; onHome: () => void; onLearn: () => void; onLibrary: () => void; onNotebook: () => void; onThemes: () => void }) {
  if (!isExperience(p.look)) return null;
  const items = [['home','Home','⌂',p.onHome],['learn','Learn','▤',p.onLearn],['library','Library','▥',p.onLibrary],['notebook','Notebook','✎',p.onNotebook],['themes','Looks','◐',p.onThemes]] as const;
  return <nav className="experience-nav" aria-label="Workspace navigation"><span className="experience-nav-brand">Chavrusa</span>{items.map(([id,label,icon,go]) => <button key={id} onClick={go} aria-current={p.view === id ? 'page' : undefined}><span aria-hidden="true">{icon}</span><span>{label}</span></button>)}</nav>;
}
