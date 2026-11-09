'use client';
// Progress and plans (Settings → Extras), on Home: what he has learned, his goals, daf yomi, and a siyum.
import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/config';

type Book = { book: string; unit: 'amud' | 'perek'; learned: string[]; total: number | null; lastAt: string; next: string | null };
type Plan = NonNullable<Settings['plans']>[number];

const daysLeft = (by?: string) => (by ? Math.max(1, Math.ceil((Date.parse(by) - Date.now()) / 86_400_000)) : null);

export default function Progress({ settings, onOpen, onSettings }: { settings: Settings; onOpen: (ref: string) => void; onSettings: (patch: Partial<Settings>) => void }) {
  const [data, setData] = useState<{ books: Book[]; dafYomi: { ref: string; display: string } | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [book, setBook] = useState('');
  const [by, setBy] = useState('');
  useEffect(() => { fetch('/api/progress').then((r) => r.json()).then(setData).catch(() => setData({ books: [], dafYomi: null })); }, []);
  const plans = settings.plans ?? [];
  const savePlans = (p: Plan[]) => onSettings({ plans: p });
  const bookOf = (name: string) => data?.books.find((b) => b.book.toLowerCase() === name.toLowerCase());
  const siyumim = (data?.books ?? []).filter((b) => b.total && b.learned.length >= b.total);
  const dafDone = (ref: string) => { const b = data?.books.find((x) => ref.startsWith(x.book + ' ')); const d = ref.match(/ (\d+)$/)?.[1]; return !!(b && d && b.learned.includes(`${b.book} ${d}a`) && b.learned.includes(`${b.book} ${d}b`)); };

  return (
    <div className="hx-card">
      <div className="hx-head static"><span>Progress</span><button className="linklike" onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : '+ Goal'}</button></div>
      {!data && <div className="muted hx-wait">Counting…</div>}

      {siyumim.map((b) => (
        <div key={b.book} className="hx-siyum">🎉 Siyum on <b>{b.book}</b>! Mazel tov: all {b.total} {b.unit === 'amud' ? 'amudim' : 'perakim'} learned.</div>
      ))}

      {plans.map((p) => {
        if (p.kind === 'dafyomi') {
          const d = data?.dafYomi;
          return (
            <div key={p.id} className="hx-plan">
              <div className="hx-sub">Daf yomi{d ? ` · today: ${d.display}` : ''}{d && dafDone(d.ref) ? ' · ✓ learned' : ''}</div>
              <div className="hx-row">{d && <button className="btn" onClick={() => onOpen(`${d.ref}a`)}>Learn today’s daf</button>}<button className="linklike" onClick={() => savePlans(plans.filter((x) => x.id !== p.id))}>Remove</button></div>
            </div>
          );
        }
        const b = p.book ? bookOf(p.book) : undefined;
        const done = b?.learned.length ?? 0, total = b?.total ?? null;
        const left = total ? Math.max(0, total - done) : null;
        const days = daysLeft(p.by);
        const perDay = left !== null && days ? Math.ceil((left / days) * 10) / 10 : null;
        return (
          <div key={p.id} className="hx-plan">
            <div className="hx-sub">Goal: finish {p.book}{p.by ? ` by ${new Date(p.by).toLocaleDateString()}` : ''}</div>
            {total ? <div className="hx-bar"><i style={{ width: `${Math.min(100, (done / total) * 100)}%` }} /></div> : null}
            <div className="muted hx-small">{done}{total ? ` of ${total}` : ''} {b?.unit === 'amud' ? 'amudim' : 'learned'}{perDay !== null && left ? ` · about ${perDay} a day to make it` : left === 0 ? ' · done!' : ''}</div>
            <div className="hx-row">{b?.next ? <button className="btn" onClick={() => onOpen(b.next!)}>Learn next: {b.next}</button> : !b && p.book ? <button className="btn" onClick={() => onOpen(`${p.book} 2a`)}>Start</button> : null}<button className="linklike" onClick={() => savePlans(plans.filter((x) => x.id !== p.id))}>Remove</button></div>
          </div>
        );
      })}

      {adding && (
        <div className="hx-add">
          <label className="muted hx-small">Finish a masechta or sefer</label>
          <input list="hx-books" placeholder="Yoma, Bereishis…" value={book} onChange={(e) => setBook(e.target.value)} />
          <datalist id="hx-books">{(data?.books ?? []).map((b) => <option key={b.book} value={b.book} />)}</datalist>
          <label className="muted hx-small">By</label>
          <input type="date" value={by} onChange={(e) => setBy(e.target.value)} />
          <div className="hx-row">
            <button className="btn" disabled={!book.trim()} onClick={() => { savePlans([...plans, { id: Date.now().toString(36), kind: 'book', book: book.trim(), by: by || undefined, start: new Date().toISOString() }]); setAdding(false); setBook(''); setBy(''); }}>Add goal</button>
            {!plans.some((p) => p.kind === 'dafyomi') && <button className="btn ghost" onClick={() => { savePlans([...plans, { id: 'dafyomi', kind: 'dafyomi', start: new Date().toISOString() }]); setAdding(false); }}>Follow daf yomi</button>}
          </div>
        </div>
      )}

      {data && data.books.filter((b) => !plans.some((p) => p.book?.toLowerCase() === b.book.toLowerCase())).slice(0, 4).map((b) => (
        <div key={b.book} className="hx-book">
          <div className="hx-row between"><span>{b.book}</span><span className="muted hx-small">{b.learned.length}{b.total ? ` / ${b.total}` : ''} {b.unit === 'amud' ? 'amudim' : 'perakim'}</span></div>
          {b.total ? <div className="hx-bar"><i style={{ width: `${Math.min(100, (b.learned.length / b.total) * 100)}%` }} /></div> : null}
        </div>
      ))}
      {data && !data.books.length && !plans.length && <div className="muted hx-wait">As you learn, what you finish shows here. Tap “+ Goal” to set one.</div>}
    </div>
  );
}
