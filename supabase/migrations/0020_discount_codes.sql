-- The Rooiberg Wander — one-time discount codes (25 September 2026)
--
-- WHAT THIS ADDS
--   1. discount_codes: single-use codes worth 50% or 100% off a booking's whole total. Only a
--      SHA-256 hash of each code is stored, plus its last 4 characters as a support hint; the full
--      code exists once, in the output of scripts/discount-codes.mjs. RLS is on with no policies
--      and nothing is granted to anon or authenticated: only the server (service role) reads it.
--   2. bookings.discount_code_id / discount_percent / discount_cents: what a booking used.
--   3. reserve_discount_code(): the ONE way a code is claimed. A single UPDATE ... RETURNING, so
--      Postgres row locking guarantees two simultaneous checkouts can never both claim a code.
--
-- LIFECYCLE: available -> reserved (for the booking hold, plus grace) -> redeemed (payment
-- confirmed by the webhook, or immediately for a free booking). A reservation that lapses (an
-- abandoned checkout) can be claimed again; /booking/cancel releases it straight away. void is
-- set by hand (the script's `void` command) and is final.
--
-- Safe to re-run.

create table if not exists public.discount_codes (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  code_hash      text not null unique,
  code_hint      text not null,
  percent        int  not null check (percent in (50, 100)),
  -- Written as = any(array[...]) rather than in (...): scripts/verify-admin.mjs reads the bookings
  -- `status in (...)` CHECK out of the migrations by pattern, and must not pick this one up instead.
  status         text not null default 'available'
                   check (status = any (array['available', 'reserved', 'redeemed', 'void'])),
  booking_id     uuid references public.bookings (id) on delete set null,
  reserved_until timestamptz,
  redeemed_at    timestamptz,
  expires_at     timestamptz,
  note           text
);

alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;

comment on table public.discount_codes is
  'Single-use discount codes. Stores a SHA-256 hash of each code, never the code. RLS on with no '
  'policies: server (service role) access only. Claimed only via reserve_discount_code().';

alter table public.bookings
  add column if not exists discount_code_id uuid references public.discount_codes (id) on delete set null,
  add column if not exists discount_percent int not null default 0,
  add column if not exists discount_cents int not null default 0;

alter table public.bookings drop constraint if exists bookings_discount_percent_check;
alter table public.bookings
  add constraint bookings_discount_percent_check check (discount_percent in (0, 50, 100));

comment on column public.bookings.discount_percent is
  'Discount applied from a one-time code: 0, 50 or 100 (percent of the whole booking total).';
comment on column public.bookings.discount_cents is
  'Rands (in cents) taken off by the discount code. total_cents is the amount after discount.';

-- Claim a code for a booking hold. Returns the code's id and percent, or no row if the code is
-- unknown, already reserved (and not lapsed), redeemed, void or expired. The caller learns nothing
-- about WHICH of those it was, and neither does the guest.
create or replace function public.reserve_discount_code(p_hash text, p_until timestamptz)
returns table (id uuid, percent int)
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.discount_codes c
     set status = 'reserved',
         reserved_until = p_until,
         booking_id = null
   where c.code_hash = p_hash
     and (c.status = 'available' or (c.status = 'reserved' and c.reserved_until < now()))
     and (c.expires_at is null or c.expires_at > now())
  returning c.id, c.percent;
$$;

revoke all on function public.reserve_discount_code(text, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_discount_code(text, timestamptz) to service_role;

comment on function public.reserve_discount_code(text, timestamptz) is
  'Atomically claims an available (or lapsed-reserved), unexpired code by hash. Service role only.';
