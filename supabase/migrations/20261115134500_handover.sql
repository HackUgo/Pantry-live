-- Hand over at the desk. Staff tick what the student took. Anything left
-- unticked goes back on the board. The reservation closes as done, and its
-- items record what was handed over.
create or replace function handover_reservation(p_code text, p_given jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      reservations%rowtype;
  it     jsonb;
  given  boolean;
  after  int;
  kept   jsonb := '[]'::jsonb;
  back   jsonb := '[]'::jsonb;
  closed jsonb := '[]'::jsonb;
begin
  select * into r from reservations where code = upper(p_code) for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if r.status <> 'held' then raise exception 'closed:%', r.status using errcode = 'P0001'; end if;

  for it in select * from jsonb_array_elements(r.items) loop
    given := p_given ? (it->>'id');
    if given then
      kept := kept || jsonb_build_object('id', it->>'id', 'name', it->>'name', 'n', (it->>'n')::int);
    else
      update items set qty = coalesce(qty, 0) + (it->>'n')::int, out_at = null
      where id = it->>'id' returning qty into after;
      back := back || jsonb_build_object('id', it->>'id', 'name', it->>'name', 'n', (it->>'n')::int, 'after', after);
    end if;
    closed := closed || (it || jsonb_build_object('given', given));
  end loop;

  update reservations set status = 'done', closed_at = now(), items = closed where id = r.id;
  return jsonb_build_object('code', r.code, 'name', r.name, 'given', kept, 'back', back, 'total', jsonb_array_length(r.items));
end $$;

revoke all on function handover_reservation(text, jsonb) from public, anon, authenticated;
grant execute on function handover_reservation(text, jsonb) to service_role;
