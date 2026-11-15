-- Pantry Live baseline schema, as applied on Nov 15 2026 up to 13:00.
-- Every change after that is a dated file in supabase/migrations/, applied in order.
-- Pantry Live schema. Paste into Supabase: SQL Editor, New query, Run.
-- It can run more than once. It keeps the items and scans tables from the
-- first version (supabase-setup.sql) and their rows, and adds what is missing.
-- The browser only reads items and events and adds follows and push
-- subscriptions. Every other write goes through the Worker with the service
-- role key, which bypasses RLS.

-- Items: one row per product on the board.
create table if not exists items (
  id   text primary key,
  name text not null
);
alter table items add column if not exists category       text default 'Other';
alter table items add column if not exists unit           text default '';
alter table items add column if not exists qty            integer;
alter table items alter  column qty set default 0;
alter table items add column if not exists max_per_pickup integer not null default 2;
alter table items add column if not exists photo_url      text;
alter table items add column if not exists arrived_at     timestamptz;
alter table items add column if not exists by_name        text;
-- When the count last reached 0, for "Out since 4:02 pm".
alter table items add column if not exists out_at         timestamptz;
-- Kept from the first version so its rows still load: emoji, level, updated_at.

-- Scans: one row per published photo, so a scan can be undone.
create table if not exists scans (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
alter table scans add column if not exists photo_url text;
alter table scans add column if not exists items     jsonb;
alter table scans add column if not exists by_name   text;
alter table scans add column if not exists undone    boolean not null default false;
-- Kept from the first version: mode, notes.

-- Follows: one student waiting on one item, by email or push. Deleted once told.
create table if not exists follows (
  id           bigint generated always as identity primary key,
  item_id      text not null references items(id) on delete cascade,
  channel      text not null check (channel in ('email', 'push')),
  address      text,
  subscription jsonb,
  created_at   timestamptz not null default now(),
  check (
    (channel = 'email' and address is not null and length(address) between 3 and 254)
    or (channel = 'push' and subscription is not null)
  )
);
create index if not exists follows_item_idx on follows (item_id);

-- Push subscriptions: every phone that allowed pings.
create table if not exists push_subscriptions (
  id           bigint generated always as identity primary key,
  subscription jsonb not null unique,
  created_at   timestamptz not null default now()
);

-- Reservations: a bag held at the desk under a 4 character code.
create table if not exists reservations (
  id         bigint generated always as identity primary key,
  code       text not null unique,
  name       text not null,
  email      text not null,
  items      jsonb not null,
  status     text not null default 'held' check (status in ('held', 'done', 'released')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists reservations_created_idx on reservations (created_at);

-- Events: one line per step. The system page and donor numbers read from here.
-- Never put an email address or a phone number in detail.
create table if not exists events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  stage  text not null,
  actor  text,
  detail text
);
create index if not exists events_at_idx on events (at desc);

-- Row level security: on everywhere.
alter table items              enable row level security;
alter table scans              enable row level security;
alter table follows            enable row level security;
alter table push_subscriptions enable row level security;
alter table reservations       enable row level security;
alter table events             enable row level security;

-- Drop the first version's open write policies.
drop policy if exists "public read items"  on items;
drop policy if exists "demo write items"   on items;
drop policy if exists "demo update items"  on items;
drop policy if exists "demo insert scans"  on scans;

drop policy if exists "anon read items"        on items;
drop policy if exists "anon read events"       on events;
drop policy if exists "anon add follow"        on follows;
drop policy if exists "anon add subscription"  on push_subscriptions;

create policy "anon read items"       on items              for select to anon, authenticated using (true);
create policy "anon read events"      on events             for select to anon, authenticated using (true);
create policy "anon add follow"       on follows            for insert to anon, authenticated with check (true);
create policy "anon add subscription" on push_subscriptions for insert to anon, authenticated with check (true);

-- Storage: the scans bucket holds the photos students see. Public read,
-- anyone may upload a JPEG up to 5 MB, nobody but the Worker may change one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "anon upload scans" on storage.objects;
create policy "anon upload scans" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'scans');

-- Realtime: the board listens to items, the system page listens to events.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items') then
    alter publication supabase_realtime add table items;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table events;
  end if;
end $$;

-- Who was told about each scan, so an undo can send them a correction.
-- Holds emails and push subscriptions: service role only, like the rest of scans.
alter table scans add column if not exists told jsonb;

-- Scan in, atomically. Adds each count to its item (creating new items),
-- puts this photo on them, writes the scans row, and returns the scan id and,
-- per item, its count before and after plus what it looked like before, so an
-- undo can put it back. p_items: [{id, name, category, unit, count}].
create or replace function scan_in(p_items jsonb, p_photo text, p_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it      jsonb;
  old     items%rowtype;
  existed boolean;
  before  int;
  after   int;
  n       int;
  stamp   timestamptz := now();
  out     jsonb := '[]'::jsonb;
  scan_id bigint;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    n := (it->>'count')::int;
    select * into old from items where id = it->>'id' for update;
    existed := found;
    if existed then
      before := coalesce(old.qty, 0);
      after := before + n;
      update items set
        qty = after,
        photo_url = p_photo,
        arrived_at = stamp,
        by_name = p_by,
        out_at = null,
        category = coalesce(nullif(it->>'category', ''), category),
        unit = case when coalesce(unit, '') = '' then coalesce(it->>'unit', '') else unit end
      where id = it->>'id';
    else
      before := 0;
      after := n;
      insert into items (id, name, category, unit, qty, photo_url, arrived_at, by_name)
      values (it->>'id', it->>'name', coalesce(nullif(it->>'category', ''), 'Other'),
              coalesce(it->>'unit', ''), after, p_photo, stamp, p_by);
    end if;
    out := out || jsonb_build_object(
      'id', it->>'id',
      'name', case when existed then old.name else it->>'name' end,
      'unit', case when existed and coalesce(old.unit, '') <> '' then old.unit else coalesce(it->>'unit', '') end,
      'count', n, 'before', before, 'after', after, 'created', not existed,
      'prev_photo', case when existed then old.photo_url end,
      'prev_arrived', case when existed then old.arrived_at end,
      'prev_by', case when existed then old.by_name end,
      'prev_out', case when existed then old.out_at end
    );
  end loop;

  insert into scans (photo_url, items, by_name) values (p_photo, out, p_by) returning id into scan_id;
  return jsonb_build_object('scan_id', scan_id, 'at', stamp, 'items', out);
end $$;

-- Undo a scan within 60 seconds (75 allowed for a slow phone). Takes each
-- count back off (never below 0), restores the photo and arrival it replaced,
-- and removes items this scan created. Returns the items as they now stand.
create or replace function undo_scan(p_scan bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s     scans%rowtype;
  it    jsonb;
  cur   items%rowtype;
  left_ int;
  out   jsonb := '[]'::jsonb;
begin
  select * into s from scans where id = p_scan for update;
  if not found then raise exception 'scan not found' using errcode = 'P0002'; end if;
  if s.undone then raise exception 'already undone' using errcode = 'P0001'; end if;
  if s.created_at < now() - interval '75 seconds' then raise exception 'too late' using errcode = 'P0001'; end if;

  for it in select * from jsonb_array_elements(s.items) loop
    select * into cur from items where id = it->>'id' for update;
    if not found then continue; end if;
    left_ := greatest(0, coalesce(cur.qty, 0) - (it->>'count')::int);
    if (it->>'created')::boolean and left_ = 0 then
      delete from items where id = cur.id;
      out := out || jsonb_build_object('id', cur.id, 'name', cur.name, 'qty', null, 'removed', true);
    else
      update items set
        qty = left_,
        photo_url = case when photo_url = s.photo_url then it->>'prev_photo' else photo_url end,
        arrived_at = case when photo_url = s.photo_url then (it->>'prev_arrived')::timestamptz else arrived_at end,
        by_name = case when photo_url = s.photo_url then it->>'prev_by' else by_name end,
        out_at = case when left_ = 0 then coalesce((it->>'prev_out')::timestamptz, now()) else null end
      where id = cur.id;
      out := out || jsonb_build_object('id', cur.id, 'name', cur.name, 'qty', left_, 'removed', false);
    end if;
  end loop;

  update scans set undone = true where id = s.id;
  return jsonb_build_object('scan_id', s.id, 'items', out, 'told', coalesce(s.told, '[]'::jsonb));
end $$;

revoke all on function scan_in(jsonb, text, text) from public, anon, authenticated;
revoke all on function undo_scan(bigint) from public, anon, authenticated;
grant execute on function scan_in(jsonb, text, text) to service_role;
grant execute on function undo_scan(bigint) to service_role;

-- A retried Reserve tap carries the same request id and gets the same hold back.
alter table reservations add column if not exists request_id text unique;

-- Reserve, atomically. Checks the day's cap (reservations since p_since that
-- were not released), each item's per pickup limit and its count, takes the
-- items off the board, and writes the reservation under p_code. Any failure
-- raises and nothing changes. p_items: [{id, n}].
create or replace function reserve_items(
  p_code text, p_name text, p_email text, p_items jsonb,
  p_since timestamptz, p_cap int, p_request text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it    jsonb;
  cur   items%rowtype;
  n     int;
  taken int;
  out   jsonb := '[]'::jsonb;
  r     reservations%rowtype;
begin
  if p_request is not null then
    select * into r from reservations where request_id = p_request;
    if found then
      if lower(r.email) <> lower(p_email) then raise exception 'request mismatch' using errcode = 'P0001'; end if;
      return jsonb_build_object('code', r.code, 'name', r.name, 'items', r.items, 'created_at', r.created_at, 'repeat', true);
    end if;
  end if;

  -- One reservation at a time, so the cap cannot be overrun by two phones.
  perform pg_advisory_xact_lock(4242);
  select count(*) into taken from reservations where created_at >= p_since and status <> 'released';
  if taken >= p_cap then raise exception 'cap' using errcode = 'P0001'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    n := (it->>'n')::int;
    select * into cur from items where id = it->>'id' for update;
    if not found then raise exception 'gone:%', it->>'id' using errcode = 'P0001'; end if;
    if n > coalesce(cur.max_per_pickup, 2) then raise exception 'limit:%', cur.name using errcode = 'P0001'; end if;
    if coalesce(cur.qty, 0) < n then raise exception 'short:%', cur.name using errcode = 'P0001'; end if;
    update items set
      qty = qty - n,
      out_at = case when qty - n = 0 then now() else out_at end
    where id = cur.id;
    out := out || jsonb_build_object(
      'id', cur.id, 'name', cur.name, 'category', cur.category, 'unit', cur.unit,
      'n', n, 'left', cur.qty - n);
  end loop;

  insert into reservations (code, name, email, items, request_id)
  values (p_code, p_name, lower(p_email), out, p_request)
  returning * into r;
  return jsonb_build_object('code', r.code, 'name', r.name, 'items', out, 'created_at', r.created_at, 'repeat', false);
end $$;

-- Release a held reservation: every item goes back on the board.
-- A student passes their email, which must match. Staff pass null (the Worker
-- has already checked the PIN). Returns the items and their new counts.
create or replace function release_reservation(p_code text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r     reservations%rowtype;
  it    jsonb;
  after int;
  out   jsonb := '[]'::jsonb;
begin
  select * into r from reservations where code = upper(p_code) for update;
  if not found or (p_email is not null and lower(r.email) <> lower(p_email)) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if r.status <> 'held' then raise exception 'closed:%', r.status using errcode = 'P0001'; end if;

  for it in select * from jsonb_array_elements(r.items) loop
    update items set
      qty = coalesce(qty, 0) + (it->>'n')::int,
      out_at = null
    where id = it->>'id'
    returning qty into after;
    out := out || jsonb_build_object('id', it->>'id', 'name', it->>'name', 'n', (it->>'n')::int, 'after', after);
  end loop;

  update reservations set status = 'released', closed_at = now() where id = r.id;
  return jsonb_build_object('code', r.code, 'name', r.name, 'items', out);
end $$;

revoke all on function reserve_items(text, text, text, jsonb, timestamptz, int, text) from public, anon, authenticated;
revoke all on function release_reservation(text, text) from public, anon, authenticated;
grant execute on function reserve_items(text, text, text, jsonb, timestamptz, int, text) to service_role;
grant execute on function release_reservation(text, text) to service_role;
