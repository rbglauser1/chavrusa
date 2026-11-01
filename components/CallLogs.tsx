'use client';
// Settings → Voice → Call recorder: the last few calls' logs (kept on this device), to copy or share with Claude.
import { useEffect, useState } from 'react';
import { callLogText, clearCallLogs, deleteCallLog, listCallLogs, type CallLog } from '@/lib/callLog';

export default function CallLogs() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { setLogs(listCallLogs()); }, []);

  async function copy(c: CallLog) {
    try { await navigator.clipboard.writeText(callLogText(c)); setMsg('Copied. Paste it into the chat with Claude.'); }
    catch { setMsg('Couldn’t copy here. Try Share instead.'); }
  }
  async function share(c: CallLog) {
    const text = callLogText(c);
    const name = `chavrusa-call-${new Date(c.started).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    try {
      const file = new File([text], name, { type: 'text/plain' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Chavrusa call log' }); return; }
    } catch { /* fall back to a download */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <div className="field">
      <label>Call recorder</label>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Every call is recorded here as a timed log: what you said, what the voice said and when it started and stopped, and everything the app sent it. No sound is kept, only the words and timing, and only on this device. Copy or share a call and send it to Claude to see exactly what went wrong.</div>
      {logs.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No calls recorded yet. Tap Talk and learn for a few minutes.</div>}
      {logs.map((c) => (
        <div key={c.id} className="calllog-row">
          <span>{new Date(c.started).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {c.ended ? `${Math.max(1, Math.round((c.ended - c.started) / 60000))} min` : 'not finished'} · {c.lines.length} lines</span>
          <button className="btn" onClick={() => void copy(c)}>Copy</button>
          <button className="btn" onClick={() => void share(c)}>Share</button>
          <button className="calllog-x" aria-label="Delete this call's log" onClick={() => { deleteCallLog(c.id); setLogs(listCallLogs()); }}>×</button>
        </div>
      ))}
      {logs.length > 1 && <button className="linklike" style={{ marginTop: 4, fontSize: 13 }} onClick={() => { clearCallLogs(); setLogs([]); setMsg('All call logs cleared.'); }}>Clear all</button>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
