-- demo_reset() puts the seven starting items back exactly as seeded: name,
-- category, unit and count, with no photo, dates or arrival. A test can
-- change an item's category, and a reset should undo that too.
create or replace function demo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate events, scans, follows, push_subscriptions, reservations, pin_failures restart identity;
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
