'use client';
// "A new version is ready": the phone keeps the app open in the background for days, so it can go on running an old
// copy after an update (Nov 11: the Source sheet button was missing). When the app comes back to the screen it checks
// which version is live (app/api/version); if it changed, a small bar offers to update. Never during a call.
import { useEffect, useRef, useState } from 'react';

export default function UpdateBar({ busy }: { busy: boolean }) {
  const [ready, setReady] = useState(false);
  const mine = useRef<string | null>(null);
  useEffect(() => {
    const check = () => fetch('/api/version', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const v = String(d.v ?? '');
      if (!v) return;
      if (mine.current === null) mine.current = v;
      else if (v !== mine.current) setReady(true);
    }).catch(() => {});
    void check();
    const vis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', vis);
    const t = window.setInterval(check, 15 * 60_000);
    return () => { document.removeEventListener('visibilitychange', vis); window.clearInterval(t); };
  }, []);
  if (!ready || busy) return null;
  return (
    <button className="upd-bar" onClick={() => window.location.reload()}>
      A new version of the app is ready · <b>Tap to update</b>
    </button>
  );
}
