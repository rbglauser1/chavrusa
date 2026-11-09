import 'server-only';
import { db, getSettings } from './db';
import { OWNER_ID } from './config';

// Credits (Settings → Credits; off until Stripe and the table are set up). A learner buys credit with Stripe; what he
// uses is what the app already logs in cost_log (AI and voice), counted from when credits were switched on. His
// balance = what he bought − what he used since then. The price he pays per dollar of use is set by the markup
// (BILLING_MARKUP, default 3: $10 buys $3.33 of AI and voice).
export const markup = () => Math.max(1, Number(process.env.BILLING_MARKUP ?? 3) || 3);

let flag: { v: { on: boolean; since: string | null }; at: number } | null = null; // checked at most once a minute (every chat turn asks)
export async function billingOn(): Promise<{ on: boolean; since: string | null }> {
  if (flag && Date.now() - flag.at < 60_000) return flag.v;
  const s = await getSettings().catch(() => null);
  flag = { v: { on: !!s?.billing, since: s?.billingSince ?? null }, at: Date.now() };
  return flag.v;
}

export async function balance(userId = OWNER_ID): Promise<{ bought: number; used: number; left: number }> {
  const { since } = await billingOn();
  const [p, c] = await Promise.all([
    db().from('credit_purchases').select('credit_usd').eq('user_id', userId),
    db().from('cost_log').select('cost_usd').eq('user_id', userId).gte('created_at', since ?? '1970-01-01'),
  ]);
  if (p.error) throw new Error(`Credits aren't set up yet (${p.error.message}). Run supabase/migrations/2026-11-09-credits.sql.`);
  const bought = (p.data ?? []).reduce((a, r: { credit_usd: number | string }) => a + Number(r.credit_usd), 0);
  const used = (c.data ?? []).reduce((a, r: { cost_usd: number | string }) => a + Number(r.cost_usd), 0);
  return { bought, used, left: bought - used };
}

/** For the chat and the calls: when credits are on and none are left, the reason to stop (else null). */
export async function outOfCredit(userId = OWNER_ID): Promise<string | null> {
  const { on } = await billingOn();
  if (!on) return null;
  try { const b = await balance(userId); return b.left > 0 ? null : 'You’re out of credit. Add credit in Settings → Credits.'; }
  catch { return null; } // not set up: never block learning over it
}

export async function addPurchase(userId: string, paidUsd: number, stripeSession: string): Promise<boolean> {
  const { error } = await db().from('credit_purchases').insert({ user_id: userId, paid_usd: paidUsd, credit_usd: paidUsd / markup(), stripe_session: stripeSession });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  return !error;
}
