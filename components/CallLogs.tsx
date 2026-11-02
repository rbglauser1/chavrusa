'use client';
// Settings → Voice → Call recorder: the last few calls' logs (kept on this device), to copy or share with Claude.
import { useEffect, useState } from 'react';
import { callLogText, clearCallLogs, deleteCallLog, listCallLogs, type CallLog } from '@/lib/callLog';
import { HE_READS } from '@/lib/hebrew';

// What a call really used, from its log's "in this call:" line (calls from before Nov 2 don't have it), and whether
// the app had to step in (a voice or rules OpenAI turned down).
function used(c: CallLog): { voice: string; reading: string; rules: string; notice: string } | null {
  const line = [...c.lines].reverse().find((l) => / in this call: /.test(l));
  const notice = [...c.lines].reverse().find((l) => /isn't available on GPT-Live|wouldn't start a call/.test(l)) ?? '';
  if (!line) return null;
  const m = line.match(/in this call: voice (\S+) · Hebrew given as (\S+) · rules: (.*)$/);
  if (!m) return null;
  const reading = HE_READS.find((x) => x.id === m[2])?.name ?? m[2];
  return { voice: m[1].charAt(0).toUpperCase() + m[1].slice(1), reading, rules: m[3], notice: notice.replace(/^.*?──\s*/, '') };
}

export default function CallLogs() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null); // the call whose whole log is shown
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
      {logs.map((c) => {
        const u = used(c);
        return (
          <div key={c.id} className="calllog-item">
            <div className="calllog-row">
              <span>{new Date(c.started).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {c.ended ? `${Math.max(1, Math.round((c.ended - c.started) / 60000))} min` : 'not finished'} · {c.lines.length} lines</span>
              <button className="btn" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide' : 'View'}</button>
              <button className="btn" onClick={() => void copy(c)}>Copy</button>
              <button className="btn" onClick={() => void share(c)}>Share</button>
              <button className="calllog-x" aria-label="Delete this call's log" onClick={() => { deleteCallLog(c.id); setLogs(listCallLogs()); }}>×</button>
            </div>
            {u ? (
              <div className="calllog-used">
                <div><b>Voice:</b> {u.voice}</div>
                <div><b>Hebrew given as:</b> {u.reading}</div>
                <div><b>Rules:</b> {u.rules}</div>
                {u.notice && <div className="calllog-notice">{u.notice}</div>}
              </div>
            ) : <div className="calllog-used muted">{c.lines.some((l) => /ERROR/.test(l)) ? 'Didn’t connect. Tap View to see why.' : 'From before this was shown.'}</div>}
            {open === c.id && <pre className="calllog-text">{callLogText(c)}</pre>}
          </div>
        );
      })}
      {logs.length > 1 && <button className="linklike" style={{ marginTop: 4, fontSize: 13 }} onClick={() => { clearCallLogs(); setLogs([]); setMsg('All call logs cleared.'); }}>Clear all</button>}
      {msg && <div className="goto-msg" style={{ padding: '6px 0 0' }}>{msg}</div>}
    </div>
  );
}
