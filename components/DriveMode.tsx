'use client';
// Driving mode (Settings → Extras): one simple screen with big buttons, the screen kept on, and the headphone or car
// buttons working: play/pause = start or pause the call, next = go on, back = say that again.
import { useEffect, useRef } from 'react';

type Live = {
  state: string; active: boolean;
  start: () => void; stop: () => void;
  goOn?: () => void; again?: () => void; hold?: () => void;
};

const LABEL: Record<string, string> = { off: 'Not connected', connecting: 'Connecting…', listening: 'Listening', thinking: 'Getting the next part…', speaking: 'Speaking', paused: 'Paused' };

export default function DriveMode({ live, place, onExit }: { live: Live; place: string; onExit: () => void }) {
  const liveRef = useRef(live);
  liveRef.current = live;
  const running = live.active && live.state !== 'paused';
  const playPause = () => { const l = liveRef.current; if (!l.active || l.state === 'paused') l.start(); else l.hold?.(); };

  // Keep the screen on.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const get = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    void get();
    const vis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, []);

  // Headphone / car / lock-screen buttons.
  useEffect(() => {
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({ title: place || 'Learning', artist: 'Chavrusa' });
      ms.setActionHandler('play', () => playPause());
      ms.setActionHandler('pause', () => playPause());
      ms.setActionHandler('nexttrack', () => liveRef.current.goOn?.());
      ms.setActionHandler('previoustrack', () => liveRef.current.again?.());
    } catch { /* not supported here */ }
    return () => { try { (['play', 'pause', 'nexttrack', 'previoustrack'] as MediaSessionAction[]).forEach((a) => ms.setActionHandler(a, null)); } catch { /* ignore */ } };
  }, [place]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="drive" role="dialog" aria-label="Driving mode">
      <div className="drive-top">
        <span className="drive-place">{place || '—'}</span>
        <button className="drive-exit" onClick={onExit}>Exit</button>
      </div>
      <div className={`drive-state s-${live.state}`}>{LABEL[live.state] ?? live.state}</div>
      <button className={`drive-big ${running ? 'on' : ''}`} onClick={playPause} aria-label={running ? 'Pause' : 'Start'}>{running ? '❚❚' : '▶'}</button>
      <div className="drive-row">
        <button className="drive-btn" disabled={!running} onClick={() => live.again?.()}>↺<span>Say it again</span></button>
        <button className="drive-btn" disabled={!running} onClick={() => live.goOn?.()}>⏭<span>Go on</span></button>
      </div>
      {live.active && <button className="drive-end" onClick={() => live.stop()}>End the call</button>}
      <div className="drive-hint">Headphone or car buttons: play/pause, next = go on, back = say it again. You can also just talk.</div>
    </div>
  );
}
