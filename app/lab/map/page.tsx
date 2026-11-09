'use client';
// Map lab (/lab/map): the same amud's sugya map made by Claude Sonnet and by Claude Opus, side by side (on a phone,
// one at a time with tabs), each with what it cost. Each comparison map is made once and kept, so opening it again
// is free. Not the real maps the Sefer shows.
import { useState } from 'react';
import SugyaMap from '@/components/SugyaMap';

export default function MapLab() {
  const [ref, setRef] = useState('Yoma 6a');
  const [shown, setShown] = useState('');
  const [tab, setTab] = useState<'middle' | 'top'>('middle');
  const go = () => { const r = ref.trim(); if (r) setShown(r); };
  return (
    <div className="lab maplab">
      <a href="/" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>‹ Back to the app</a>
      <h1 style={{ fontFamily: 'var(--f-body)', fontWeight: 400, margin: '6px 0 4px' }}>Sonnet or Opus: the sugya map</h1>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>The same amud, mapped by each. Each is made once (a few cents) and kept.</p>
      <div className="maplab-row">
        <input value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="Yoma 6a, Mishnah Yoma 1, Genesis 24" />
        <button className="btn" onClick={go}>Make both</button>
      </div>
      {shown && (
        <>
          <div className="maplab-tabs">
            <button className={tab === 'middle' ? 'on' : ''} onClick={() => setTab('middle')}>Sonnet</button>
            <button className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>Opus</button>
          </div>
          <div className="maplab-cols">
            <section className={tab === 'middle' ? 'on' : ''}><h2>Claude Sonnet</h2><SugyaMap key={`m-${shown}`} refText={shown} tier="middle" inline onGo={() => {}} onClose={() => {}} /></section>
            <section className={tab === 'top' ? 'on' : ''}><h2>Claude Opus</h2><SugyaMap key={`t-${shown}`} refText={shown} tier="top" inline onGo={() => {}} onClose={() => {}} /></section>
          </div>
        </>
      )}
    </div>
  );
}
