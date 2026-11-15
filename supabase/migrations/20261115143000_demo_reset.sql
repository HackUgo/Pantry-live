-- demo_reset(): puts the board back to the starting shelf for a new demo.
-- Empties the log, scans, holds, follows, push subscriptions and PIN misses,
-- removes items added since, and sets the seven starting items back to their
-- first counts with no photos. Service role only (tools/reset.mjs calls it).
-- The log's append only trigger stops row deletes. Truncate is the owner's reset.
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
    out_at = null, photo_url = null, arrived_at = null, by_name = null
  where id in ('egg', 'milk', 'banana', 'canned-bean', 'rice', 'cereal', 'peanut-butter');
end $$;

revoke all on function demo_reset() from public, anon, authenticated;
grant execute on function demo_reset() to service_role;
