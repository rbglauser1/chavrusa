import { NextRequest, NextResponse } from 'next/server';
import { OWNER_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Buy credit: a Stripe Checkout page (Stripe takes the card; the app never sees it). Amounts: $5, $10, $25, $50.
export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: 'Payments aren’t set up yet (STRIPE_SECRET_KEY is missing in Vercel).' }, { status: 500 });
  const { usd } = await req.json().catch(() => ({}));
  const amount = [5, 10, 25, 50].includes(Number(usd)) ? Number(usd) : 0;
  if (!amount) return NextResponse.json({ error: 'Choose an amount.' }, { status: 400 });
  const origin = req.nextUrl.origin;
  const f = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount * 100),
    'line_items[0][price_data][product_data][name]': `Chavrusa credit ($${amount})`,
    success_url: `${origin}/?credit=thanks`,
    cancel_url: `${origin}/?credit=cancelled`,
    'metadata[user_id]': OWNER_ID,
    'metadata[paid_usd]': String(amount),
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) return NextResponse.json({ error: d?.error?.message ?? 'Stripe didn’t start the payment.' }, { status: 502 });
  return NextResponse.json({ url: d.url });
}
