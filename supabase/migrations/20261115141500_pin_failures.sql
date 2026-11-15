-- Wrong staff PINs, by hashed address, so guessing the 4 digit PIN locks out
-- after 10 tries in 10 minutes no matter which Worker copy answers.
-- Service role only: RLS on with no policies.
create table if not exists pin_failures (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists pin_failures_ip_at on pin_failures (ip_hash, at desc);
alter table pin_failures enable row level security;
