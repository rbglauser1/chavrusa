// The call recorder: a timed log of everything in a live call (what the learner said, what the voice said and when it
// started and stopped, everything the app sent the voice, every event from the voice service, every state change).
// Kept only on this device (the last 6 calls); Settings → Voice → Call recorder copies or shares one, so it can be
// read to see exactly why the voice stopped, restarted or changed course. Costs nothing.

export interface CallLog { id: string; started: number; ended?: number; meta: string; lines: string[] }

const KEY = 'chavrusa-call-logs';
const MAX_CALLS = 6;
const MAX_LINES = 6000;

let cur: CallLog | null = null;
let t0 = 0;
let saveTimer: number | undefined;

function load(): CallLog[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save() {
  if (!cur) return;
  try {
    const all = load().filter((c) => c.id !== cur!.id);
    all.unshift(cur);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_CALLS)));
  } catch { /* storage full or blocked: the log is just not kept */ }
}

const stamp = () => {
  const s = (Date.now() - t0) / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

/** Start a new call's log (or, when resuming after a pause, keep adding to the current one). */
export function logBegin(meta: string, resuming = false) {
  if (resuming && cur) { logLine('──', 'resumed after a pause (new connection)'); return; }
  t0 = Date.now();
  cur = { id: String(t0), started: t0, meta, lines: [] };
  logLine('──', `call started · ${meta}`);
}

/** One line in the log: `who` is a short tag (LEARNER, VOICE, APP→VOICE, EVENT, STATE, BRAIN…). */
export function logLine(who: string, what: string) {
  if (!cur) return;
  cur.lines.push(`${stamp()}  ${who.padEnd(9)} ${what.replace(/\s+/g, ' ').trim()}`);
  if (cur.lines.length > MAX_LINES) cur.lines.splice(0, 500);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 1500);
}

export function logEnd(reason: string) {
  if (!cur) return;
  logLine('──', `call ended (${reason})`);
  cur.ended = Date.now();
  save();
}

export function listCallLogs(): CallLog[] { return load(); }

export function callLogText(c: CallLog): string {
  const when = new Date(c.started).toLocaleString();
  const len = c.ended ? `${Math.round((c.ended - c.started) / 1000)} s` : 'still going';
  return `Chavrusa call log · ${when} · ${len}\n${c.meta}\n\n${c.lines.join('\n')}\n`;
}

/** Remove one call's log, or all of them (Settings → Voice → Call recorder). */
export function deleteCallLog(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify(load().filter((c) => c.id !== id))); } catch { /* ignore */ }
}
export function clearCallLogs() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
