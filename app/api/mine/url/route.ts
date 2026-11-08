import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// My Seforim: a web page's words, for him to keep and learn (an article, a shiur page). Only the readable text:
// headings, paragraphs and list items; menus, scripts and styles are left out.
const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export async function POST(req: NextRequest) {
  const { url } = await req.json().catch(() => ({}));
  let u: URL;
  try { u = new URL(String(url ?? '')); if (!/^https?:$/.test(u.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: 'That doesn’t look like a web address.' }, { status: 400 }); }
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChavrusaApp/1.0)', Accept: 'text/html,text/plain' } }).finally(() => clearTimeout(t));
    if (!res.ok) return NextResponse.json({ error: `The site answered ${res.status}.` }, { status: 502 });
    const type = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    if (/text\/plain/.test(type)) return NextResponse.json({ title: u.hostname, text: raw });
    const title = decode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? u.hostname).replace(/\s+/g, ' ').trim());
    let body = raw.replace(/<(script|style|noscript|nav|header|footer|aside|form|svg)[\s\S]*?<\/\1>/gi, ' ');
    const main = body.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0];
    if (main && main.length > 500) body = main;
    const text = decode(body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section)>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) return NextResponse.json({ error: 'No readable text was found on that page (it may need a browser to show it).' }, { status: 422 });
    return NextResponse.json({ title, text });
  } catch (e) {
    return NextResponse.json({ error: `Couldn’t open that page: ${(e as Error).message}` }, { status: 502 });
  }
}
