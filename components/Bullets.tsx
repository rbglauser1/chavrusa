// The big picture and the topic intros as bullet points (the sugya map and the source sheet; Nov 11: points, not
// paragraphs). The AI writes "- " for a main point and "  - " for a smaller point under it. Maps made before that are
// a paragraph: each sentence becomes a point.
export type Point = { text: string; sub: string[] };

export function toPoints(text: string): Point[] {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const lines = t.split('\n').filter((l) => l.trim());
  if (lines.some((l) => /^\s*[-•*]\s+/.test(l))) {
    const out: Point[] = [];
    for (const l of lines) {
      const m = l.match(/^(\s*)[-•*]\s+(.*)$/);
      const body = (m ? m[2] : l).trim();
      const deep = m ? m[1].replace(/\t/g, '  ').length >= 2 : false;
      if (deep && out.length) out[out.length - 1].sub.push(body); else out.push({ text: body, sub: [] });
    }
    return out;
  }
  // A paragraph: a point for each sentence.
  return (t.match(/[^.!?]+[.!?]+["”’)]?|[^.!?]+$/g) ?? [t]).map((x) => x.trim()).filter(Boolean).map((x) => ({ text: x, sub: [] }));
}

/** Mostly Hebrew letters: the list runs right to left (bullets on the right, text right-aligned; Nov 14). */
export const isHebrewText = (t: string) => { const he = (t.match(/[\u05D0-\u05EA]/g) ?? []).length, en = (t.match(/[A-Za-z]/g) ?? []).length; return he > en; };

export function Bullets({ text, className }: { text: string; className?: string }) {
  const pts = toPoints(text);
  if (!pts.length) return null;
  const rtl = isHebrewText(text);
  return (
    <ul className={`pts ${className ?? ''}`} dir={rtl ? 'rtl' : undefined}>
      {pts.map((p, i) => <li key={i} dir="auto">{p.text}{p.sub.length > 0 && <ul>{p.sub.map((x, j) => <li key={j} dir="auto">{x}</li>)}</ul>}</li>)}
    </ul>
  );
}

/** The same, as HTML (the source sheet). `esc` makes the text safe. */
export function bulletsHtml(text: string, esc: (s: string) => string): string {
  const pts = toPoints(text);
  return pts.length ? `<ul class="pts"${isHebrewText(text) ? ' dir="rtl"' : ''}>${pts.map((p) => `<li>${esc(p.text)}${p.sub.length ? `<ul>${p.sub.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` : '';
}

// "Good to know" lines (Nov 16): "term: what it means". Each line reads in the direction of its explanation, not of
// its first word, so an English line that starts with a Hebrew term stays left to right (the term is isolated).
export function GoodToKnow({ items }: { items: string[] }) {
  return (
    <ul className="gtk">
      {items.map((b, i) => {
        const m = b.match(/^([^:]{1,40}):\s*(.*)$/);
        const body = m ? m[2] : b;
        const rtl = isHebrewText(body);
        return <li key={i} dir={rtl ? 'rtl' : 'ltr'}>{m ? <><b><bdi>{m[1]}</bdi></b>: {m[2]}</> : b}</li>;
      })}
    </ul>
  );
}
