'use client';
// Words opened right where you are (in the sugya map, or under a line's Sources): a halacha, a pasuk, a meforesh, a
// Midrash. Each piece in Hebrew with its English: Sefaria's when it has one, else a translation by the AI (made once
// per piece and kept for good, app/api/translate).
import { useEffect, useState } from 'react';
import { Dibbur } from './Dibbur';

export type Linked = { title: string; ref: string; line?: number };

const clean = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
export function RefText({ refs, onOpen }: { refs: string[]; onOpen?: () => void }) {
  const [text, setText] = useState<{ he: string[]; en: string[] } | null | 'none'>(null);
  const [ai, setAi] = useState<Record<number, string>>({});
  useEffect(() => {
    let gone = false;
    fetch(`/api/commentary?refs=${encodeURIComponent(refs.join('|'))}`).then((r) => r.json())
      .then((d) => {
        if (gone) return;
        if (!d.he?.length) { setText('none'); return; }
        const he = d.he as string[], en = (d.en ?? []) as string[];
        setText({ he, en });
        he.forEach((h, i) => {
          if (clean(en[i] ?? '') || !clean(h) || i >= 16) return;
          setAi((a) => ({ ...a, [i]: 'busy' }));
          fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean(h) }) })
            .then((r) => r.json()).then((t) => { if (!gone) setAi((a) => ({ ...a, [i]: t.translation ? String(t.translation) : 'failed' })); })
            .catch(() => { if (!gone) setAi((a) => ({ ...a, [i]: 'failed' })); });
        });
      }).catch(() => { if (!gone) setText('none'); });
    return () => { gone = true; };
  }, [refs.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const usedAi = Object.values(ai).some((v) => v !== 'busy' && v !== 'failed');
  return (
    <div className="smap-link-text">
      {!text ? <div className="muted">Opening…</div>
        : text === 'none' ? <div className="muted">Couldn’t open it.</div>
        : text.he.map((h, i) => {
          const en = clean(text.en[i] ?? ''), mine = ai[i];
          return (
            <div key={i}>
              <div className="he" dir="rtl"><Dibbur text={clean(h)} /></div>
              {en ? <div className="en">{en}</div>
                : mine === 'busy' ? <div className="en muted">Translating…</div>
                : mine && mine !== 'failed' ? <div className="en">{mine}</div>
                : null}
            </div>
          );
        })}
      {usedAi && <div className="muted smap-ai-note">English translated by the AI.</div>}
      {onOpen && <button className="linklike" onClick={onOpen}>Learn it in the Sefer ↗</button>}
    </div>
  );
}

// A halacha or a pasuk: tap to open its words right here.
export function LinkRow({ x, onOpen }: { x: Linked; onOpen?: (ref: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`smap-link ${open ? 'open' : ''}`}>
      <button className="smap-link-name" onClick={() => setOpen((o) => !o)}>{x.title}<span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
      {open && <RefText refs={[x.ref]} onOpen={onOpen ? () => onOpen(x.ref) : undefined} />}
    </li>
  );
}

