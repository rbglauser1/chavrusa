import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { addPurchase } from '@/lib/credits';

export const runtime = 'nodejs';

// Stripe tells the app a payment went through (checkout.session.completed). The message is checked against
// STRIPE_WEBHOOK_SECRET (Stripe's signature), so no one else can add credit. Each payment counts once.
function verified(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=') as [string, string]));
  const t = parts.t, v1 = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const want = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return v1.some((sig) => sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)));
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not set up' }, { status: 500 });
  const raw = await req.text();
  if (!verified(raw, req.headers.get('stripe-signature'), secret)) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const ev = JSON.parse(raw);
  if (ev.type === 'checkout.session.completed' && ev.data?.object?.payment_status === 'paid') {
    const o = ev.data.object;
    const paid = Number(o.metadata?.paid_usd ?? (o.amount_total ?? 0) / 100);
    await addPurchase(String(o.metadata?.user_id ?? 'owner'), paid, String(o.id));
  }
  return NextResponse.json({ received: true });
}
