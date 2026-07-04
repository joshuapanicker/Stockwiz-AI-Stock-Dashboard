-- Run in Supabase SQL Editor

create table if not exists plaid_connections (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  access_token     text not null,
  institution_name text default '',
  updated_at       timestamptz default now()
);

alter table plaid_connections enable row level security;
create policy "users can manage own plaid connection"
  on plaid_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
