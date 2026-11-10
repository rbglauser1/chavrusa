import { NextRequest, NextResponse } from 'next/server';
import { addContact } from '@/lib/contact';

export const runtime = 'nodejs';

// Contact us: anyone may send a message (no sign-in needed: the page is open to the public). Guarded against spam:
// a hidden field robots fill in, limits on length, and at most 5 messages an hour from one address.
const recent = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (String(b.website ?? '').trim()) return NextResponse.json({ ok: true }); // a robot: pretend it went through
  const text = String(b.text ?? '').trim();
  if (text.length < 3) return NextResponse.json({ error: 'Please write a message.' }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const now = Date.now(), list = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 5) return NextResponse.json({ error: 'Thanks — we already have your messages. Please try again later.' }, { status: 429 });
  recent.set(ip, [...list, now]);
  const email = String(b.email ?? '').trim().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 });
  try {
    await addContact({
      name: String(b.name ?? '').trim().slice(0, 120), email,
      topic: ['Question', 'Problem', 'Idea', 'Billing', 'Other'].includes(String(b.topic)) ? String(b.topic) : 'Other',
      text: text.slice(0, 5000),
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: `It didn’t send: ${(e as Error).message}` }, { status: 500 }); }
}
