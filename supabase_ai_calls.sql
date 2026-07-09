-- Run in Supabase SQL Editor
-- AI call log — every buy/sell verdict the AI issues, logged once per
-- symbol+action+day, used to build an honest public track record
-- (core/track_record.py, GET /api/track-record).

create table if not exists ai_calls (
  id             bigserial primary key,
  symbol         text not null,
  action         text not null,             -- 'buy' | 'sell'
  decision       text not null,             -- 'YES' | 'NO'
  price_at_call  numeric,
  spy_at_call    numeric,
  rules_met      int,
  rules_total    int,
  call_date      date not null default (now() at time zone 'utc')::date,
  created_at     timestamptz not null default now(),
  unique (symbol, action, call_date)
);

create index if not exists ai_calls_created_idx on ai_calls (created_at desc);

-- RLS enabled with NO policies: only the service role (backend) writes and
-- reads this table. The aggregated track record is served through our own
-- API endpoint, not queried directly by the frontend.
alter table ai_calls enable row level security;
