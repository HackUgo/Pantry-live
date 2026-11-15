-- Lockdown after the security pass. The browser keeps only reads of items
-- and events; every write goes through the Worker.
-- 1. No public uploads: the Worker stores scan photos with the service role.
drop policy if exists "anon upload scans" on storage.objects;
-- 2. No public follows or push subscriptions: the Worker checks and limits them.
drop policy if exists "anon add follow" on follows;
drop policy if exists "anon add subscription" on push_subscriptions;

-- 3. Per address limits that hold across every Worker copy.
create table if not exists api_hits (
  id      bigint generated always as identity primary key,
  bucket  text not null,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists api_hits_lookup on api_hits (bucket, ip_hash, at desc);
alter table api_hits enable row level security;

-- 4. One waiting hold per email.
create unique index if not exists reservations_one_hold_per_email
  on reservations (lower(email)) where status = 'held';

-- The demo reset also clears the limits.
create or replace function demo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate events, scans, follows, push_subscriptions, reservations, pin_failures, api_hits restart identity;
  delete from items where id not in ('egg', 'milk', 'banana', 'canned-bean', 'rice', 'cereal', 'peanut-butter');
  update items as i set
    name = s.name, category = s.category, unit = s.unit, qty = s.qty,
    out_at = null, photo_url = null, arrived_at = null, by_name = null, best_by = null
  from (values
    ('egg', 'Eggs', 'Dairy & Eggs', 'eggs', 0),
    ('milk', 'Milk', 'Dairy & Eggs', 'jugs', 1),
    ('banana', 'Banana', 'Produce', 'bananas', 0),
    ('canned-bean', 'Canned Beans', 'Canned', 'cans', 0),
    ('rice', 'Rice', 'Grains & Pasta', 'bags', 0),
    ('cereal', 'Cereal', 'Grains & Pasta', 'boxes', 3),
    ('peanut-butter', 'Peanut Butter', 'Protein', 'jars', 8)
  ) as s(id, name, category, unit, qty)
  where i.id = s.id;
end $$;
revoke all on function demo_reset() from public, anon, authenticated;
grant execute on function demo_reset() to service_role;
