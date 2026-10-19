'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (res.ok) window.location.href = '/';
    else setErr('That password is not right.');
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brand" style={{ fontSize: 48 }}>חברותא</div>
        <div className="muted">Your learning partner</div>
        <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        <button className="btn primary" disabled={busy || !pw}>{busy ? 'Checking…' : 'Enter'}</button>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      </form>
    </div>
  );
}
