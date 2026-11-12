'use client';
import ExperienceIcon from './ExperienceIcon';
import { useEffect } from 'react';
import { isExperience } from '@/lib/experiences';
import type { Look } from '@/lib/config';
type View = 'home' | 'learn' | 'recent' | 'themes' | 'settings';
export default function ExperienceNav(p: { look: Look; view: View; onHome: () => void; onLearn: () => void; onLibrary: () => void; onNotebook: () => void; onThemes: () => void }) {
  useEffect(() => {
    if (!isExperience(p.look)) return;
    const update = () => {
      const editing = document.activeElement?.matches('input, textarea');
      const keyboard = !!editing && window.innerHeight - (window.visualViewport?.height ?? window.innerHeight) > 150;
      document.documentElement.toggleAttribute('data-experience-keyboard', keyboard);
    };
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('focusin', update); window.addEventListener('focusout', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('focusin', update); window.removeEventListener('focusout', update);
      document.documentElement.removeAttribute('data-experience-keyboard');
    };
  }, [p.look]);
  if (!isExperience(p.look)) return null;
  const items = [['home','Home','home',p.onHome],['learn','Learn','learn',p.onLearn],['library','Library','library',p.onLibrary],['notebook','Notebook','notebook',p.onNotebook],['themes','Looks','themes',p.onThemes]] as const;
  return <nav className="experience-nav" aria-label="Workspace navigation"><span className="experience-nav-brand">Chavrusa</span>{items.map(([id,label,icon,go]) => <button key={id} onClick={() => { go(); if (id === 'home' || id === 'themes') requestAnimationFrame(() => window.scrollTo({top:0})); }} aria-current={p.view === id ? 'page' : undefined}><ExperienceIcon name={icon}/><span>{label}</span></button>)}</nav>;
}
