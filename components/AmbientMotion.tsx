'use client';
import { useEffect, useState } from 'react';
/** Motion is decorative, never gates navigation, and follows the OS reduced-motion choice. */
export function useAmbientMotion(key:string){
  const [moving,setMoving]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{let saved=true;try{saved=localStorage.getItem(key)!=='off';}catch{}setMoving(!media.matches&&saved);};sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[key]);
  return {moving,toggle:()=>setMoving(v=>{const next=!v;try{localStorage.setItem(key,next?'on':'off');}catch{}return next;})};
}
