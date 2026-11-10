import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { addPurchase, addRefund } from '@/lib/credits';
import { OWNER_ID } from '@/lib/config';

export const runtime = 'nodejs';

// Stripe tells the app a payment went through (checkout.session.completed). The message is checked against
// STRIPE_WEBHOOK_SECRET (Stripe's signature), so no one else can add credit. Each payment counts once. A refund
// made in Stripe (charge.refunded) takes its credit back.
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
  let ev: { type?: string; data?: { object?: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { ev = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  const o = ev.data?.object;
  try {
    // Paid: right away (cards), or later for a payment that takes time to clear (async_payment_succeeded).
    if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && o?.payment_status === 'paid') {
      // What Stripe actually took, in dollars (not what the app asked for).
      const paid = String(o.currency ?? 'usd').toLowerCase() === 'usd' ? Number(o.amount_total ?? 0) / 100 : 0;
      if (paid > 0) await addPurchase(String(o.metadata?.user_id ?? OWNER_ID), paid, String(o.id), typeof o.payment_intent === 'string' ? o.payment_intent : null);
    }
    // A refund made in Stripe takes the credit back (add "charge.refunded" to the webhook's events).
    if (ev.type === 'charge.refunded' && o?.payment_intent) {
      await addRefund(String(o.payment_intent), String(o.id), Number(o.amount_refunded ?? 0) / 100);
    }
  } catch (e) {
    // Not recorded: answer with an error so Stripe sends it again later.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
