// Sefaria's English: the literal translation in bold, the added explanation in plain (softer) type.
// The marks come from lib/sefaria.ts (stripKeepBold): \u0002 starts bold, \u0003 ends it.
export function BoldEn({ text }: { text: string }) {
  const parts: { t: string; b: boolean }[] = [];
  let bold = false;
  for (const seg of text.split(/([\u0002\u0003])/)) {
    if (seg === '\u0002') bold = true;
    else if (seg === '\u0003') bold = false;
    else if (seg) parts.push({ t: seg, b: bold });
  }
  return <>{parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i} className="en-x">{p.t}</span>))}</>;
}
