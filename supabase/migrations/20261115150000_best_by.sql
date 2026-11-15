-- Best by dates. The reader reads a printed best by, use by or expiry date
-- off the photo when one is readable, the volunteer confirms it, and the item
-- keeps the soonest date on the shelf. When an item was Out, the new batch's
-- date replaces the old one. Undo puts the previous date back.
alter table items add column if not exists best_by date;

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
        best_by = case
          when (it->>'best_by') is null then case when before <= 0 then null else best_by end
          when before <= 0 or best_by is null then (it->>'best_by')::date
          else least(best_by, (it->>'best_by')::date) end,
        unit = case when coalesce(unit, '') = '' then coalesce(it->>'unit', '') else unit end
      where id = it->>'id';
    else
      before := 0;
      after := n;
      insert into items (id, name, category, unit, qty, photo_url, arrived_at, by_name, best_by)
      values (it->>'id', it->>'name', coalesce(nullif(it->>'category', ''), 'Other'),
              coalesce(it->>'unit', ''), after, p_photo, stamp, p_by, (it->>'best_by')::date);
    end if;
    out := out || jsonb_build_object(
      'id', it->>'id',
      'name', case when existed then old.name else it->>'name' end,
      'unit', case when existed and coalesce(old.unit, '') <> '' then old.unit else coalesce(it->>'unit', '') end,
      'count', n, 'before', before, 'after', after, 'created', not existed, 'best_by', it->>'best_by',
      'prev_best_by', case when existed then old.best_by end,
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

-- Undo restores the date the scan replaced, along with the photo and arrival.
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
        best_by = case when it ? 'prev_best_by' then (it->>'prev_best_by')::date else best_by end,
        out_at = case when left_ = 0 then coalesce((it->>'prev_out')::timestamptz, now()) else null end
      where id = cur.id;
      out := out || jsonb_build_object('id', cur.id, 'name', cur.name, 'qty', left_, 'removed', false);
    end if;
  end loop;

  update scans set undone = true where id = s.id;
  return jsonb_build_object('scan_id', s.id, 'items', out, 'told', coalesce(s.told, '[]'::jsonb));
end $$;

revoke all on function undo_scan(bigint) from public, anon, authenticated;
grant execute on function undo_scan(bigint) to service_role;

-- demo_reset() also clears dates.
create or replace function demo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate events, scans, follows, push_subscriptions, reservations, pin_failures restart identity;
  delete from items where id not in ('egg', 'milk', 'banana', 'canned-bean', 'rice', 'cereal', 'peanut-butter');
  update items set
    qty = case id when 'milk' then 1 when 'cereal' then 3 when 'peanut-butter' then 8 else 0 end,
    out_at = null, photo_url = null, arrived_at = null, by_name = null, best_by = null
  where id in ('egg', 'milk', 'banana', 'canned-bean', 'rice', 'cereal', 'peanut-butter');
end $$;
