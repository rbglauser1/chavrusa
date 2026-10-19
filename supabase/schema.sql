-- AI Chavrusa database schema
-- Run once in Supabase: SQL Editor > New query > paste all of this > Run.
-- Every table has user_id so other learners can be added later; for now it is always 'owner'.

create extension if not exists "pgcrypto";

-- Learner settings (one row per user, stored as JSON so new settings need no migration)
create table if not exists settings (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- What the Chavrusa remembers about the learner
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('instruction', 'observation', 'note')),
  content text not null,
  scope text,                      -- e.g. 'Gemara only'; null = applies everywhere
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists memories_user_idx on memories (user_id, active);

-- Learning sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id, updated_at desc);

-- Messages inside a session
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb,                      -- model used, mode, etc.
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on messages (session_id, created_at);

-- Every source the Chavrusa retrieved in a session (feeds the Sefer panel and history)
create table if not exists session_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  ref text not null,
  he_ref text,
  data jsonb not null,             -- hebrew lines, english lines, translation title, link
  created_at timestamptz not null default now()
);
create index if not exists session_sources_idx on session_sources (session_id, created_at);

-- Real cost of every exchange (used later to set credit prices)
create table if not exists cost_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id uuid references sessions(id) on delete set null,
  kind text not null default 'chat',   -- chat | translate | voice | search
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cost_log_user_idx on cost_log (user_id, created_at desc);

-- The approved-source list. You control this, not the AI.
--   kind: work | author | translation | site
--   status: approved | blocked
--   lean: general | litvish | chassidish | sephardi | modern_orthodox | dati_leumi
-- Classic texts (Chazal, Rishonim, earlier Acharonim) are approved as a group by the code.
-- Works written after the cutoff year (see lib/config.ts) must be approved here by title or author.
-- 'blocked' always wins, even for older works.
create table if not exists approved_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('work', 'author', 'translation', 'site')),
  name text not null,              -- Sefaria title, author name, translation version title (partial match), or domain
  status text not null default 'approved' check (status in ('approved', 'blocked')),
  lean text not null default 'general',
  notes text,
  created_at timestamptz not null default now()
);

-- Starter list. Review and edit freely.
insert into approved_sources (kind, name, status, lean, notes) values
  ('translation', 'William Davidson', 'approved', 'general', 'Koren Steinsaltz Talmud translation'),
  ('translation', 'Koren', 'approved', 'general', 'Koren Jerusalem Bible and other Koren editions'),
  ('translation', 'Rosenbaum and A.M. Silbermann', 'approved', 'general', 'Rashi on Chumash translation'),
  ('translation', 'Metsudah', 'approved', 'general', 'Metsudah translations'),
  ('work', 'Mishnah Berurah', 'approved', 'litvish', null),
  ('work', 'Aruch HaShulchan', 'approved', 'litvish', null),
  ('work', 'Kaf HaChayim', 'approved', 'sephardi', null),
  ('work', 'Ben Ish Chai', 'approved', 'sephardi', null),
  ('work', 'Chafetz Chaim', 'approved', 'general', null),
  ('work', 'Ahavat Chesed', 'approved', 'general', null),
  ('work', 'Likutei Moharan', 'approved', 'chassidish', null),
  ('work', 'Tanya', 'approved', 'chassidish', null),
  ('work', 'Sefat Emet', 'approved', 'chassidish', null),
  ('work', 'Michtav MeEliyahu', 'approved', 'litvish', null),
  ('work', 'Peninei Halakhah', 'approved', 'dati_leumi', 'Rav Eliezer Melamed. Remove if you prefer.'),
  ('work', 'Igrot Moshe', 'approved', 'general', 'Not fully on Sefaria')
on conflict do nothing;

-- Lock everything down: only the server (service role key) can read or write.
alter table settings enable row level security;
alter table memories enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table session_sources enable row level security;
alter table cost_log enable row level security;
alter table approved_sources enable row level security;
