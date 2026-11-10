'use client';
// Contact us: open to anyone (no sign-in). The message is kept in the app; the owner reads it in Settings → Messages.
import { useState } from 'react';

export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', topic: 'Question', text: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = async () => {
    setErr(''); setState('sending');
    const r = await fetch('/api/contact/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      .then((x) => x.json()).catch(() => ({ error: 'Couldn’t reach the server. Please try again.' }));
    if (r.ok) setState('sent'); else { setErr(r.error ?? 'It didn’t send.'); setState('idle'); }
  };
  return (
    <main className="legal contact">
      <p><a href="/" className="contact-back">‹ Back to the app</a></p>
      <h1>Contact us</h1>
      {state === 'sent' ? (
        <div className="contact-thanks">
          <p><b>Thank you — your message was sent.</b></p>
          <p>{f.email ? 'We’ll get back to you at the email you gave.' : 'You didn’t leave an email, so we won’t be able to answer directly, but we’ll read it.'}</p>
          <button className="btn ghost" onClick={() => { setF({ name: '', email: '', topic: 'Question', text: '', website: '' }); setState('idle'); }}>Send another</button>
        </div>
      ) : (
        <>
          <p>A question, a problem, an idea for the app, or something about billing: write to us here.</p>
          <label>Your name<input value={f.name} onChange={set('name')} autoComplete="name" /></label>
          <label>Your email <span className="muted">(so we can answer you)</span><input type="email" value={f.email} onChange={set('email')} autoComplete="email" inputMode="email" /></label>
          <label>About
            <select value={f.topic} onChange={set('topic')}>
              {['Question', 'Problem', 'Idea', 'Billing', 'Other'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Message<textarea rows={6} dir="auto" value={f.text} onChange={set('text')} /></label>
          <input className="contact-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set('website')} />
          {err && <p className="contact-err">{err}</p>}
          <button className="btn" disabled={state === 'sending' || f.text.trim().length < 3} onClick={() => void send()}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
        </>
      )}
    </main>
  );
}
