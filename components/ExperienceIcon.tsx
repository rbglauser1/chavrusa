import type { ReactNode } from 'react';
const paths: Record<string, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>,
  learn: <><path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="M12 5v15"/></>,
  library: <><path d="M3 4h4v16H3zM10 4h4v16h-4zM17 4l4-1 3 16-4 1z"/></>,
  notebook: <><path d="M5 3h14v18H5zM9 3v18M12 8h4M12 12h4"/></>,
  themes: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/></>,
  arrow: <><path d="M5 19 19 5M5 5h14v14"/></>,
};
export default function ExperienceIcon({name,size=20}:{name:string;size?:number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.learn}</svg>; }
