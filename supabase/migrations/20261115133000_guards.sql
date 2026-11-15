-- Guards the rules in the database, not only in the Worker:
-- a retried publish never adds twice, a student never follows the same item
-- twice, follows hold sane values, and the event log refuses edits.

-- Publish carries a request id. A repeat gets the first result back.
alter table scans add column if not exists request_id text unique;

drop function if exists scan_in(jsonb, text, text);
create or replace function scan_in(p_items jsonb, p_photo text, p_by text, p_request text default null)
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
  prior   scans%rowtype;
  scan_id bigint;
begin
  if p_request is not null then
    select * into prior from scans where request_id = p_request;
    if found then
      return jsonb_build_object('scan_id', prior.id, 'at', prior.created_at, 'items', prior.items,
                                'told', coalesce(prior.told, '[]'::jsonb), 'repeat', true);
    end if;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    n := (it->>'count')::int;
    select * into old from items where id = it->>'id' for update;
    existed := found;
    if existed then
      before := coalesce(old.qty, 0);
      after := before + n;
      update items set
        qty = after, photo_url = p_photo, arrived_at = stamp, by_name = p_by, out_at = null,
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
      'prev_out', case when existed then old.out_at end);
  end loop;

  insert into scans (photo_url, items, by_name, request_id) values (p_photo, out, p_by, p_request)
  returning id into scan_id;
  return jsonb_build_object('scan_id', scan_id, 'at', stamp, 'items', out, 'repeat', false);
end $$;

revoke all on function scan_in(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function scan_in(jsonb, text, text, text) to service_role;

-- One follow per student per item.
create unique index if not exists follows_email_once on follows (item_id, lower(address)) where channel = 'email';
create unique index if not exists follows_push_once on follows (item_id, (subscription->>'endpoint')) where channel = 'push';

-- Follows hold an email that looks like one, or a push subscription of sane size.
alter table follows drop constraint if exists follows_email_shape;
alter table follows add constraint follows_email_shape
  check (channel <> 'email' or address ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
alter table follows drop constraint if exists follows_push_size;
alter table follows add constraint follows_push_size
  check (subscription is null or length(subscription::text) < 2000);
alter table push_subscriptions drop constraint if exists push_subscriptions_size;
alter table push_subscriptions add constraint push_subscriptions_size check (length(subscription::text) < 2000);

-- The event log is append only: the database refuses updates and deletes.
-- (A full reset for a new demo is `truncate events`, run by the owner.)
create or replace function events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'events are append only';
end $$;
drop trigger if exists events_no_change on events;
create trigger events_no_change before update or delete on events
  for each row execute function events_append_only();
