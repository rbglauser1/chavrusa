'use client';
// "Source sheet" (📄 at the top of the Sefer; Settings → Extras): one printable page of the amud / perek for a shiur, a
// chabura or Shabbos: the big picture and the topics with their steps (the sugya map), who holds what, the text with
// its English (numbered lines), the halacha path of each line, and your notes and marks. Print it, or save it as a
// PDF from the print screen. The map and the table are made once and kept, so after the first time it costs nothing.
import type { SourceData } from '@/lib/db';
import { stripNikud } from '@/lib/hebrew';
import { bulletsHtml } from './Bullets';

type Groups = { halacha: { title: string; ref: string }[] };
type Map = { overview?: string; topics?: { title: string; line: number; intro?: string; steps?: { line: number; kind: string; who: string; summary: string }[]; takeaway?: string }[] };
type Views = { disputes?: { question: string; line: number; halacha: string; sides: { who: string; holds: string; reason: string; source: string }[] }[] };
type Note = { n: number; text: string; on?: string; quote?: string };

const esc = (t: string) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const plain = (t: string) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/⟦([^⟧]+)⟧/g, '$1');

/** The source sheet as a page (shown inside the app by components/SheetView.tsx, where it can be printed). */
export async function buildSourceSheet(src: SourceData, opts: { withMap: boolean; nikud: boolean; lines?: Record<string, Groups> }): Promise<string> {
  const ref = src.ref;
  const get = (u: string) => fetch(u).then((r) => r.json()).catch(() => ({}));
  const [map, views, notesD] = await Promise.all([
    opts.withMap ? get(`/api/map?ref=${encodeURIComponent(ref)}`) as Promise<Map> : Promise.resolve({} as Map),
    opts.withMap ? get(`/api/map/views?ref=${encodeURIComponent(ref)}`) as Promise<Views> : Promise.resolve({} as Views),
    get(`/api/notes?ref=${encodeURIComponent(ref)}`) as Promise<{ notes?: Note[] }>,
  ]);
  const notes = (notesD.notes ?? []).slice().sort((a, b) => a.n - b.n);
  const he = (h: string) => esc(opts.nikud ? plain(h) : stripNikud(plain(h)));
  const parts: string[] = [];
  parts.push(`<h1><span dir="rtl">${esc(src.heRef ?? '')}</span> · ${esc(ref)}</h1>`);
  parts.push('<p class="ainote">AI makes mistakes · not rabbinically approved · the map, the steps and the table were made by AI: check them inside; for halacha, ask your rav</p>');
  if (map.overview) parts.push(`<h2>The big picture</h2>${bulletsHtml(plain(map.overview), esc)}`);
  if (map.topics?.length) {
    parts.push('<h2>The sugya, step by step</h2>');
    map.topics.forEach((t, k) => {
      parts.push(`<h3>${k + 1}. ${esc(t.title)} <small>line ${t.line}</small></h3>${t.intro ? bulletsHtml(plain(t.intro), esc) : ''}`);
      if (t.steps?.length) parts.push(`<table class="steps">${t.steps.map((s) => `<tr><td class="k">${esc(s.kind)}${s.who ? ` · ${esc(s.who)}` : ''}</td><td>${esc(plain(s.summary))}</td><td class="n">${s.line}</td></tr>`).join('')}</table>`);
      if (t.takeaway) parts.push(`<p class="take"><b>The point:</b> ${esc(plain(t.takeaway))}</p>`);
    });
  }
  if (views.disputes?.length) {
    parts.push('<h2>Who holds what</h2>');
    for (const d of views.disputes) {
      parts.push(`<h3>${esc(d.question)} <small>line ${d.line}</small></h3><table class="who"><tr>${d.sides.map((s) => `<th>${esc(s.who)}</th>`).join('')}</tr><tr>${d.sides.map((s) => `<td>${esc(s.holds)}${s.reason ? `<br><i>Why:</i> ${esc(s.reason)}` : ''}${s.source ? `<br><i>From:</i> ${esc(s.source)}` : ''}</td>`).join('')}</tr></table>${d.halacha ? `<p><i>The Gemara’s ruling:</i> ${esc(d.halacha)}</p>` : ''}`);
    }
  }
  parts.push('<h2>The text</h2><table class="text">');
  src.he.forEach((h, i) => {
    const n = i + 1;
    const mine = notes.filter((x) => x.n === n);
    const hal = opts.lines?.[String(n)]?.halacha ?? [];
    parts.push(`<tr><td class="n">${n}</td><td><div class="he" dir="rtl">${he(h)}</div>${src.en[i] ? `<div class="en">${esc(plain(src.en[i]))}</div>` : ''}${hal.length ? `<div class="hal">⚖ ${hal.slice(0, 4).map((x) => esc(x.title)).join(' · ')}</div>` : ''}${mine.map((x) => `<div class="note">${x.on === 'a mark' ? `■ ${esc(x.text.replace(/^Marked: /, ''))}: <span dir="auto">“${esc(x.quote ?? '')}”</span>` : `✎ ${x.quote ? `<span dir="auto">“${esc(x.quote)}”</span> ` : ''}${esc(x.on === 'a chat with the AI' && x.text.length > 500 ? `${x.text.slice(0, 500).replace(/\s+\S*$/, '')}… (the whole chat is in your Notebook)` : x.text).replace(/\n/g, '<br>')}`}</div>`).join('')}</td></tr>`);
  });
  parts.push('</table>');
  // On the phone: large, easy to read; on paper: a normal printed page.
  const css = 'body{font:18px/1.6 Georgia,serif;margin:0 auto;padding:18px 18px 60px;max-width:760px;color:#111;-webkit-text-size-adjust:100%}h1{font-weight:400;font-size:26px;margin:0 0 6px}h2{font:600 20px Georgia,serif;margin:28px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}h3{font:600 18px Georgia,serif;margin:16px 0 6px}h3 small,.n{color:#888;font:13px Arial,sans-serif}table{border-collapse:collapse;width:100%;margin:6px 0 10px}td,th{vertical-align:top;padding:6px 6px;text-align:left}.steps td{border-top:1px solid #e3e3e3}.steps .k{width:28%;font:600 13px Arial,sans-serif;color:#444}.steps .n,.text .n{width:24px;text-align:right}.who th{background:#f2f2f2;font:600 15px Arial,sans-serif;border:1px solid #ccc}.who td{border:1px solid #ccc}.text td{border-top:1px solid #eee}.he{font:24px/1.6 "Frank Ruhl Libre","Times New Roman",serif;text-align:right}.en{color:#333}.hal{font:14px Arial,sans-serif;color:#555;margin-top:4px}.note{font:15px Arial,sans-serif;background:#fffbe6;border-left:3px solid #e0b400;padding:4px 8px;margin-top:4px}.take{margin:6px 0 12px}.pts{margin:4px 0 10px;padding-left:22px}.pts li{margin:3px 0}.pts ul{margin:2px 0;padding-left:20px;list-style:circle;font-size:.95em;color:#333}.ainote{font:13px/1.4 Arial,sans-serif;color:#777;margin:0 0 6px}.foot{margin-top:28px;font:13px Arial,sans-serif;color:#777}@media print{body{font-size:11.5pt;padding:0}.ainote{font-size:9pt}h1{font-size:20pt}h2{font-size:13pt;break-after:avoid}h3{font-size:11.5pt}.he{font-size:14pt}.note,.hal,.foot{font-size:9.5pt}.steps .k{font-size:9pt}tr{break-inside:avoid}}';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ref)} · source sheet</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500&display=swap"><style>${css}</style></head><body>${parts.join('')}<p class="foot">Texts from Sefaria; see Credits and licenses in the app.</p></body></html>`;
  return html;
}
