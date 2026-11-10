// Under every text: where it comes from and its license, as Sefaria gives it (each version of a text on Sefaria has
// its own license, and the credit goes to its source). See also the Credits page (app/credits).
import type { SourceData } from '@/lib/db';

const short = (l?: string) => (l ? l.replace(/^CC-BY-NC$/i, 'CC BY-NC').replace(/^CC-BY$/i, 'CC BY').replace(/^CC-BY-SA$/i, 'CC BY-SA') : '');
export default function TextCredit({ src }: { src: SourceData }) {
  if (/^Mine /.test(src.ref)) return <div className="text-credit">Your own text.</div>;
  const he = src.credit?.he, en = src.credit?.en;
  const part = (label: string, c?: { title: string; license?: string }) => (c ? <span>{label}: {c.title}{c.license ? ` (${short(c.license)})` : ''}</span> : null);
  return (
    <div className="text-credit">
      Text from <a href={src.url || 'https://www.sefaria.org'} target="_blank" rel="noreferrer">Sefaria</a>
      {he && <> · {part('Hebrew', he)}</>}
      {en && <> · {part('English', en)}</>}
      {' · '}<a href="/credits">Credits and licenses</a>
    </div>
  );
}
