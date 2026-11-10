import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// My Seforim: a web page's words, for him to keep and learn (an article, a shiur page). Only the readable text:
// headings, paragraphs and list items; menus, scripts and styles are left out.
const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// Only real outside web sites: never this server itself, a local network, or a cloud's internal addresses.
function outside(u: URL): boolean {
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') && !h.includes(':')) return false;                 // "localhost", bare names
  if (/\.(local|internal|localhost)$/.test(h)) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)) return false;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false;                    // a number standing for an address
  if (h.includes(':')) return false;                                      // raw IPv6 addresses
  return true;
}
const MAX_BYTES = 4_000_000;

export async function POST(req: NextRequest) {
  const { url } = await req.json().catch(() => ({}));
  let u: URL;
  try { u = new URL(String(url ?? '')); if (!/^https?:$/.test(u.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: 'That doesn’t look like a web address.' }, { status: 400 }); }
  if (!outside(u)) return NextResponse.json({ error: 'That address can’t be opened from here.' }, { status: 400 });
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15_000);
    // Follow redirects by hand (up to 5), checking each stop, so a site can't send the server somewhere internal.
    let res: Response | null = null;
    for (let hop = 0; hop < 6; hop++) {
      res = await fetch(u, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChavrusaApp/1.0)', Accept: 'text/html,text/plain' } });
      const to = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!to) break;
      u = new URL(to, u);
      if (!/^https?:$/.test(u.protocol) || !outside(u)) { clearTimeout(t); return NextResponse.json({ error: 'That address can’t be opened from here.' }, { status: 400 }); }
      res = null;
    }
    if (!res) { clearTimeout(t); return NextResponse.json({ error: 'That page redirects too many times.' }, { status: 502 }); }
    if (!res.ok) { clearTimeout(t); return NextResponse.json({ error: `The site answered ${res.status}.` }, { status: 502 }); }
    const type = res.headers.get('content-type') ?? '';
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) { clearTimeout(t); return NextResponse.json({ error: 'That page is too large to bring in.' }, { status: 413 }); }
    const raw = (await res.text().finally(() => clearTimeout(t))).slice(0, MAX_BYTES);
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
