-- The Rooiberg Wander — initial schema (Part 9.3 / 11.3 / 11.5)
-- bookings + inquiries + blocked_dates, a sanitised availability VIEW, RLS default-deny,
-- and a daterange overlap exclusion constraint to prevent double-booking.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  start_date          date not null,                 -- Day 1 (arrival)
  end_date            date not null,                 -- Day 4 (departure)
  group_size          int  not null check (group_size between 1 and 10),
  residency           text not null check (residency in ('local','international')),
  lead_name           text not null,
  lead_email          text not null,
  status              text not null default 'pending'
                        check (status in ('pending','confirmed','cancelled')),
  total_cents         int  not null,                 -- VAT-inclusive total
  amount_due_cents    int  not null,                 -- charged now (full payment by default)
  amount_paid_cents   int,
  currency            text not null default 'ZAR',
  processor           text not null default 'paystack',
  processor_reference text not null unique,
  processor_txn_id    text,
  hold_expires_at     timestamptz,                   -- pending hold; null once resolved
  confirmed_at        timestamptz
);

create table if not exists public.inquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  email        text not null,
  group_size   text,
  target_dates text,
  message      text
);

-- Operator-blocked windows (maintenance, private holds, etc.)
create table if not exists public.blocked_dates (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  start_date date not null,
  end_date   date not null,
  reason     text
);

-- ---------------------------------------------------------------------------
-- Double-booking prevention: no two active bookings may overlap on their window.
-- (Predicate must be immutable, so it covers pending+confirmed; expired pending holds
--  are filtered from the availability view and should be swept to 'cancelled'.)
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (daterange(start_date, end_date, '[]') with &&)
  where (status in ('pending','confirmed'));

create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_reference_idx on public.bookings (processor_reference);

-- ---------------------------------------------------------------------------
-- Sanitised availability view — exposes ONLY date ranges, never PII.
-- Active = confirmed, or pending with an unexpired hold, or operator-blocked.
-- ---------------------------------------------------------------------------
create or replace view public.unavailable_windows as
  select start_date, end_date from public.bookings
    where status = 'confirmed'
       or (status = 'pending' and hold_expires_at > now())
  union all
  select start_date, end_date from public.blocked_dates;

-- ---------------------------------------------------------------------------
-- Row Level Security — default deny. The service-role key (server only) bypasses RLS;
-- the public anon role may read ONLY the availability view (no policies => no table access).
-- ---------------------------------------------------------------------------
alter table public.bookings      enable row level security;
alter table public.inquiries     enable row level security;
alter table public.blocked_dates enable row level security;

revoke all on public.bookings      from anon, authenticated;
revoke all on public.inquiries     from anon, authenticated;
revoke all on public.blocked_dates from anon, authenticated;

grant select on public.unavailable_windows to anon, authenticated;
