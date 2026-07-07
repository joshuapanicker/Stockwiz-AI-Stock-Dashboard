-- Run in Supabase SQL Editor
-- AI credit metering + user-supplied Anthropic API keys

create table if not exists user_ai_usage (
  user_id     uuid not null references auth.users(id) on delete cascade,
  period      text not null,              -- 'YYYY-MM'
  tokens_used bigint not null default 0,
  updated_at  timestamptz default now(),
  primary key (user_id, period)
);

alter table user_ai_usage enable row level security;
-- Users may see their own usage (read-only); writes happen server-side
-- via the service role, which bypasses RLS.
create policy "users can read own ai usage"
  on user_ai_usage for select
  using (auth.uid() = user_id);

create table if not exists user_api_keys (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  anthropic_key text not null,
  updated_at    timestamptz default now()
);

-- RLS enabled with NO policies: only the service role (backend) can touch
-- this table. Keys are never readable through the anon/authenticated API.
alter table user_api_keys enable row level security;
