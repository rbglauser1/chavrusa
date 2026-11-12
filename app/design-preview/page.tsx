'use client';
import { useEffect, useRef, useState } from 'react';
import { isExperience, type Experience } from '@/lib/experiences';
import styles from './preview.module.css';
const SIZES = { phone: { width:390,height:844 }, compact: { width:320,height:720 }, tablet: { width:834,height:1112 }, landscape: { width:1112,height:834 }, desktop: { width:1280,height:800 } } as const;
/** Authenticated developer tool: the real app in an iframe with a genuine CSS viewport. */
export default function DesignPreview() {
  const [size,setSize] = useState<keyof typeof SIZES>('desktop');
  const [reload,setReload] = useState(0);
  const [previewLook,setPreviewLook]=useState<Experience|null>(null);
  useEffect(()=>{const look=new URLSearchParams(window.location.search).get('preview-look');setPreviewLook(isExperience(look)?look:null);},[]);
  const appHref=previewLook?`/?preview-look=${previewLook}`:'/';
  const viewport=SIZES[size];
  const stage=useRef<HTMLDivElement>(null);
  const [space,setSpace]=useState({width:0,height:0});
  useEffect(()=>{
    const el=stage.current; if(!el)return;
    const measure=()=>setSpace({width:Math.max(0,el.clientWidth-32),height:Math.max(0,el.clientHeight-32)});
    const observer=new ResizeObserver(measure);observer.observe(el);measure();
    return()=>observer.disconnect();
  },[]);
  // Scale only the outside frame. The application still receives its actual device viewport.
  const scale=space.width&&space.height?Math.min(1,space.width/(viewport.width+2),space.height/(viewport.height+2)):0;

  return <main className={styles.preview}>
    <header className={styles.toolbar}><strong>Responsive preview</strong><label>Viewport <select aria-label="Preview viewport" value={size} onChange={e=>setSize(e.target.value as keyof typeof SIZES)}><option value="compact">Small phone · 320 × 720</option><option value="phone">Phone · 390 × 844</option><option value="tablet">Tablet · 834 × 1112</option><option value="landscape">Tablet landscape · 1112 × 834</option><option value="desktop">Desktop · 1280 × 800</option></select></label><button onClick={()=>setReload(n=>n+1)}>Reload app</button><a href={appHref}>Open full app</a><span className={styles.zoom}>{Math.round(scale*100)}% · fitted to screen</span><small>The entire device fits here without scrolling. The app keeps its selected viewport size. Native Safari and keyboard behavior require real-device checks.</small></header>
    <div className={styles.stage} ref={stage}><div className={styles.device} style={{width:(viewport.width+2)*scale,height:(viewport.height+2)*scale}}><iframe key={reload} title="Chavrusa responsive preview" src={appHref} width={viewport.width} height={viewport.height} className={styles.frame} style={{transform:`scale(${scale})`}}/></div></div>
  </main>;
}
