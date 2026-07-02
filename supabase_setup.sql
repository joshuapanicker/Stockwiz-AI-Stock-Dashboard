-- Run this in Supabase SQL Editor → New Query

-- ── Portfolio holdings ────────────────────────────────────────────────────
create table if not exists portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  buy_date    text not null,
  buy_price   numeric,
  notes       text default '',
  created_at  timestamptz default now(),
  unique (user_id, symbol)
);

-- Row-level security: users can only see/modify their own holdings
alter table portfolios enable row level security;
create policy "users can manage own holdings"
  on portfolios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Per-user screening criteria ───────────────────────────────────────────
create table if not exists user_criteria (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  criteria    jsonb not null,
  updated_at  timestamptz default now()
);

alter table user_criteria enable row level security;
create policy "users can manage own criteria"
  on user_criteria for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Investment profile ────────────────────────────────────────────────────
create table if not exists user_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  risk_tolerance    text default 'moderate',   -- conservative / moderate / aggressive
  preferred_sectors text[] default '{}',
  hold_duration     text default 'medium',      -- short / medium / long
  max_position_usd  numeric default 5000,
  tax_sensitive     boolean default false,
  notes             text default '',
  updated_at        timestamptz default now()
);

alter table user_profiles enable row level security;
create policy "users can manage own profile"
  on user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Add shares column to portfolios (run if table already exists)
alter table portfolios add column if not exists shares numeric default 1;
