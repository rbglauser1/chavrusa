'use client';
// Nov 27: Settings → The AI → The ✦ and its tools → ✦ buttons: hide any button altogether. In the menu the buttons sit
// under their headings, the ones you used last on top.
import { SAY_GROUPS, SAY_ITEMS } from '@/lib/sayPrefs';

export default function SayButtons({ hide, onChange }: { hide?: string[]; onChange: (p: { sayHide?: string[] }) => void }) {
  const h = hide ?? [];
  const eye = (id: string) => onChange({ sayHide: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] });
  return (
    <div className="sb-list">
      <div className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>In the ✦ menu the buttons sit under these headings, the ones you used last on top. Hide takes a button out of the menu altogether.</div>
      {SAY_GROUPS.map((g) => (
        <div key={g} className="sb-group">
          <div className="sb-head">{g}</div>
          {SAY_ITEMS.filter((x) => x.group === g).map((x) => {
            const hid = h.includes(x.id);
            return (
              <div key={x.id} className={`sb-row${hid ? ' hid' : ''}`}>
                <span className="sb-ic" aria-hidden="true">{x.icon}</span>
                <span className="sb-name">{x.label}</span>
                <button type="button" className={`sb-eye${hid ? ' on' : ''}`} aria-pressed={hid} onClick={() => eye(x.id)}>{hid ? 'Hidden' : 'Shown'}</button>
              </div>
            );
          })}
        </div>
      ))}
      {h.length ? <button type="button" className="linklike" style={{ marginTop: 8 }} onClick={() => onChange({ sayHide: [] })}>Show them all again</button> : null}
    </div>
  );
}
