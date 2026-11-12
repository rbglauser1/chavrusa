'use client';
// "Source sheet" (📄 at the top of the Sefer; Settings → Extras): one printable page of the amud / perek for a shiur, a
// chabura or Shabbos: the big picture and the topics with their steps (the sugya map), who holds what, the text with
// its English (numbered lines), the halacha path of each line, and your notes and marks. Print it, or save it as a
// PDF from the print screen. The map and the table are made once and kept, so after the first time it costs nothing.
import type { SourceData } from '@/lib/db';
import { stripNikud } from '@/lib/hebrew';

type Groups = { halacha: { title: string; ref: string }[] };
type Map = { overview?: string; topics?: { title: string; line: number; intro?: string; steps?: { line: number; kind: string; who: string; summary: string }[]; takeaway?: string }[] };
type Views = { disputes?: { question: string; line: number; halacha: string; sides: { who: string; holds: string; reason: string; source: string }[] }[] };
type Note = { n: number; text: string; on?: string; quote?: string };

const esc = (t: string) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const plain = (t: string) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/⟦([^⟧]+)⟧/g, '$1');

export async function openSourceSheet(src: SourceData, opts: { withMap: boolean; nikud: boolean; lines?: Record<string, Groups> }) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<p style="font:16px Georgia,serif;margin:40px">Putting the source sheet together…</p>');
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
  if (map.overview) parts.push(`<h2>The big picture</h2><p>${esc(plain(map.overview))}</p>`);
  if (map.topics?.length) {
    parts.push('<h2>The sugya, step by step</h2>');
    map.topics.forEach((t, k) => {
      parts.push(`<h3>${k + 1}. ${esc(t.title)} <small>line ${t.line}</small></h3>${t.intro ? `<p>${esc(plain(t.intro))}</p>` : ''}`);
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
    parts.push(`<tr><td class="n">${n}</td><td><div class="he" dir="rtl">${he(h)}</div>${src.en[i] ? `<div class="en">${esc(plain(src.en[i]))}</div>` : ''}${hal.length ? `<div class="hal">⚖ ${hal.slice(0, 4).map((x) => esc(x.title)).join(' · ')}</div>` : ''}${mine.map((x) => `<div class="note">${x.on === 'a mark' ? `■ ${esc(x.text.replace(/^Marked: /, ''))}: <span dir="auto">“${esc(x.quote ?? '')}”</span>` : `✎ ${x.quote ? `<span dir="auto">“${esc(x.quote)}”</span> ` : ''}${esc(x.text).replace(/\n/g, '<br>')}`}</div>`).join('')}</td></tr>`);
  });
  parts.push('</table>');
  const css = 'body{font:11.5pt/1.5 Georgia,serif;max-width:760px;margin:28px auto;padding:0 18px;color:#111}h1{font-weight:400;font-size:20pt;margin:0 0 4px}h2{font:600 13pt Georgia,serif;margin:22px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}h3{font:600 11.5pt Georgia,serif;margin:12px 0 4px}h3 small,.n{color:#888;font:9pt Arial,sans-serif}table{border-collapse:collapse;width:100%;margin:4px 0 8px}td,th{vertical-align:top;padding:4px 6px;text-align:left}.steps td{border-top:1px solid #e3e3e3}.steps .k{width:24%;font:600 9pt Arial,sans-serif;color:#444}.steps .n,.text .n{width:22px;text-align:right}.who th{background:#f2f2f2;font:600 10pt Arial,sans-serif;border:1px solid #ccc}.who td{border:1px solid #ccc}.text td{border-top:1px solid #eee}.he{font:14pt/1.6 "Frank Ruhl Libre","Times New Roman",serif;text-align:right}.en{color:#333}.hal{font:9pt Arial,sans-serif;color:#555;margin-top:2px}.note{font:10pt Arial,sans-serif;background:#fffbe6;border-left:3px solid #e0b400;padding:3px 6px;margin-top:3px}.take{margin:4px 0 10px}.foot{margin-top:24px;font:9pt Arial,sans-serif;color:#777}@media print{body{margin:0 auto}h2{break-after:avoid}tr{break-inside:avoid}}';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ref)} · source sheet</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500&display=swap"><style>${css}</style></head><body>${parts.join('')}<p class="foot">The map, the steps and the table were made by AI and may contain mistakes; check them inside. For halacha in practice, ask your rav. Texts from Sefaria; see Credits and licenses in the app.</p></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.focus();
  window.setTimeout(() => { try { w.print(); } catch { /* the learner can print from the browser */ } }, 700);
}
