'use client';
import { Fragment, ReactNode } from 'react';
import { hasHebrew } from '@/lib/hebrew';

// Minimal, safe formatting: paragraphs, bullet lists, **bold**, *italic*. Hebrew runs get the Hebrew font.
function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{hebrewRuns(p.slice(2, -2), k)}</strong>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={k}>{hebrewRuns(p.slice(1, -1), k)}</em>;
    return <Fragment key={k}>{hebrewRuns(p, k)}</Fragment>;
  });
}

function hebrewRuns(text: string, key: string): ReactNode[] {
  // Wrap stretches of Hebrew letters (with nikud, spaces, punctuation between) in a span.
  const re = /([֐-׿][֐-׿\s"'׳״.,:;\-–()]*[֐-׿])/g;
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={`${key}-h${i++}`} className="heb" dir="rtl">{m[1]}</span>);
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Split text into plain parts and quote blocks (lines starting with ">").
function segments(text: string): { quote: boolean; text: string }[] {
  const out: { quote: boolean; text: string }[] = [];
  for (const line of text.split('\n')) {
    const isQ = /^\s*>/.test(line);
    const body = isQ ? line.replace(/^\s*>\s?/, '') : line;
    const last = out[out.length - 1];
    if (last && last.quote === isQ) last.text += '\n' + body;
    else out.push({ quote: isQ, text: body });
  }
  return out;
}

function Quote({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <blockquote className="quote">
      {lines.map((l, i) => {
        const heb = (l.match(/[\u05D0-\u05EA]/g)?.length ?? 0) > l.replace(/\s/g, '').length * 0.4;
        return heb
          ? <div key={i} className="q-he" dir="rtl">{l}</div>
          : <div key={i} className="q-en" dir="auto">{inline(l, `q${i}`)}</div>;
      })}
    </blockquote>
  );
}

export function Formatted({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((seg, si) => seg.quote
        ? <Quote key={si} text={seg.text} />
        : <Plain key={si} text={seg.text} />)}
    </>
  );
}

function Plain({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li} dir="auto">{inline(l.replace(/^\s*[-•*]\s+/, ''), `${bi}-${li}`)}</li>)}</ul>;
        }
        const mostlyHebrew = hasHebrew(b) && (b.match(/[א-ת]/g)?.length ?? 0) > b.length * 0.5;
        return (
          <p key={bi} dir={mostlyHebrew ? 'rtl' : 'auto'}>
            {lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${li}`)}</Fragment>)}
          </p>
        );
      })}
    </>
  );
}
