'use client';
// Nov 27: Settings → The AI → The ✦ and its tools → ✦ buttons: pick the 3 shown first (★), and hide any button
// altogether. The rest sit under More ▾, under their headings, in the order you last used them.
import { SAY_GROUPS, SAY_ITEMS, SAY_TOP_DEFAULT } from '@/lib/sayPrefs';

export default function SayButtons({ top, hide, onChange }: { top?: string[]; hide?: string[]; onChange: (p: { sayTop?: string[]; sayHide?: string[] }) => void }) {
  const t = top?.length ? top : SAY_TOP_DEFAULT, h = hide ?? [];
  const star = (id: string) => {
    if (t.includes(id)) { onChange({ sayTop: t.filter((x) => x !== id) }); return; }
    onChange({ sayTop: [...t, id].slice(-3), sayHide: h.filter((x) => x !== id) }); // a 4th star takes the place of the oldest
  };
  const eye = (id: string) => (h.includes(id) ? onChange({ sayHide: h.filter((x) => x !== id) }) : onChange({ sayHide: [...h, id], sayTop: t.filter((x) => x !== id) }));
  return (
    <div className="sb-list">
      <div className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>★ = your top 3, shown first. The rest open under More ▾, under their headings, the ones you used last on top. Hide takes a button out of the menu altogether.</div>
      <div className="sb-top">{t.map((id) => { const c = SAY_ITEMS.find((x) => x.id === id); return c ? <span key={id} className="sb-chip"><span aria-hidden="true">{c.icon}</span> {c.label}</span> : null; })}</div>
      {SAY_GROUPS.map((g) => (
        <div key={g} className="sb-group">
          <div className="sb-head">{g}</div>
          {SAY_ITEMS.filter((x) => x.group === g).map((x) => {
            const hid = h.includes(x.id), on = t.includes(x.id);
            return (
              <div key={x.id} className={`sb-row${hid ? ' hid' : ''}`}>
                <span className="sb-ic" aria-hidden="true">{x.icon}</span>
                <span className="sb-name">{x.label}</span>
                <button type="button" className={`sb-star${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${x.label}: top 3`} onClick={() => star(x.id)}>{on ? '★' : '☆'}</button>
                <button type="button" className={`sb-eye${hid ? ' on' : ''}`} aria-pressed={hid} onClick={() => eye(x.id)}>{hid ? 'Hidden' : 'Shown'}</button>
              </div>
            );
          })}
        </div>
      ))}
      {(top?.length || h.length) ? <button type="button" className="linklike" style={{ marginTop: 8 }} onClick={() => onChange({ sayTop: undefined, sayHide: [] })}>Back to the start (Simple, In my words, Ask; nothing hidden)</button> : null}
    </div>
  );
}
