-- Students who gave their school email on the board's one onboarding step,
-- so staff can email them news. Only the Worker reads or writes it: RLS on,
-- no policies. One row per email.
create table if not exists students (
  id         bigint generated always as identity primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.edu$' and length(email) <= 120)
);
create unique index if not exists students_email_once on students (lower(email));
alter table students enable row level security;
