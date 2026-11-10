// A meforesh's piece with its dibbur hamaschil (the words quoted from the text, before the dash) in bold, as in a
// printed sefer: "כמאן כרבי עקיבא - דאמר…" → **כמאן כרבי עקיבא** - דאמר…
// Only when the dash comes early (within the first 140 letters); otherwise the piece is shown as it is.
const DASH = /\s[-–—]\s|\s?[–—]\s?/;

export function Dibbur({ text }: { text: string }) {
  const m = text.match(DASH);
  if (!m || m.index === undefined || m.index < 2 || m.index > 140) return <>{text}</>;
  return (<><b className="dibbur">{text.slice(0, m.index)}</b>{text.slice(m.index)}</>);
}
