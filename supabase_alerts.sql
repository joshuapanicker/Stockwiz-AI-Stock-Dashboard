-- Run this in Supabase SQL Editor → New Query
-- Adds the alerts table to your existing Stockbrook schema

create table if not exists user_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  alert_type   text not null,  -- 'price_below' | 'price_above' | 'meets_buy_criteria' | 'meets_watch_criteria'
  threshold    numeric,        -- price threshold (null for criteria-based alerts)
  enabled      boolean default true,
  last_triggered timestamptz,
  created_at   timestamptz default now()
);

alter table user_alerts enable row level security;
create policy "users can manage own alerts"
  on user_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast per-user queries
create index if not exists user_alerts_user_id_idx on user_alerts(user_id);
