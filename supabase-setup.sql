-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists items (
  id         text primary key,          -- slug of the name, e.g. "canned-bean"
  name       text not null,
  emoji      text default '📦',
  category   text default 'Other',
  unit       text default '',
  qty        integer,                    -- null = not counted
  level      text not null default 'some' check (level in ('out','low','some','plenty')),
  updated_at timestamptz not null default now()
);

create table if not exists scans (
  id         bigint generated always as identity primary key,
  mode       text,
  items      jsonb,
  notes      text,
  created_at timestamptz not null default now()
);

-- Demo access rules: anyone can read the board; the website can write.
-- (Real volunteer login is a "what's next" item.)
alter table items enable row level security;
alter table scans enable row level security;
drop policy if exists "public read items" on items;
drop policy if exists "demo write items" on items;
drop policy if exists "demo update items" on items;
drop policy if exists "demo insert scans" on scans;
create policy "public read items"  on items for select using (true);
create policy "demo write items"   on items for insert with check (true);
create policy "demo update items"  on items for update using (true) with check (true);
create policy "demo insert scans"  on scans for insert with check (true);

-- Turn on live updates for the board.
alter publication supabase_realtime add table items;
