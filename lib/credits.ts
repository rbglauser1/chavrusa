import 'server-only';
import { db, getSettings } from './db';
import { OWNER_ID } from './config';

// Credits (Settings → Credits; off until Stripe and the table are set up). A learner buys credit with Stripe; what he
// uses is what the app already logs in cost_log (AI and voice), counted from when credits were switched on. His
// balance = what he bought − what he used since then. The price he pays per dollar of use is set by the markup
// (BILLING_MARKUP, default 3: $10 buys $3.33 of AI and voice).
export const markup = () => Math.max(1, Number(process.env.BILLING_MARKUP ?? 3) || 3);

let flag: { v: { on: boolean; since: string | null }; at: number } | null = null; // checked at most once a minute (every chat turn asks)
export function resetBilling() { flag = null; }
export async function billingOn(): Promise<{ on: boolean; since: string | null }> {
  if (flag && Date.now() - flag.at < 60_000) return flag.v;
  const s = await getSettings().catch(() => null);
  flag = { v: { on: !!s?.billing, since: s?.billingSince ?? null }, at: Date.now() };
  return flag.v;
}

// Every row of a query, a thousand at a time (Supabase hands back at most 1,000 rows per request: without this, a
// learner with more than 1,000 logged costs would be charged for only the first 1,000).
async function sumAll(table: 'credit_purchases' | 'cost_log', col: string, userId: string, since?: string): Promise<number> {
  let sum = 0;
  for (let from = 0; ; from += 1000) {
    let q = db().from(table).select(col).eq('user_id', userId);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + 999);
    if (error) throw new Error(table === 'credit_purchases' ? `Credits aren't set up yet (${error.message}). Run supabase/migrations/2026-11-09-credits.sql.` : error.message);
    const rows = (data ?? []) as unknown as Record<string, number | string>[];
    for (const r of rows) sum += Number(r[col]) || 0;
    if (rows.length < 1000) return sum;
  }
}

export async function balance(userId = OWNER_ID): Promise<{ bought: number; used: number; left: number }> {
  const { since } = await billingOn();
  const [bought, used] = await Promise.all([
    sumAll('credit_purchases', 'credit_usd', userId), // refunds are negative rows
    sumAll('cost_log', 'cost_usd', userId, since ?? '1970-01-01'),
  ]);
  return { bought, used, left: bought - used };
}

const OUT = 'You’re out of credit. Add credit in Settings → Credits.';
/** For the chat and the calls: when credits are on and none are left, the reason to stop (else null). */
export async function outOfCredit(userId = OWNER_ID): Promise<string | null> {
  const { on } = await billingOn();
  if (!on) return null;
  try { const b = await balance(userId); return b.left > 0 ? null : OUT; }
  catch { return null; } // not set up, or the database can't be reached: never block learning over it
}
/** For anything else the AI makes (maps, explanations, summaries, translations…): throws when out of credit. */
export async function needCredit(userId = OWNER_ID): Promise<void> {
  const out = await outOfCredit(userId);
  if (out) throw new Error(out);
}

/** A payment that went through. Counts once per Stripe session (a repeat of the same message adds nothing). */
export async function addPurchase(userId: string, paidUsd: number, stripeSession: string, paymentIntent?: string | null): Promise<boolean> {
  const row: Record<string, unknown> = { user_id: userId, paid_usd: paidUsd, credit_usd: paidUsd / markup(), stripe_session: stripeSession };
  if (paymentIntent) row.payment_intent = paymentIntent;
  let { error } = await db().from('credit_purchases').insert(row);
  // An older table without the payment_intent column: the credit still counts.
  if (error && /payment_intent/i.test(error.message)) { delete row.payment_intent; ({ error } = await db().from('credit_purchases').insert(row)); }
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  return !error;
}

/** A refund (whole or part) made in Stripe: the credit that payment bought is taken back in the same share.
 *  One row per charge, holding the total refunded so far (Stripe reports the running total). */
export async function addRefund(paymentIntent: string, chargeId: string, refundedUsd: number): Promise<boolean> {
  const { data, error } = await db().from('credit_purchases').select('user_id, paid_usd, credit_usd').eq('payment_intent', paymentIntent).gt('paid_usd', 0).limit(1);
  if (error) throw new Error(error.message);
  const orig = (data ?? [])[0] as { user_id: string; paid_usd: number | string; credit_usd: number | string } | undefined;
  if (!orig) return false; // not one of ours
  const paid = Number(orig.paid_usd), share = paid > 0 ? Math.min(1, refundedUsd / paid) : 0;
  const up = await db().from('credit_purchases').upsert(
    { user_id: orig.user_id, paid_usd: -Math.min(paid, refundedUsd), credit_usd: -Number(orig.credit_usd) * share, stripe_session: `refund:${chargeId}`, payment_intent: paymentIntent },
    { onConflict: 'stripe_session' });
  if (up.error) throw new Error(up.error.message);
  return true;
}
