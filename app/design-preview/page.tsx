'use client';
import { useState } from 'react';
import styles from './preview.module.css';
const SIZES = { phone: { width:390,height:844 }, tablet: { width:834,height:1112 }, desktop: { width:1280,height:800 } } as const;
/** Authenticated developer tool: the real app in an iframe with a genuine CSS viewport. */
export default function DesignPreview() {
  const [size,setSize] = useState<keyof typeof SIZES>('desktop');
  const [reload,setReload] = useState(0);
  const viewport=SIZES[size];
  return <main className={styles.preview}>
    <header className={styles.toolbar}><strong>Responsive preview</strong><label>Viewport <select aria-label="Preview viewport" value={size} onChange={e=>setSize(e.target.value as keyof typeof SIZES)}><option value="phone">Phone · 390 × 844</option><option value="tablet">Tablet · 834 × 1112</option><option value="desktop">Desktop · 1280 × 800</option></select></label><button onClick={()=>setReload(n=>n+1)}>Reload app</button><a href="/">Open full app</a><small>The real app at a CSS viewport size. Native Safari and keyboard behavior require real-device checks.</small></header>
    <div className={styles.stage}><iframe key={reload} title="Chavrusa responsive preview" src="/" width={viewport.width} height={viewport.height} className={styles.frame}/></div>
  </main>;
}
