-- Migration: sold_positions table
-- Run this in your Supabase SQL editor to enable sell history.

create table if not exists public.sold_positions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  symbol        text not null,
  sell_date     date not null,
  sell_price    numeric(12, 4) not null,
  shares        numeric(12, 4) not null default 1,
  buy_price     numeric(12, 4),
  buy_date      date,
  realized_gain numeric(14, 4),   -- (sell_price - buy_price) * shares
  realized_pct  numeric(10, 4),   -- percentage gain/loss
  created_at    timestamptz not null default now()
);

-- Index for fast user history queries
create index if not exists sold_positions_user_id_idx
  on public.sold_positions (user_id, sell_date desc);

-- Row Level Security
alter table public.sold_positions enable row level security;

create policy "Users can view own sold positions"
  on public.sold_positions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sold positions"
  on public.sold_positions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own sold positions"
  on public.sold_positions for delete
  using (auth.uid() = user_id);
