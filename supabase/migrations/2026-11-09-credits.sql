-- Credits for selling the app (Settings → Credits, off until set up). Run once in Supabase: SQL Editor > New query >
-- paste this > Run. Safe to run again.
create table if not exists credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  paid_usd numeric(12, 2) not null,       -- what the learner paid
  credit_usd numeric(12, 6) not null,     -- what it buys, in the app's cost terms (paid / markup)
  stripe_session text unique,             -- each Stripe payment counts once
  created_at timestamptz not null default now()
);
create index if not exists credit_purchases_user_idx on credit_purchases (user_id, created_at desc);
-- Only the server (service key) touches it.
alter table credit_purchases enable row level security;
